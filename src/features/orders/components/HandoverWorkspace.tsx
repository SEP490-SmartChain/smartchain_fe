import { useEffect, useRef, useState, type ReactNode } from 'react';

import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, Card, Input, PageHeader, Select, Tabs } from '@/components/Common';
import {
  clearFulfillmentPending,
  loadFulfillmentPending,
  persistFulfillmentPending,
} from '@/features/orders/lib/fulfillmentPending';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './PackingWorkspace.module.css';
import { downloadHandoverEvidence, uploadHandoverEvidence } from '../api/handoverEvidenceApi';
import {
  packingApi,
  manifestCommandSchema,
  type HandoverOptions,
  type ManifestCommand,
  type PutbackTask,
} from '../api/packingApi';
import { pickingApi } from '../api/pickingApi';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import { createHandoverSignRecovery } from '../lib/handoverSignRecovery';
import { carrierPickupRecorded } from '../lib/handoverTracking';
import { handoverAckSchema, putbackFormSchema } from '../schemas/packingSchema';

import type { z } from 'zod';

export function HandoverWorkspace() {
  const revision = useAuthStore((s) => s.revision),
    user = useAuthStore((s) => s.user);
  return <HandoverSession key={`${user?.userId}:${revision}`} />;
}
function HandoverSession() {
  const t = useTranslations('Packing'),
    { can } = useAccess();
  const actorId = useAuthStore((s) => s.user?.userId) ?? '';
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
  const warehouseSelector = (
    <Select
      label={t('warehouse')}
      value={warehouse}
      onChange={(e) => setWarehouse(e.target.value)}
      options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
    />
  );
  return (
    <div className="space-y-5">
      <PageHeader title={t('handoverTitle')} description={t('handoverHint')} />
      {!warehouse && <Card>{warehouseSelector}</Card>}
      {error && <Alert variant="error">{error}</Alert>}
      {warehouse && (
        <WarehouseHandover
          key={warehouse}
          actorId={actorId}
          warehouse={warehouse}
          warehouseSelector={warehouseSelector}
          warehouseName={warehouses.find((w) => w.id === warehouse)?.name ?? warehouse}
          create={can('warehouse.handover.create')}
          sign={can('warehouse.handover.confirm')}
          putback={can('warehouse.putback.confirm')}
        />
      )}
    </div>
  );
}
function WarehouseHandover({
  actorId,
  warehouse,
  warehouseSelector,
  warehouseName,
  create,
  sign,
  putback,
}: {
  actorId: string;
  warehouse: string;
  warehouseName: string;
  warehouseSelector?: ReactNode;
  create: boolean;
  sign: boolean;
  putback: boolean;
}) {
  const t = useTranslations('Packing');
  const locale = useLocale();
  const [data, setData] = useState<HandoverOptions | null>(null),
    [tasks, setTasks] = useState<PutbackTask[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [cursors, setCursors] = useState<{
      shipments?: string;
      manifests?: string;
      putbacks?: string;
    }>({}),
    [nextPutback, setNextPutback] = useState<string | null>(null),
    [printManifest, setPrintManifest] = useState<HandoverOptions['manifests'][number] | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [expandedManifest, setExpandedManifest] = useState<string | null>(null);
  const [completedPutback, setCompletedPutback] = useState<{ sku: string; qty: number } | null>(
    null,
  );
  const draftCount = data?.manifests.filter((m) => m.status === 'DRAFT').length ?? 0;
  const signedCount = data?.manifests.filter((m) => m.status === 'SIGNED').length ?? 0;
  const activeTab =
    tab ??
    (draftCount ? 'drafts' : data?.shipments.length ? 'ready' : signedCount ? 'signed' : 'ready');
  useEffect(() => {
    if (!printManifest) return;
    const clear = () => setPrintManifest(null);
    window.addEventListener('afterprint', clear, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', clear);
  }, [printManifest]);
  const pendingScope = {
    actorId,
    warehouseId: warehouse,
    operation: 'manifest' as const,
    resourceId: 'active',
  };
  const pending = useRef<ManifestCommand | null>(
      loadFulfillmentPending(pendingScope, manifestCommandSchema),
    ),
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
    void Promise.all([
      packingApi.options(warehouse, c.signal, cursors.shipments, cursors.manifests),
      packingApi.putbacks(warehouse, c.signal, cursors.putbacks),
    ])
      .then(([d, p]) => {
        if (!c.signal.aborted) {
          setData(d);
          setTasks(p.items);
          setNextPutback(p.nextCursor);
          setSelected([]);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [warehouse, reload, t, cursors]);
  async function manifest() {
    if (running.current || !create || (!selected.length && !pending.current)) return;
    running.current = true;
    setBusy(true);
    setError('');
    if (!pending.current) {
      const command: ManifestCommand = {
        operationId: createUuid(),
        shipmentIds: [...selected].sort(),
      };
      try {
        persistFulfillmentPending(pendingScope, command);
        pending.current = command;
      } catch {
        setError(t('recoveryUnavailable'));
        running.current = false;
        setBusy(false);
        return;
      }
    }
    try {
      await packingApi.manifest(warehouse, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) {
        clearFulfillmentPending(pendingScope, pending.current);
        pending.current = null;
        setTab('drafts');
        setCursors({});
        setReload((n) => n + 1);
      }
    } catch (error: unknown) {
      if (!abort.current.signal.aborted) {
        const rejected = isRejectedOperation(error);
        if (rejected) {
          if (pending.current) clearFulfillmentPending(pendingScope, pending.current);
          pending.current = null;
        }
        setError(t(rejected ? 'rejectedError' : 'writeError'));
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  const account = data?.shipments.find((s) => selected.includes(s.id))?.carrierAccountId;
  return (
    <>
      <Card>
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>{warehouseSelector}</div>
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
        </div>
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      {!data && !error && <p role="status">{t('loading')}</p>}
      {data && (
        <div className="space-y-4">
          <Tabs
            id="handover-work"
            label={t('handoverViews')}
            activeId={activeTab}
            onChange={setTab}
            disabled={busy || !!pending.current}
            tabs={[
              { id: 'ready', label: t('readyTab'), badge: data.shipments.length },
              { id: 'drafts', label: t('draftTab'), badge: draftCount },
              { id: 'signed', label: t('signedTab'), badge: signedCount },
            ]}
          />
          {(data.nextShipmentCursor || data.nextManifestCursor) && (
            <p className="text-xs text-[var(--sc-text-secondary)]">{t('pageCountsHint')}</p>
          )}
          <div
            hidden={activeTab !== 'ready'}
            role="tabpanel"
            id="handover-work-panel-ready"
            aria-labelledby="handover-work-ready"
          >
            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">{t('readyForHandover')}</h2>
              {data.shipments.length > 0 && (
                <p className="text-sm text-[var(--sc-text-secondary)]">
                  {t('manifestSelectionHint')}
                </p>
              )}
              {data.shipments.length > 0 && (
                <p role="status" className="text-sm">
                  {t('selectedForManifest', { qty: selected.length })}
                </p>
              )}
              {!data.shipments.length && <p>{t('noWaybills')}</p>}
              {data.shipments.map((s) => (
                <div key={s.id} className="rounded-lg border border-[var(--sc-border-default)] p-3">
                  <label className="flex items-start gap-3">
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
                    <span className="min-w-0 break-all">{s.trackingNumber}</span>
                  </label>
                  {account && s.carrierAccountId !== account && (
                    <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                      {t('differentCarrier')}
                    </p>
                  )}
                  <details className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                    <summary className="cursor-pointer rounded focus-visible:outline-2">
                      {t('carrierConnection')}
                    </summary>
                    <p className="mt-1 break-all">{s.carrierAccountId}</p>
                  </details>
                </div>
              ))}
              {create && (selected.length > 0 || !!pending.current) && (
                <Button
                  disabled={busy || (!selected.length && !pending.current)}
                  onClick={() => void manifest()}
                >
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
          </div>
          {(['drafts', 'signed'] as const).map((view) => (
            <div
              key={view}
              hidden={activeTab !== view}
              role="tabpanel"
              id={`handover-work-panel-${view}`}
              aria-labelledby={`handover-work-${view}`}
            >
              <Card className="space-y-4">
                <h2 className="text-lg font-semibold">
                  {t(view === 'drafts' ? 'draftTab' : 'signedTab')}
                </h2>
                {!data.manifests.some(
                  (m) => m.status === (view === 'drafts' ? 'DRAFT' : 'SIGNED'),
                ) && <p>{t('noManifestsOnPage')}</p>}
                {data.manifests
                  .filter((m) => m.status === (view === 'drafts' ? 'DRAFT' : 'SIGNED'))
                  .map((m) => (
                    <details
                      open={expandedManifest === m.id}
                      onToggle={(event) => {
                        const opened = event.currentTarget.open;
                        setExpandedManifest((current) =>
                          opened ? m.id : current === m.id ? null : current,
                        );
                      }}
                      key={m.id}
                      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
                    >
                      <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                        <span className="inline-flex max-w-full flex-col gap-1 align-top">
                          <span className="break-all text-sm font-semibold">{m.manifestCode}</span>
                          <span className="text-sm text-[var(--sc-text-secondary)]">
                            {t('parcelCount', { qty: m.parcelCount })} ·{' '}
                            {m.status === 'SIGNED' ? t('warehouseConfirmed') : t('draft')}
                          </span>
                          <span className="text-sm font-medium text-[var(--sc-primary)]">
                            {t(m.status === 'DRAFT' ? 'continueHandover' : 'viewManifest')}
                          </span>
                        </span>
                      </summary>
                      <ul className="space-y-1 text-sm">
                        {m.shipments.map((s) => (
                          <li key={s.id} className="space-y-2">
                            <span>{s.trackingNumber}</span>
                            {m.status === 'SIGNED' && (
                              <p className="text-sm text-[var(--sc-text-secondary)]">
                                {carrierPickupRecorded(s)
                                  ? t('carrierPickupConfirmed')
                                  : t('carrierPickupPending')}
                              </p>
                            )}
                            {m.status === 'DRAFT' && create && (
                              <RemoveDraftParcel
                                warehouse={warehouse}
                                manifestId={m.id}
                                shipmentId={s.id}
                                onDone={() => setReload((n) => n + 1)}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                      <Button variant="outline" onClick={() => setPrintManifest(m)}>
                        {t(m.status === 'SIGNED' ? 'printSignedManifest' : 'printDraftManifest')}
                      </Button>
                      {m.status === 'SIGNED' &&
                        (m.hasHandoverPhoto ? (
                          <HandoverPhoto warehouse={warehouse} id={m.id} />
                        ) : (
                          <Alert variant="warning">{t('legacyEvidenceHint')}</Alert>
                        ))}
                      {m.status === 'SIGNED' && (
                        <p className="text-sm">{t('warehouseConfirmationHint')}</p>
                      )}
                      {m.status === 'DRAFT' && sign && (
                        <SignManifest
                          key={`${m.id}:${m.shipments
                            .map((s) => s.id)
                            .sort()
                            .join(',')}`}
                          warehouse={warehouse}
                          id={m.id}
                          parcelCount={m.parcelCount}
                          onSigned={() => setReload((n) => n + 1)}
                        />
                      )}
                    </details>
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
          ))}
        </div>
      )}
      {completedPutback && (
        <Alert variant="success" role="status" aria-live="polite">
          {t('putbackCompleted', completedPutback)}
        </Alert>
      )}
      <details
        open={tasks.length > 0}
        className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4"
      >
        <summary className="cursor-pointer rounded text-base font-semibold focus-visible:outline-2">
          {t('putbackTitle')} ({tasks.length})
        </summary>
        <div className="mt-4 space-y-4">
          {tasks.length > 0 && <Alert>{t('putbackHint')}</Alert>}
          {!tasks.length && <p>{t('noPutbacks')}</p>}
          {tasks.map((task) => (
            <section
              key={task.id}
              className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
            >
              <p>
                {task.sku} · {task.lotCode} · {task.binCode} · {task.qty}
              </p>
              {putback && (
                <PutbackForm
                  warehouse={warehouse}
                  task={task}
                  onDone={(qty) => {
                    setCompletedPutback({ sku: task.sku, qty });
                    setReload((n) => n + 1);
                  }}
                />
              )}
            </section>
          ))}
          {nextPutback && (
            <Button
              variant="outline"
              disabled={busy || !!pending.current}
              onClick={() => setCursors((c) => ({ ...c, putbacks: nextPutback }))}
            >
              {t('nextPage')}
            </Button>
          )}
        </div>
      </details>
      {printManifest &&
        createPortal(
          <div className={styles.manifestPrint}>
            <style media="print">
              {
                '@page { size: A4 portrait; margin: 15mm 14mm; } @page:first { margin-top: 0; margin-bottom: 0; }'
              }
            </style>
            <header className={styles.documentHeader}>
              <div className={styles.documentBrand}>
                <span className={styles.documentLogo} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span>ORCA</span>
              </div>
              <div className={styles.documentStatus}>
                {t(printManifest.status === 'SIGNED' ? 'printConfirmedStatus' : 'draft')}
              </div>
            </header>
            <section className={styles.documentHeading}>
              <p className={styles.documentEyebrow}>{t('printDocumentCategory')}</p>
              <h1>
                {t(printManifest.status === 'SIGNED' ? 'signedPrintTitle' : 'draftPrintTitle')}
              </h1>
              <p className={styles.documentReference}>
                <span>{t('printReference')}</span>
                <strong>{printManifest.manifestCode}</strong>
              </p>
            </section>
            <dl className={styles.documentDetails}>
              <div>
                <dt>{t('printWarehouse')}</dt>
                <dd>{warehouseName}</dd>
              </div>
              <div>
                <dt>{t('carrierSignerName')}</dt>
                <dd>
                  {printManifest.status === 'SIGNED'
                    ? printManifest.carrierSignerName || t('recordNotAvailable')
                    : '____________________________'}
                </dd>
              </div>
              <div>
                <dt>
                  {t(printManifest.status === 'SIGNED' ? 'warehouseConfirmedAt' : 'handoverDate')}
                </dt>
                <dd>
                  {printManifest.status === 'SIGNED'
                    ? printManifest.signedAt
                      ? new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Ho_Chi_Minh',
                        }).format(new Date(printManifest.signedAt))
                      : t('recordNotAvailable')
                    : '____________________________'}
                </dd>
              </div>
              <div>
                <dt>{t('carrierAckRef')}</dt>
                <dd>
                  {printManifest.carrierAckRef ||
                    (printManifest.status === 'SIGNED'
                      ? t('notProvided')
                      : '____________________________')}
                </dd>
              </div>
            </dl>
            <section className={styles.documentParcels}>
              <div className={styles.documentSectionHeader}>
                <h2>{t('printShipmentList')}</h2>
                <strong>{t('parcelCount', { qty: printManifest.parcelCount })}</strong>
              </div>
              <table aria-label={t('printShipmentList')}>
                <thead>
                  <tr>
                    <th scope="col">{t('printRowNumber')}</th>
                    <th scope="col">{t('printTrackingNumber')}</th>
                  </tr>
                </thead>
                <tbody>
                  {printManifest.shipments.map((shipment, index) => (
                    <tr key={shipment.id}>
                      <td>{index + 1}</td>
                      <td>{shipment.trackingNumber || t('recordNotAvailable')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t('printParcelTotal', { qty: printManifest.parcelCount })}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
            <aside className={styles.documentNote}>
              <h2>
                {t(
                  printManifest.status === 'SIGNED'
                    ? 'printConfirmationNote'
                    : 'printHandoverInstructions',
                )}
              </h2>
              <p>
                {t(printManifest.status === 'SIGNED' ? 'signedPrintEvidence' : 'draftPrintHint')}
              </p>
            </aside>
            {printManifest.status !== 'SIGNED' && (
              <div className={styles.documentSignatures}>
                <section>
                  <h2>{t('warehouseSignature')}</h2>
                  <p>{t('printSignatureHint')}</p>
                  <div>____________________________</div>
                </section>
                <section>
                  <h2>{t('carrierSignature')}</h2>
                  <p>{t('printSignatureHint')}</p>
                  <div>____________________________</div>
                </section>
              </div>
            )}
            <footer className={styles.documentFooter}>
              <strong>ORCA</strong>
              <span>{t('printFooter')}</span>
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
function SignManifest({
  warehouse,
  id,
  parcelCount,
  onSigned,
}: {
  warehouse: string;
  id: string;
  parcelCount: number;
  onSigned: () => void;
}) {
  const t = useTranslations('Packing'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false),
    [photoName, setPhotoName] = useState('');
  const recovery = useRef<ReturnType<typeof createHandoverSignRecovery> | null>(null);
  recovery.current ??= createHandoverSignRecovery(warehouse, id);
  const pending = useRef(recovery.current.pending());
  const form = useForm<z.infer<typeof handoverAckSchema>>({
      resolver: zodResolver(handoverAckSchema),
      defaultValues: pending.current ?? {
        carrierAckRef: '',
        carrierSignerName: '',
        evidenceKey: '',
      },
    }),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  async function submit(values: z.infer<typeof handoverAckSchema>) {
    if (running.current || uploading) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const signed = await recovery.current?.submit(values, abort.current.signal);
      pending.current = recovery.current?.pending() ?? null;
      if (signed && !abort.current.signal.aborted) onSigned();
    } catch (error: unknown) {
      pending.current = recovery.current?.pending() ?? null;
      if (!abort.current.signal.aborted) {
        const rejected = isRejectedOperation(error);
        setError(
          t(
            error instanceof ApiError && error.code === 'PACK.PARCEL_COUNT_MISMATCH'
              ? 'parcelCountMismatch'
              : rejected
                ? 'rejectedError'
                : 'writeError',
          ),
        );
      }
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
      {error && <Alert variant="error">{error}</Alert>}
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('signChecklist')}</p>
      <Input
        label={t('confirmedParcelCount')}
        type="number"
        required
        helperText={t('expectedParcelCount', { qty: parcelCount })}
        min={1}
        max={100}
        {...form.register('confirmedParcelCount', { valueAsNumber: true })}
        error={form.formState.errors.confirmedParcelCount ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <Input
        label={t('carrierAckRef')}
        helperText={t('carrierAckRefHint')}
        {...form.register('carrierAckRef')}
        error={form.formState.errors.carrierAckRef ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <Input
        label={t('handoverPhoto')}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        helperText={t('handoverPhotoHint')}
        error={form.formState.errors.evidenceKey ? t('handoverPhotoRequired') : undefined}
        disabled={busy || uploading || !!pending.current}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file || uploading) return;
          setUploading(true);
          setError('');
          setPhotoName('');
          form.setValue('evidenceKey', '');
          void uploadHandoverEvidence(warehouse, id, file, abort.current.signal)
            .then((key) => {
              if (!abort.current.signal.aborted) {
                form.setValue('evidenceKey', key, { shouldValidate: true });
                setPhotoName(file.name);
              }
            })
            .catch(() => {
              if (!abort.current.signal.aborted) setError(t('handoverPhotoError'));
            })
            .finally(() => {
              if (!abort.current.signal.aborted) setUploading(false);
            });
          event.target.value = '';
        }}
      />
      {uploading && <p role="status">{t('uploadingPhoto')}</p>}
      {photoName && <p role="status">{t('handoverPhotoReady', { name: photoName })}</p>}
      <Input
        label={t('carrierSignerName')}
        required
        {...form.register('carrierSignerName')}
        error={form.formState.errors.carrierSignerName ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <p className="text-sm">{t('signAttestation')}</p>
      <Button
        type="submit"
        className="h-auto min-h-[42px] whitespace-normal"
        disabled={busy || uploading}
      >
        {pending.current ? t('retryOperation') : t('signHandover')}
      </Button>
    </form>
  );
}
function HandoverPhoto({ warehouse, id }: { warehouse: string; id: string }) {
  const t = useTranslations('Packing'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const abort = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => controller.abort();
  }, []);
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError('');
          void downloadHandoverEvidence(warehouse, id, abort.current.signal)
            .then((url) => {
              if (!abort.current.signal.aborted) window.open(url, '_blank', 'noopener,noreferrer');
            })
            .catch(() => {
              if (!abort.current.signal.aborted) setError(t('loadError'));
            })
            .finally(() => {
              if (!abort.current.signal.aborted) setBusy(false);
            });
        }}
      >
        {t('viewHandoverPhoto')}
      </Button>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
function RemoveDraftParcel({
  warehouse,
  manifestId,
  shipmentId,
  onDone,
}: {
  warehouse: string;
  manifestId: string;
  shipmentId: string;
  onDone: () => void;
}) {
  const t = useTranslations('Packing'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ operationId: string; shipmentId: string } | null>(null),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => controller.abort();
  }, []);
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (running.current) return;
          running.current = true;
          setBusy(true);
          setError('');
          pending.current ??= { operationId: createUuid(), shipmentId };
          void packingApi
            .removeDraftParcel(warehouse, manifestId, pending.current, abort.current.signal)
            .then(() => {
              if (!abort.current.signal.aborted) onDone();
            })
            .catch((error: unknown) => {
              if (!abort.current.signal.aborted) {
                if (isRejectedOperation(error)) pending.current = null;
                setError(t('writeError'));
              }
            })
            .finally(() => {
              running.current = false;
              if (!abort.current.signal.aborted) setBusy(false);
            });
        }}
      >
        {pending.current ? t('retryOperation') : t('removeUnhandedParcel')}
      </Button>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
function PutbackForm({
  warehouse,
  task,
  onDone,
}: {
  warehouse: string;
  task: PutbackTask;
  onDone: (qty: number) => void;
}) {
  const t = useTranslations('Packing'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof putbackFormSchema>>({
      resolver: zodResolver(putbackFormSchema),
      defaultValues: { binCode: '', sku: '', lotCode: '', qty: 0 },
    }),
    pending = useRef<
      ({ operationId: string; expectedVersion: number } & z.infer<typeof putbackFormSchema>) | null
    >(null),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  async function submit(values: z.infer<typeof putbackFormSchema>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    pending.current ??= { operationId: createUuid(), expectedVersion: task.version, ...values };
    try {
      await packingApi.putback(warehouse, task.id, pending.current, abort.current.signal);
      if (!abort.current.signal.aborted) onDone(pending.current.qty);
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
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit(submit)}>
      {error && <Alert variant="error">{error}</Alert>}
      {(['binCode', 'sku', 'lotCode'] as const).map((name) => (
        <Input
          key={name}
          label={t(name)}
          {...form.register(name)}
          error={form.formState.errors[name] ? t('invalidInput') : undefined}
          disabled={busy || !!pending.current}
        />
      ))}
      <Input
        label={t('actualQty')}
        type="number"
        min={1}
        {...form.register('qty', { valueAsNumber: true })}
        error={form.formState.errors.qty ? t('invalidInput') : undefined}
        disabled={busy || !!pending.current}
      />
      <Button type="submit" disabled={busy}>
        {pending.current ? t('retryOperation') : t('confirmPutback')}
      </Button>
    </form>
  );
}
