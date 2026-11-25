import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Card, Input, QrCodeImage, Select } from '@/components/Common';
import {
  clearFulfillmentPending,
  loadFulfillmentPending,
  persistFulfillmentPending,
} from '@/features/orders/lib/fulfillmentPending';
import { useRealtimeSync } from '@/features/realtime-notifications';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import styles from './PackingWorkspace.module.css';
import {
  packingApi,
  packCommandSchema,
  type PackingDetail,
  type PackingQueue,
  type PackCommand,
} from '../api/packingApi';
import { pickingApi } from '../api/pickingApi';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import { packingFormSchema } from '../schemas/packingSchema';

import type { z } from 'zod';

export function PackingWorkspace() {
  const revision = useAuthStore((s) => s.revision),
    user = useAuthStore((s) => s.user);
  const [syncRevision, setSyncRevision] = useState(0);
  useRealtimeSync(['outbound.packing', 'outbound.orders'], () => {
    setSyncRevision((n) => n + 1);
  });
  return <PackingSession key={`${user?.userId}:${revision}`} syncRevision={syncRevision} />;
}
function PackingSession({ syncRevision = 0 }: { syncRevision?: number } = {}) {
  const actorId = useAuthStore((s) => s.user?.userId) ?? '';
  const t = useTranslations('Packing'),
    { can } = useAccess();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]),
    [warehouse, setWarehouse] = useState(''),
    [queue, setQueue] = useState<PackingQueue>({ items: [], nextCursor: null }),
    [detail, setDetail] = useState<PackingDetail | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [pendingRecovery, setPendingRecovery] = useState<PackCommand | null>(null),
    [refresh, setRefresh] = useState(0);
  const abort = useRef(new AbortController());
  // The server-confirmed parcel ID is unique across sellers; order codes are seller-scoped.
  const [searchParams, setSearchParams] = useSearchParams();
  const handoffFulfillment = searchParams.get('fulfillment');
  const handoffWarehouse = searchParams.get('warehouse');
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    void pickingApi
      .warehouses(c.signal)
      .then((w) => {
        if (!c.signal.aborted) {
          setWarehouses(w);
          const target = w.find((item) => item.id === handoffWarehouse);
          if (target) setWarehouse(target.id);
          else if (w.length === 1) setWarehouse(w[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [handoffWarehouse, t]);
  useEffect(() => {
    const c = new AbortController();
    setDetail(null);
    setQueue({ items: [], nextCursor: null });
    if (warehouse) {
      setLoading(true);
      setError('');
      void packingApi
        .list(warehouse, c.signal)
        .then((q) => {
          if (!c.signal.aborted) setQueue(q);
        })
        .catch(() => {
          if (!c.signal.aborted) setError(t('loadError'));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }
    return () => c.abort();
  }, [warehouse, refresh, t]);
  useEffect(() => {
    if (!warehouse || syncRevision === 0) return;
    const c = new AbortController();
    void packingApi
      .list(warehouse, c.signal)
      .then((q) => {
        if (!c.signal.aborted) setQueue(q);
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [warehouse, syncRevision]);
  useEffect(() => {
    setPendingRecovery(null);
    if (!actorId || !warehouse || !detail) return;
    setPendingRecovery(
      loadFulfillmentPending(
        { actorId, warehouseId: warehouse, operation: 'pack', resourceId: detail.id },
        packCommandSchema,
      ),
    );
  }, [actorId, warehouse, detail?.id]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function open(id: string) {
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    setLoading(true);
    setError('');
    setDetail(null);
    try {
      const d = await packingApi.detail(warehouse, id, c.signal);
      if (!c.signal.aborted) setDetail(d);
    } catch {
      if (!c.signal.aborted) setError(t('loadError'));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (!handoffFulfillment || !warehouse || warehouse !== handoffWarehouse) return;
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    setLoading(true);
    setError('');
    setDetail(null);
    void packingApi
      .detail(warehouse, handoffFulfillment, c.signal)
      .then((d) => {
        if (!c.signal.aborted) {
          setDetail(d);
          setLoading(false);
          setSearchParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.delete('fulfillment');
              next.delete('warehouse');
              return next;
            },
            { replace: true },
          );
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setError(t('loadError'));
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [handoffFulfillment, handoffWarehouse, warehouse, refresh, setSearchParams, t]);
  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('hint')}</p>
      <div className="grid items-end gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/60 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Select
          label={t('warehouse')}
          value={warehouse}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          onChange={(e) => {
            request.current?.abort();
            setWarehouse(e.target.value);
          }}
        />
        <Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>
          {t('reload')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      )}
      {warehouse && !loading && !queue.items.length && !detail && <Alert>{t('empty')}</Alert>}
      {(queue.items.length > 0 || detail) && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,1fr)_2.4fr]">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--sc-border-default)] pb-2.5">
              <h2 className="text-base font-semibold text-[var(--sc-text-primary)]">
                {t('packingQueue')}
              </h2>
              <span className="inline-flex items-center rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--sc-text-secondary)]">
                {queue.items.length}
              </span>
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-0.5">
              {queue.items.map((p) => {
                const isSelected = detail?.id === p.id;
                const statusText = t.has(`statuses.${p.status}`)
                  ? t(`statuses.${p.status}`)
                  : t('unknownStatus');
                return (
                  <Button
                    key={p.id}
                    variant={isSelected ? 'primary' : 'outline'}
                    aria-pressed={isSelected}
                    className="h-auto min-h-14 w-full flex-col items-stretch gap-1.5 whitespace-normal px-3.5 py-3 text-left"
                    onClick={() => void open(p.id)}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="min-w-0 break-all font-mono text-sm font-semibold">
                        {p.orderCode}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : p.status === 'PACKED'
                              ? 'bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]'
                              : p.status === 'PICKED'
                                ? 'bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]'
                                : 'bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]'
                        }`}
                      >
                        {statusText}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-normal ${
                        isSelected ? 'text-white/85' : 'text-[var(--sc-text-secondary)]'
                      }`}
                    >
                      {t('parcel', { sequence: p.sequenceNo })}
                    </span>
                  </Button>
                );
              })}
            </div>
            {queue.nextCursor && (
              <div className="border-t border-[var(--sc-border-default)] pt-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const c = new AbortController();
                    request.current?.abort();
                    request.current = c;
                    void packingApi
                      .list(warehouse, c.signal, queue.nextCursor ?? undefined)
                      .then((q) => {
                        if (!c.signal.aborted) {
                          setQueue((old) => ({
                            items: [...old.items, ...q.items],
                            nextCursor: q.nextCursor,
                          }));
                        }
                      })
                      .catch(() => {
                        if (!c.signal.aborted) setError(t('loadError'));
                      });
                  }}
                >
                  {t('more')}
                </Button>
              </div>
            )}
          </Card>
          {!detail && !loading && warehouse && queue.items.length > 0 && (
            <Card>
              <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)]/50 px-6 py-10 text-center text-sm text-[var(--sc-text-secondary)]">
                <p>{t('chooseParcel')}</p>
              </div>
            </Card>
          )}
          {detail && (
            <PackingForm
              key={`${warehouse}:${detail.id}:${detail.version}`}
              warehouse={warehouse}
              actorId={actorId}
              detail={detail}
              recoveryOnly={detail.status !== 'PICKED' && !!pendingRecovery}
              writable={can('warehouse.packing.confirm')}
              onPacked={() => {
                setPendingRecovery(null);
                setRefresh((n) => n + 1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
function PackingForm({
  warehouse,
  actorId,
  detail,
  recoveryOnly,
  writable,
  onPacked,
}: {
  warehouse: string;
  actorId: string;
  detail: PackingDetail;
  recoveryOnly: boolean;
  writable: boolean;
  onPacked: () => void;
}) {
  const t = useTranslations('Packing');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const scope = {
    actorId,
    warehouseId: warehouse,
    operation: 'pack' as const,
    resourceId: detail.id,
  };
  const pending = useRef<PackCommand | null>(loadFulfillmentPending(scope, packCommandSchema)),
    running = useRef(false),
    abort = useRef(new AbortController());
  const form = useForm<z.infer<typeof packingFormSchema>>({
    resolver: zodResolver(packingFormSchema),
    defaultValues: {
      actualWeightG: 0,
      actualLengthCm: '',
      actualWidthCm: '',
      actualHeightCm: '',
      contents: detail.items.map((i) => ({ itemId: i.id, qty: 0 })),
      materialCode: '',
      materialQty: '1',
    },
  });
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  async function submit(values: z.infer<typeof packingFormSchema>) {
    if (running.current || !writable) return;
    running.current = true;
    setBusy(true);
    setError('');
    if (!pending.current) {
      const command: PackCommand = {
        operationId: createUuid(),
        expectedVersion: detail.version,
        actualWeightG: values.actualWeightG,
        actualLengthCm: values.actualLengthCm,
        actualWidthCm: values.actualWidthCm,
        actualHeightCm: values.actualHeightCm,
        contents: values.contents,
        materials: values.materialCode
          ? [{ materialCode: values.materialCode, qty: values.materialQty, unit: 'UNIT' }]
          : [],
      };
      try {
        persistFulfillmentPending(scope, command);
        pending.current = command;
      } catch {
        setError(t('recoveryUnavailable'));
        running.current = false;
        setBusy(false);
        return;
      }
    }
    try {
      await packingApi.pack(warehouse, detail.id, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) {
        clearFulfillmentPending(scope, pending.current);
        pending.current = null;
        onPacked();
      }
    } catch (error: unknown) {
      if (!abort.current.signal.aborted) {
        const rejected = isRejectedOperation(error);
        if (rejected) {
          if (pending.current) clearFulfillmentPending(scope, pending.current);
          pending.current = null;
        }
        setError(t(rejected ? 'rejectedError' : 'writeError'));
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  const shipment = detail.shipments.find((s) => s.bookingState === 'CONFIRMED' && s.trackingNumber),
    tracking = shipment?.trackingNumber;
  const detailStatusLabel = t.has(`statuses.${detail.status}`)
    ? t(`statuses.${detail.status}`)
    : t('unknownStatus');
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-border-default)] pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="break-all font-mono text-base font-semibold text-[var(--sc-text-primary)]">
            {detail.orderCode}
          </h2>
          <span className="inline-flex items-center rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--sc-text-secondary)]">
            {t('parcel', { sequence: detail.sequenceNo })}
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            detail.status === 'PACKED'
              ? 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]'
              : detail.status === 'PICKED'
                ? 'border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]'
                : 'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]'
          }`}
        >
          {detailStatusLabel}
        </span>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {(detail.status === 'PICKED' || recoveryOnly) && writable ? (
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          {recoveryOnly ? <Alert>{t('writeError')}</Alert> : <Alert>{t('verifyHint')}</Alert>}
          {!recoveryOnly && (
            <div className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/50 p-4">
              {detail.items.map((item, index) => (
                <Input
                  key={item.id}
                  type="number"
                  min={1}
                  max={item.qty}
                  required
                  label={`${item.name ?? t('item')}${item.sku ? ` · ${item.sku}` : ''} · ${t('expected', { qty: item.qty })}`}
                  {...form.register(`contents.${index}.qty`, { valueAsNumber: true })}
                  error={form.formState.errors.contents?.[index] ? t('invalidInput') : undefined}
                  disabled={busy || !!pending.current}
                />
              ))}
            </div>
          )}
          {!recoveryOnly && (
            <div className="grid gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                label={t('weight')}
                type="number"
                min={1}
                required
                {...form.register('actualWeightG', { valueAsNumber: true })}
                error={form.formState.errors.actualWeightG ? t('invalidInput') : undefined}
                disabled={busy || !!pending.current}
              />
              {(['actualLengthCm', 'actualWidthCm', 'actualHeightCm'] as const).map((name) => (
                <Input
                  key={name}
                  label={t(name)}
                  inputMode="decimal"
                  required
                  {...form.register(name)}
                  error={form.formState.errors[name] ? t('invalidInput') : undefined}
                  disabled={busy || !!pending.current}
                />
              ))}
            </div>
          )}
          {!recoveryOnly && (
            <div className="space-y-2.5 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/45 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t('material')}
                  {...form.register('materialCode')}
                  error={form.formState.errors.materialCode ? t('invalidInput') : undefined}
                  disabled={busy || !!pending.current}
                />
                {form.watch('materialCode') && (
                  <Input
                    label={t('materialQty')}
                    inputMode="numeric"
                    {...form.register('materialQty')}
                    error={form.formState.errors.materialQty ? t('invalidInput') : undefined}
                    disabled={busy || !!pending.current}
                  />
                )}
              </div>
              <p className="text-xs text-[var(--sc-text-secondary)]">{t('materialHint')}</p>
            </div>
          )}
          <div className="flex justify-end border-t border-[var(--sc-border-default)] pt-3">
            <Button
              type={recoveryOnly ? 'button' : 'submit'}
              className="min-h-11 w-full sm:w-auto"
              disabled={busy}
              onClick={recoveryOnly ? () => void submit(form.getValues()) : undefined}
            >
              {pending.current ? t('retryOperation') : t('confirmPack')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <Alert>{t(detail.status === 'PICKED' ? 'awaitingStaff' : 'packedHint')}</Alert>
          <ul className="divide-y divide-[var(--sc-border-default)] overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
            {detail.items.map((item, idx) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sc-bg-secondary)] text-xs font-semibold text-[var(--sc-text-secondary)]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 break-words font-medium text-[var(--sc-text-primary)]">
                    {item.name ?? t('item')}
                  </span>
                  {item.sku && (
                    <span className="rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-mono text-xs text-[var(--sc-text-secondary)]">
                      {item.sku}
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--sc-text-secondary)]">
                  {t('expected', { qty: item.qty })}
                </span>
              </li>
            ))}
          </ul>
          {detail.packing.map((record) => (
            <dl key={record.id} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/55 p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('weight')}</dt>
                <dd className="mt-1 font-semibold text-[var(--sc-text-primary)]">
                  {record.actualWeightG}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/55 p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('actualLengthCm')}</dt>
                <dd className="mt-1 font-semibold text-[var(--sc-text-primary)]">
                  {record.actualLengthCm}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/55 p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('actualWidthCm')}</dt>
                <dd className="mt-1 font-semibold text-[var(--sc-text-primary)]">
                  {record.actualWidthCm}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/55 p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('actualHeightCm')}</dt>
                <dd className="mt-1 font-semibold text-[var(--sc-text-primary)]">
                  {record.actualHeightCm}
                </dd>
              </div>
            </dl>
          ))}
        </div>
      )}
      {tracking ? (
        <div className="space-y-4">
          <div className={styles.label}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-border-default)] pb-2">
              <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('operationalLabel')}
              </h3>
              <span className="font-mono text-xs font-semibold text-[var(--sc-text-secondary)]">
                {detail.orderCode}
              </span>
            </div>
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold text-[var(--sc-text-primary)]">
                {detail.recipientName} · {detail.recipientPhone}
              </p>
              <p className="text-[var(--sc-text-secondary)]">{detail.recipientAddress}</p>
            </div>
            <div className="flex justify-center rounded-lg border border-[var(--sc-border-default)] bg-white p-3">
              <QrCodeImage value={tracking} size={160} alt={`QR ${tracking}`} />
            </div>
            <p className="text-center font-mono text-sm font-semibold tracking-wide text-[var(--sc-text-primary)]">
              {tracking}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sc-primary-alpha-20)] bg-[var(--sc-primary-alpha-08)] px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm text-[var(--sc-text-primary)]">{t('handoverNextStep')}</p>
              <Link
                className="inline-flex items-center gap-1 rounded text-sm font-semibold text-[var(--sc-primary-dark)] underline underline-offset-2 hover:text-[var(--sc-primary)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]"
                to="/warehouse/handover"
              >
                {t('openHandover')}
              </Link>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              {t('printLabel')}
            </Button>
          </div>
        </div>
      ) : (
        detail.status !== 'PICKED' && <Alert variant="warning">{t('awaitingLabel')}</Alert>
      )}
    </Card>
  );
}
