import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { lotTraceApi, recallCsv, type LotTraceRecord } from '../api/lotTraceApi';

const querySchema = z.object({ kind: z.enum(['lots', 'parcels']), id: z.uuid() });
const recallSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
export function LotTracePanel({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations('LotTrace'),
    { can } = useAccess();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { kind: can('inventory.trace.forward') ? 'lots' : 'parcels', id: '' },
  });
  const [query, setQuery] = useState<{ kind: 'lots' | 'parcels'; id: string }>(),
    [cursor, setCursor] = useState<string>(),
    [attempt, setAttempt] = useState(0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      <form
        onSubmit={handleSubmit((v) => {
          setQuery(v);
          setCursor(undefined);
          setAttempt((n) => n + 1);
        })}
        className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"
      >
        <Select
          label={t('direction')}
          {...register('kind')}
          options={[
            ...(can('inventory.trace.forward') ? [{ value: 'lots', label: t('forward') }] : []),
            { value: 'parcels', label: t('backward') },
          ]}
        />
        <Input
          label={t('reference')}
          {...register('id')}
          error={errors.id ? t('invalidId') : undefined}
        />
        <Button type="submit" className="self-end">
          {t('search')}
        </Button>
      </form>
      {query && (
        <TraceResults
          key={`${warehouseId}:${query.kind}:${query.id}:${cursor ?? ''}:${attempt}`}
          warehouseId={warehouseId}
          query={query}
          cursor={cursor}
          onCursor={setCursor}
          onChanged={() => setAttempt((n) => n + 1)}
        />
      )}
    </div>
  );
}
function TraceResults({
  warehouseId,
  query,
  cursor,
  onCursor,
  onChanged,
}: {
  warehouseId: string;
  query: { kind: 'lots' | 'parcels'; id: string };
  cursor?: string;
  onCursor: (value: string | undefined) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('LotTrace'),
    inventory = useTranslations('InventoryDetail'),
    orders = useTranslations('Orders'),
    locale = useLocale(),
    { can } = useAccess(),
    revision = useAuthStore((s) => s.revision);
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const [rows, setRows] = useState<LotTraceRecord[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [recalling, setRecalling] = useState<LotTraceRecord | null>(null),
    [exporting, setExporting] = useState(false),
    [notifying, setNotifying] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void lotTraceApi
      .trace(warehouseId, query.kind, query.id, cursor, abort.signal)
      .then((p) => {
        if (!abort.signal.aborted) {
          setRows(p.items);
          setNext(p.nextCursor);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
      exportAbort.current?.abort();
    };
  }, [warehouseId, query.kind, query.id, cursor]);
  async function download() {
    if (exporting) return;
    setExporting(true);
    setError(false);
    const abort = new AbortController();
    exportAbort.current = abort;
    try {
      const recipients = [];
      let after: string | undefined;
      for (let page = 0; page < 200; page++) {
        const p = await lotTraceApi.affected(warehouseId, query.id, after, abort.signal);
        recipients.push(...p.items);
        if (!p.nextCursor) {
          after = undefined;
          break;
        }
        if (after === p.nextCursor) throw new Error('CURSOR_LOOP');
        after = p.nextCursor;
      }
      if (after) throw new Error('EXPORT_TOO_LARGE');
      if (abort.signal.aborted || useAuthStore.getState().revision !== revision) return;
      const url = URL.createObjectURL(
          new Blob(['\ufeff', recallCsv(recipients)], { type: 'text/csv;charset=utf-8' }),
        ),
        a = document.createElement('a');
      a.href = url;
      a.download = `recall-${query.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!abort.signal.aborted && useAuthStore.getState().revision === revision) setError(true);
    } finally {
      if (!abort.signal.aborted) setExporting(false);
    }
  }
  return (
    <div className="space-y-3" aria-busy={loading}>
      {loading && <p role="status">{t('loading')}</p>}
      {error && <Alert variant="error" title={t('error')} />}
      {!loading && !error && rows.length === 0 && (
        <Alert variant="info" title={t('missingProvenance')} />
      )}
      {query.kind === 'lots' && can('inventory.recall') && rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            disabled={rows[0].lotStatus === 'RECALLED' || exporting}
            onClick={() => setRecalling(rows[0])}
          >
            {t('recall')}
          </Button>
          {rows[0].lotStatus === 'RECALLED' && (
            <Button variant="outline" onClick={() => setNotifying(true)}>
              {t('notify')}
            </Button>
          )}
          <Button variant="outline" isLoading={exporting} onClick={() => void download()}>
            {t('export')}
          </Button>
        </div>
      )}
      {rows.map((r) => (
        <section key={r.id} className="sc-surface space-y-2 p-4">
          <h3 className="m-0 text-sm">
            {r.sku} · {r.lotCode} · {r.binCode}
          </h3>
          <details className="text-xs">
            <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
              {inventory('lookupReferences')}
            </summary>
            <p className="break-all">
              {t('lotId')}: {r.lotId} · {t('parcelId')}: {r.fulfillmentOrderId}
            </p>
          </details>
          <p className="text-sm">
            {t('picked')}: {r.pickedQty} · {t('returned')}: {r.returnedQty} · {t('lotStatus')}:{' '}
            {inventory.has(`lotState.${r.lotStatus}`)
              ? inventory(`lotState.${r.lotStatus}`)
              : inventory('statusUnknown')}
          </p>
          {r.picks.map((p) => (
            <div key={p.id} className="text-xs">
              <p>
                {p.qty} · {timestamp.format(new Date(p.pickedAt))}
              </p>
              <details>
                <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                  {t('picker')}
                </summary>
                <p className="break-all">{p.pickerId}</p>
              </details>
            </div>
          ))}
          {r.shipments.map((s) => (
            <p key={s.id} className="text-xs">
              {s.trackingNumber ?? t('trackingPending')} ·{' '}
              {orders.has(`statuses.${s.status}`)
                ? orders(`statuses.${s.status}`)
                : inventory('statusUnknown')}{' '}
              · {s.deliveredAt ? timestamp.format(new Date(s.deliveredAt)) : t('notDelivered')}
            </p>
          ))}
        </section>
      ))}
      <div className="flex gap-2">
        {cursor && (
          <Button variant="outline" onClick={() => onCursor(undefined)}>
            {t('first')}
          </Button>
        )}
        {next && (
          <Button variant="outline" onClick={() => onCursor(next)}>
            {t('next')}
          </Button>
        )}
      </div>
      {notifying && (
        <RecallNoticeForm
          warehouseId={warehouseId}
          lot={rows[0]}
          onClose={() => setNotifying(false)}
        />
      )}
      {recalling && (
        <RecallForm
          warehouseId={warehouseId}
          lot={recalling}
          onClose={() => setRecalling(null)}
          onAccepted={() => {
            setRecalling(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
function RecallForm({
  warehouseId,
  lot,
  onClose,
  onAccepted,
}: {
  warehouseId: string;
  lot: LotTraceRecord;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = useTranslations('LotTrace'),
    revision = useAuthStore((s) => s.revision),
    [operationId] = useState(createUuid),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [result, setResult] = useState<{
      releasedQty: number;
      reallocatedQty: number;
      recoveryCount: number;
    } | null>(null);
  const pending = useRef<{ operationId: string; expectedVersion: number; reason: string } | null>(
      null,
    ),
    running = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof recallSchema>>({
    resolver: zodResolver(recallSchema),
    defaultValues: { reason: '' },
  });
  async function submit(v: z.infer<typeof recallSchema>) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      pending.current ??= { operationId, expectedVersion: lot.lotVersion, reason: v.reason };
      const r = await lotTraceApi.recall(warehouseId, lot.lotId, pending.current);
      if (useAuthStore.getState().revision === revision) setResult(r);
    } catch {
      if (useAuthStore.getState().revision === revision) setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      isOpen
      title={t('recall')}
      onClose={() => {
        if (!busy) {
          if (result) onAccepted();
          else onClose();
        }
      }}
    >
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <Alert variant="warning" title={t('recallWarning')} />
        <p>{lot.lotCode}</p>
        {error && <Alert variant="error" title={t('error')} />}
        {result ? (
          <>
            <p role="status">{t('result', result)}</p>
            <Button type="button" onClick={onAccepted}>
              {t('close')}
            </Button>
          </>
        ) : (
          <>
            <Input
              label={t('reason')}
              disabled={busy || !!pending.current}
              {...register('reason')}
              error={errors.reason ? t('invalidReason') : undefined}
            />
            {pending.current && <p>{t('retrySame')}</p>}
            <div className="flex gap-2">
              <Button variant="danger" type="submit" isLoading={busy}>
                {t(pending.current ? 'retry' : 'confirm')}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {t('close')}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function RecallNoticeForm({
  warehouseId,
  lot,
  onClose,
}: {
  warehouseId: string;
  lot: LotTraceRecord;
  onClose: () => void;
}) {
  const t = useTranslations('LotTrace'),
    revision = useAuthStore((s) => s.revision);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [queued, setQueued] = useState(0),
    [done, setDone] = useState(false),
    [cursor, setCursor] = useState<string>();
  const pending = useRef<{ operationId: string; expectedVersion: number; cursor?: string } | null>(
      null,
    ),
    running = useRef(false);
  async function send() {
    if (running.current || done || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      pending.current ??= {
        operationId: createUuid(),
        expectedVersion: lot.lotVersion,
        ...(cursor ? { cursor } : {}),
      };
      const result = await lotTraceApi.notify(warehouseId, lot.lotId, pending.current);
      if (useAuthStore.getState().revision !== revision) return;
      setQueued((n) => n + result.queued);
      setCursor(result.nextCursor ?? undefined);
      setDone(!result.nextCursor);
      pending.current = null;
    } catch {
      if (useAuthStore.getState().revision === revision) setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      isOpen
      title={t('notify')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="space-y-4">
        <p>{t('notifyHint')}</p>
        {error && <Alert variant="error" title={t('error')} />}
        <p role="status">{t('notifyQueued', { count: queued })}</p>
        {done ? (
          <Alert variant="info" title={t('notifyDone')} />
        ) : (
          <Button isLoading={busy} onClick={() => void send()}>
            {t(pending.current ? 'retry' : cursor ? 'notifyNext' : 'notify')}
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Modal>
  );
}
