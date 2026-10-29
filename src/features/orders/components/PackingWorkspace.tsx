import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Link } from 'react-router-dom';

import { Alert, Button, Card, Input, PageHeader, Select } from '@/components/Common';
import { encodeLabelBarcode } from '@/features/catalog';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import styles from './PackingWorkspace.module.css';
import {
  packingApi,
  type PackingDetail,
  type PackingQueue,
  type PackCommand,
} from '../api/packingApi';
import { pickingApi } from '../api/pickingApi';
import { packingFormSchema } from '../schemas/packingSchema';
import { isRejectedOperation } from '../lib/fulfillmentRetry';

import type { z } from 'zod';

export function PackingWorkspace() {
  const revision = useAuthStore((s) => s.revision),
    user = useAuthStore((s) => s.user);
  return <PackingSession key={`${user?.userId}:${revision}`} />;
}
function PackingSession() {
  const t = useTranslations('Packing'),
    { can } = useAccess();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]),
    [warehouse, setWarehouse] = useState(''),
    [queue, setQueue] = useState<PackingQueue>({ items: [], nextCursor: null }),
    [detail, setDetail] = useState<PackingDetail | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    void pickingApi
      .warehouses(c.signal)
      .then((w) => {
        if (!c.signal.aborted) {
          setWarehouses(w);
          if (w.length === 1) setWarehouse(w[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [t]);
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
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('hint')} />
      <Card>
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
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
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p role="status">{t('loading')}</p>}
      {warehouse && !loading && !queue.items.length && <Alert>{t('empty')}</Alert>}
      {queue.items.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(250px,1fr)_3fr]">
          <Card className="space-y-2">
            <h2 className="text-base font-semibold">
              {t('packingQueue')} ({queue.items.length})
            </h2>
            {queue.items.map((p) => (
              <Button
                key={p.id}
                variant={detail?.id === p.id ? 'primary' : 'outline'}
                aria-pressed={detail?.id === p.id}
                className="h-auto min-h-14 w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
                onClick={() => void open(p.id)}
              >
                <span className="w-full break-all text-sm">{p.orderCode}</span>
                <span className="text-xs">
                  {t('parcel', { sequence: p.sequenceNo })} ·{' '}
                  {t.has(`statuses.${p.status}`) ? t(`statuses.${p.status}`) : t('unknownStatus')}
                </span>
              </Button>
            ))}
            {queue.nextCursor && (
              <Button
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
            )}
          </Card>
          {!detail && !loading && warehouse && queue.items.length > 0 && (
            <Card>
              <p>{t('chooseParcel')}</p>
            </Card>
          )}
          {detail && (
            <PackingForm
              key={`${warehouse}:${detail.id}:${detail.version}`}
              warehouse={warehouse}
              detail={detail}
              writable={can('warehouse.packing.confirm')}
              onPacked={() => setRefresh((n) => n + 1)}
            />
          )}
        </div>
      )}
    </div>
  );
}
function PackingForm({
  warehouse,
  detail,
  writable,
  onPacked,
}: {
  warehouse: string;
  detail: PackingDetail;
  writable: boolean;
  onPacked: () => void;
}) {
  const t = useTranslations('Packing');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<PackCommand | null>(null),
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
    pending.current ??= {
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
      await packingApi.pack(warehouse, detail.id, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) {
        pending.current = null;
        onPacked();
      }
    } catch (error: unknown) {
      if (!abort.current.signal.aborted) {
        const rejected = isRejectedOperation(error);
        if (rejected) pending.current = null;
        setError(t(rejected ? 'rejectedError' : 'writeError'));
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  const shipment = detail.shipments.find((s) => s.bookingState === 'CONFIRMED' && s.trackingNumber),
    tracking = shipment?.trackingNumber;
  const barcode =
    tracking && /^[\x20-\x7e]{1,100}$/.test(tracking) ? encodeLabelBarcode(tracking) : null;
  return (
    <Card className="space-y-4">
      <h2 className="break-all text-lg font-semibold">{detail.orderCode}</h2>
      {error && <Alert variant="error">{error}</Alert>}
      {detail.status === 'PICKED' && writable ? (
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <Alert>{t('verifyHint')}</Alert>
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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('materialHint')}</p>
          <Button type="submit" disabled={busy}>
            {pending.current ? t('retryOperation') : t('confirmPack')}
          </Button>
        </form>
      ) : (
        <Alert>{t('packedHint')}</Alert>
      )}
      {tracking ? (
        <>
          <div className={styles.label}>
            <h3 className="font-semibold">{t('operationalLabel')}</h3>
            <p>{detail.orderCode}</p>
            <p>
              {detail.recipientName} · {detail.recipientPhone}
            </p>
            <p>{detail.recipientAddress}</p>
            {barcode && (
              <svg
                role="img"
                aria-label={tracking}
                viewBox={`0 0 ${barcode.width} 55`}
                height="70"
                width="100%"
              >
                <rect width="100%" height="100%" fill="white" />
                {barcode.bars.map((b) => (
                  <rect key={b.x} x={b.x} width={b.width} height="55" fill="black" />
                ))}
              </svg>
            )}
            <p>{tracking}</p>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            {t('printLabel')}
          </Button>
          <p className="text-sm">{t('handoverNextStep')}</p>
          <Link
            className="inline-flex rounded text-[var(--sc-primary)] underline focus-visible:outline-2"
            to="/warehouse/handover"
          >
            {t('openHandover')}
          </Link>
        </>
      ) : (
        detail.status !== 'PICKED' && <Alert variant="warning">{t('awaitingLabel')}</Alert>
      )}
    </Card>
  );
}
