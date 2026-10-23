import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Alert, Button, Card, Input, PageHeader, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import styles from './PackingWorkspace.module.css';
import { packingApi, type HandoverOptions } from '../api/packingApi';
import { pickingApi } from '../api/pickingApi';
import { handoverAckSchema } from '../schemas/packingSchema';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import type { z } from 'zod';

export function HandoverWorkspace() {
  const revision = useAuthStore((s) => s.revision),
    user = useAuthStore((s) => s.user);
  return <HandoverSession key={`${user?.userId}:${revision}`} />;
}
function HandoverSession() {
  const t = useTranslations('Packing'),
    { can } = useAccess();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]),
    [warehouse, setWarehouse] = useState('');
  useEffect(() => {
    const c = new AbortController();
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
      });
    return () => c.abort();
  }, [t]);
  const [error, setError] = useState('');
  return (
    <div className="space-y-5">
      <PageHeader title={t('handoverTitle')} description={t('handoverHint')} />
      <Card>
        <Select
          label={t('warehouse')}
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        />
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      {warehouse && (
        <WarehouseHandover
          key={warehouse}
          warehouse={warehouse}
          create={can('warehouse.handover.create')}
          sign={can('warehouse.handover.confirm')}
        />
      )}
    </div>
  );
}
function WarehouseHandover({
  warehouse,
  create,
  sign,
}: {
  warehouse: string;
  create: boolean;
  sign: boolean;
}) {
  const t = useTranslations('Packing');
  const [data, setData] = useState<HandoverOptions | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [cursors, setCursors] = useState<{
      shipments?: string;
      manifests?: string;
    }>({}),
    [printManifest, setPrintManifest] = useState<HandoverOptions['manifests'][number] | null>(null);
  useEffect(() => {
    if (!printManifest) return;
    const clear = () => setPrintManifest(null);
    window.addEventListener('afterprint', clear, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', clear);
  }, [printManifest]);
  const pending = useRef<{ operationId: string; shipmentIds: string[] } | null>(null),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    void packingApi
      .options(warehouse, c.signal, cursors.shipments, cursors.manifests)
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d);
          setSelected([]);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [warehouse, reload, t, cursors]);
  async function manifest() {
    if (running.current || !create || !selected.length) return;
    running.current = true;
    setBusy(true);
    setError('');
    pending.current ??= { operationId: createUuid(), shipmentIds: [...selected].sort() };
    try {
      await packingApi.manifest(warehouse, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) {
        pending.current = null;
        setReload((n) => n + 1);
      }
    } catch (error: unknown) {
      if (!abort.current.signal.aborted) {
        if (isRejectedOperation(error)) pending.current = null;
        setError(t('writeError'));
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  const account = data?.shipments.find((s) => selected.includes(s.id))?.carrierAccountId;
  return (
    <>
      <Button
        variant="outline"
        disabled={busy || !!pending.current}
        onClick={() => {
          setCursors({});
          setReload((n) => n + 1);
        }}
      >
        {t('reload')}
      </Button>
      {error && <Alert variant="error">{error}</Alert>}
      {!data && !error && <p role="status">{t('loading')}</p>}
      {data && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t('readyForHandover')}</h2>
            {!data.shipments.length && <p>{t('noWaybills')}</p>}
            {data.shipments.map((s) => (
              <label
                key={s.id}
                className="flex gap-3 rounded-lg border border-[var(--sc-border-default)] p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  disabled={
                    !create ||
                    busy ||
                    !!pending.current ||
                    !!(account && s.carrierAccountId !== account)
                  }
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, s.id] : old.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  {s.trackingNumber}
                  <small className="block text-[var(--sc-text-secondary)]">
                    {t('carrierAccount')}: {s.carrierAccountId}
                  </small>
                </span>
              </label>
            ))}
            {create && (
              <Button disabled={busy || !selected.length} onClick={() => void manifest()}>
                {pending.current ? t('retryOperation') : t('createManifest')}
              </Button>
            )}
            {data.nextShipmentCursor && (
              <Button
                variant="outline"
                disabled={busy || !!pending.current}
                onClick={() =>
                  setCursors((c) => ({ ...c, shipments: data.nextShipmentCursor ?? undefined }))
                }
              >
                {t('nextPage')}
              </Button>
            )}
          </Card>
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{t('manifests')}</h2>
            {!data.manifests.length && <p>{t('noManifests')}</p>}
            {data.manifests.map((m) => (
              <section
                key={m.id}
                className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
              >
                <h3 className="break-all font-medium">{m.manifestCode}</h3>
                <p>
                  {t('parcelCount', { qty: m.parcelCount })} ·{' '}
                  {m.status === 'SIGNED' ? t('signed') : t('draft')}
                </p>
                <ul className="space-y-1 text-sm">
                  {m.shipments.map((s) => (
                    <li key={s.id}>{s.trackingNumber}</li>
                  ))}
                </ul>
                <Button variant="outline" onClick={() => setPrintManifest(m)}>
                  {t('printManifest')}
                </Button>
                {m.status === 'DRAFT' && sign && (
                  <SignManifest
                    warehouse={warehouse}
                    id={m.id}
                    onSigned={() => setReload((n) => n + 1)}
                  />
                )}
              </section>
            ))}
            {data.nextManifestCursor && (
              <Button
                variant="outline"
                disabled={busy || !!pending.current}
                onClick={() =>
                  setCursors((c) => ({ ...c, manifests: data.nextManifestCursor ?? undefined }))
                }
              >
                {t('nextPage')}
              </Button>
            )}
          </Card>
        </div>
      )}

      {printManifest && (
        <div className={styles.manifestPrint}>
          <h1>{t('handoverTitle')}</h1>
          <p>{printManifest.manifestCode}</p>
          <p>
            {t('carrierAccount')}: {printManifest.carrierAccountId}
          </p>
          <p>
            {t('parcelCount', { qty: printManifest.parcelCount })} ·{' '}
            {printManifest.status === 'SIGNED' ? t('signed') : t('draft')}
          </p>
          <ol>
            {printManifest.shipments.map((s) => (
              <li key={s.id}>{s.trackingNumber}</li>
            ))}
          </ol>
          <p>
            {t('carrierAckRef')}: {printManifest.carrierAckRef ?? '________________'}
          </p>
          <p>{t('carrierSignerName')}: ____________________</p>
        </div>
      )}
    </>
  );
}
function SignManifest({
  warehouse,
  id,
  onSigned,
}: {
  warehouse: string;
  id: string;
  onSigned: () => void;
}) {
  const t = useTranslations('Packing'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof handoverAckSchema>>({
      resolver: zodResolver(handoverAckSchema),
    }),
    pending = useRef<({ operationId: string } & z.infer<typeof handoverAckSchema>) | null>(null),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  async function submit(values: z.infer<typeof handoverAckSchema>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    pending.current ??= { operationId: createUuid(), ...values };
    try {
      await packingApi.sign(warehouse, id, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) onSigned();
    } catch (error: unknown) {
      if (!abort.current.signal.aborted) {
        if (isRejectedOperation(error)) pending.current = null;
        setError(t('writeError'));
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
      {error && <Alert variant="error">{error}</Alert>}
      <Input
        label={t('carrierAckRef')}
        {...form.register('carrierAckRef')}
        error={form.formState.errors.carrierAckRef ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <Input
        label={t('carrierSignerName')}
        {...form.register('carrierSignerName')}
        error={form.formState.errors.carrierSignerName ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <p className="text-sm">{t('signAttestation')}</p>
      <Button type="submit" disabled={busy}>
        {pending.current ? t('retryOperation') : t('signHandover')}
      </Button>
    </form>
  );
}
