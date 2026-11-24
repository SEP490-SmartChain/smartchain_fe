import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { type z } from 'zod';

import {
  Alert,
  Badge,
  BarcodeScanButton,
  Button,
  Card,
  CardContent,
  Input,
  Select,
} from '@/components/Common';
import {
  clearFulfillmentPending,
  loadFulfillmentPending,
  persistFulfillmentPending,
} from '@/features/orders/lib/fulfillmentPending';
import { useAccess } from '@/hooks/useAccess';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { PickLineLabels } from './PickLineLabels';
import { PickShortEvidence } from './PickShortEvidence';
import {
  pickingApi,
  type PickPending,
  pickPendingSchema,
  type PickWave,
  type PickBacklog,
  type PickDetail,
  type PickLine,
} from '../api/pickingApi';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import {
  getNextPickScanField,
  normalizeScannedCode,
  parsePickQrPayload,
  type PickScanField,
} from '../lib/pickBarcode';
import {
  pickScanSchema,
  pickWaveFormSchema,
  pickShortFormSchema,
  pickApprovalSchema,
} from '../schemas/pickingSchema';

const CLAIM_WAVE_MAX_PARCELS = 20;
const PICK_SCAN_FIELDS = ['binScan', 'skuScan', 'lotScan'] as const;
const PICK_STEPS = [...PICK_SCAN_FIELDS, 'qty'] as const;
const PICK_SCAN_ERRORS = {
  binScan: 'WRONG_BIN',
  skuScan: 'WRONG_SKU',
  lotScan: 'WRONG_LOT',
} as const;

/**
 * Local `datetime-local` value one minute in the past: the server rejects a cut-off in the future
 * (PICK.INVALID_CUTOFF), and "now" is what an operator taking work means.
 */
function currentCutoffInput(): string {
  const at = new Date(Date.now() - 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function PickingWorkspace() {
  const user = useAuthStore((s) => s.user),
    revision = useAuthStore((s) => s.revision);
  return <PickingScope key={`${user?.userId}:${revision}`} />;
}
function PickingScope() {
  const actorId = useAuthStore((s) => s.user?.userId) ?? '';
  const locale = useLocale();
  const t = useTranslations('Picking'),
    { can } = useAccess();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]),
    [warehouse, setWarehouse] = useState(''),
    [waves, setWaves] = useState<PickWave[]>([]),
    [backlog, setBacklog] = useState<PickBacklog | null>(null),
    [backlogCursor, setBacklogCursor] = useState<string | null>(null),
    [waveId, setWaveId] = useState(''),
    [detail, setDetail] = useState<PickDetail | null>(null),
    [lineCursor, setLineCursor] = useState<string | null>(null),
    [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0),
    [pending, setPending] = useState<PickPending | null>(null),
    [waveRequest, setWaveRequest] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    abort = useRef(new AbortController());
  const manager = can('warehouse.picking.manage');
  const navigate = useNavigate();
  // One operator holding both warehouse roles assigns the wave to themself (UC-80/81 then UC-82).
  const canClaim =
    manager && can('warehouse.picking.confirm') && staff.some((person) => person.id === actorId);
  const handleClaim = () =>
    void execute({
      path: 'waves',
      payload: {
        assigneeId: actorId,
        cutoffAt: new Date(currentCutoffInput()).toISOString(),
        maxParcels: CLAIM_WAVE_MAX_PARCELS,
        clientScanId: createUuid(),
      },
    });
  useEffect(() => {
    mounted.current = true;
    abort.current = new AbortController();
    return () => {
      mounted.current = false;
      abort.current.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    void pickingApi
      .warehouses(c.signal)
      .then((data) => {
        if (!c.signal.aborted) {
          setWarehouses(data);
          if (data.length === 1 && data[0]) setWarehouse(data[0].id);
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
    setWaveId('');
    setDetail(null);
    setWaves([]);
    setBacklog(null);
    setBacklogCursor(null);
    setCursor(null);
    setPending(
      actorId && warehouse
        ? loadFulfillmentPending(
            { actorId, warehouseId: warehouse, operation: 'pick', resourceId: 'active' },
            pickPendingSchema,
          )
        : null,
    );
    setWaveRequest(null);
    setNotice('');
    setError('');
  }, [warehouse, actorId]);
  useEffect(() => {
    if (!warehouse) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      pickingApi.waves(warehouse, cursor, c.signal),
      manager ? pickingApi.staff(warehouse, c.signal) : Promise.resolve([]),
      manager ? pickingApi.backlog(warehouse, backlogCursor, c.signal) : Promise.resolve(null),
    ])
      .then(([page, options, backlogPage]) => {
        if (!c.signal.aborted) {
          setWaves(page.items);
          setNext(page.nextCursor);
          setStaff(options);
          if (backlogPage) setBacklog(backlogPage);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [warehouse, cursor, backlogCursor, manager, refresh, t]);
  useEffect(() => {
    setLineCursor(null);
  }, [warehouse, waveId]);
  useEffect(() => {
    setDetail(null);
    if (!warehouse || !waveId) return;
    const c = new AbortController();
    void pickingApi
      .detail(warehouse, waveId, c.signal, lineCursor)
      .then((data) => {
        if (!c.signal.aborted) setDetail(data);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [warehouse, waveId, refresh, lineCursor, t]);
  useEffect(() => {
    if (!waveRequest || !warehouse) return;
    const c = new AbortController();
    let running = false;
    const read = async () => {
      if (running) return;
      running = true;
      try {
        const result = await pickingApi.requestStatus(warehouse, waveRequest, c.signal);
        if (c.signal.aborted) return;
        if (result.status === 'COMPLETED' && result.waveId) {
          setWaveRequest(null);
          setWaveId(result.waveId);
          setNotice(t('confirmed'));
          setRefresh((x) => x + 1);
        } else if (result.status === 'FAILED') {
          setWaveRequest(null);
          setError(t('waveFailed'));
        }
      } catch {
        if (!c.signal.aborted) setError(t('loadError'));
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => {
      void read();
    }, 2000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [warehouse, waveRequest, t]);
  async function execute(command: PickPending) {
    if (busy) return;
    setBusy(true);
    setPending(command);
    setError('');
    setNotice('');
    const scope = {
      actorId,
      warehouseId: warehouse,
      operation: 'pick' as const,
      resourceId: 'active',
    };
    const recoverable =
      command.path === 'waves' || /^pick-lines\/[0-9a-f-]+\/confirm$/i.test(command.path);
    if (recoverable) {
      try {
        persistFulfillmentPending(scope, command);
      } catch {
        setPending(null);
        setError(t('recoveryUnavailable'));
        setBusy(false);
        return;
      }
    }
    try {
      const result = await pickingApi.execute(warehouse, command, abort.current.signal);
      if (!mounted.current) return;
      if (recoverable) clearFulfillmentPending(scope, command);
      setPending(null);
      if (result.status === 'PROCESSING' && result.requestId) {
        setWaveRequest(result.requestId);
        setNotice(t('waveProcessing'));
      } else setNotice(t('confirmed'));
      setLineCursor(null);
      setRefresh((x) => x + 1);
      if (result.waveId) setWaveId(result.waveId);
      if (result.fulfillmentStatus === 'PICKED' && result.fulfillmentOrderId) {
        setNotice(t('packNext'));
        void navigate({
          pathname: '/warehouse/packing',
          search: new URLSearchParams({
            warehouse,
            fulfillment: result.fulfillmentOrderId,
          }).toString(),
        });
      }
    } catch (cause) {
      if (!mounted.current) return;
      if (isRejectedOperation(cause)) {
        if (recoverable) clearFulfillmentPending(scope, command);
        setPending(null);
        const code = cause instanceof ApiError ? (cause.code.split('.').at(-1) ?? '') : '';
        setError(
          code === 'ORDER_BLOCKED'
            ? t('parentBlocked')
            : t.has(`errors.${code}`)
              ? t(`errors.${code}`)
              : t('rejected'),
        );
        if (code === 'LOT_SCAN_REQUIRED') return code;
      } else setError(t('unknown'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/60 p-4">
        {warehouses.length === 1 && warehouses[0] ? (
          <p className="min-w-0 flex-1 text-sm text-[var(--sc-text-primary)]">
            <span className="text-[var(--sc-text-secondary)]">{t('warehouse')}: </span>
            <strong className="font-semibold">{`${warehouses[0].code} · ${warehouses[0].name}`}</strong>
          </p>
        ) : (
          <div className="min-w-64 flex-1">
            <Select
              label={t('warehouse')}
              value={warehouse}
              disabled={!!pending || busy}
              options={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
              onChange={(e) => setWarehouse(e.target.value)}
              placeholder={t('chooseWarehouse')}
            />
          </div>
        )}
        <Button
          variant="outline"
          disabled={!!pending || busy || !!waveRequest}
          onClick={() => {
            setCursor(null);
            setRefresh((x) => x + 1);
          }}
        >
          {t('reload')}
        </Button>
      </div>
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" role="status">
          {notice}
        </Alert>
      )}
      {pending && !busy && (
        <Alert variant="warning">
          <p>{t('unknown')}</p>
          <Button onClick={() => void execute(pending)}>{t('retrySame')}</Button>
        </Alert>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && !warehouses.length && <Alert>{t('noWarehouse')}</Alert>}
      {warehouse && canClaim && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t('claimTitle')}</h2>
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('claimHint')}</p>
          </div>
          <Button
            disabled={!!pending || busy || !!waveRequest}
            isLoading={busy && !waveRequest}
            onClick={handleClaim}
          >
            {t('claimWork')}
          </Button>
        </div>
      )}
      {warehouse && manager && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
          <Card>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{t('backlog')}</h2>
                {backlog && (
                  <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
                    {t('backlogPageTotals', backlog.pageTotals)}
                  </p>
                )}
              </div>
              {!backlog?.lines.length ? (
                <p>{t('backlogEmpty')}</p>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-[var(--sc-border-default)] pr-1">
                  <ul className="divide-y divide-[var(--sc-border-default)]">
                    {backlog.lines.map((line) => (
                      <li
                        key={line.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {t('pickForOrder', {
                              orderCode: line.orderCode,
                              parcelNo: line.parcelNo,
                            })}
                          </p>
                          <p className="mt-0.5 break-words text-[var(--sc-text-secondary)]">
                            <strong className="text-[var(--sc-text-primary)]">{line.sku}</strong> ·{' '}
                            {line.productName}
                          </p>
                        </div>
                        <Badge
                          label={t(`eligibility.${line.eligibility}`)}
                          status={line.eligibility === 'READY' ? 'success' : 'warning'}
                        />
                        <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--sc-text-secondary)]">
                          <span>
                            {t('bin')}: {line.binCode}
                          </span>
                          {!isTechnicalLotCode(line.lotCode) && (
                            <span>
                              {t('lot')}: {line.lotCode}
                            </span>
                          )}
                          <span>{t('remainingQty', { qty: line.remainingQty })}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(backlog?.nextCursor || backlogCursor) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {backlog?.nextCursor && (
                    <Button
                      variant="outline"
                      disabled={busy || !!pending}
                      onClick={() => setBacklogCursor(backlog.nextCursor)}
                    >
                      {t('nextBacklog')}
                    </Button>
                  )}
                  {backlogCursor && (
                    <Button
                      variant="ghost"
                      disabled={busy || !!pending}
                      onClick={() => setBacklogCursor(null)}
                    >
                      {t('firstBacklog')}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <details className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4">
            <summary className="cursor-pointer font-semibold">{t('createWave')}</summary>
            <div className="mt-4">
              <WaveForm
                warehouseId={warehouse}
                staff={staff}
                disabled={!!pending || busy || !!waveRequest}
                onSubmit={(values) =>
                  void execute({
                    path: 'waves',
                    payload: {
                      ...values,
                      cutoffAt: new Date(values.cutoffAt).toISOString(),
                      clientScanId: createUuid(),
                    },
                  })
                }
              />
            </div>
          </details>
        </div>
      )}
      {warehouse && (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
          <Card>
            <CardContent>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--sc-border-default)] pb-2.5">
                <h2 className="text-base font-semibold text-[var(--sc-text-primary)]">
                  {t('waves')}
                </h2>
                {!loading && (
                  <span className="inline-flex items-center rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                    {t('waveCount', { count: waves.length })}
                  </span>
                )}
              </div>
              {!loading && !waves.length && (
                <div className="rounded-xl border border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)]/50 px-4 py-6 text-center text-sm text-[var(--sc-text-secondary)]">
                  {t('empty')}
                </div>
              )}
              {waves.length > 0 && (
                <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-[var(--sc-border-default)]">
                  <ul className="divide-y divide-[var(--sc-border-default)]">
                    {waves.map((w) => {
                      const cutoff = new Date(w.cutoffAt).toLocaleString(locale, {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      });
                      const status = t(`statuses.${w.status}`);
                      const badgeStatus =
                        w.status === 'COMPLETED'
                          ? 'success'
                          : w.status === 'EXCEPTION'
                            ? 'warning'
                            : w.status === 'IN_PROGRESS'
                              ? 'info'
                              : 'default';
                      return (
                        <li key={w.id}>
                          <Button
                            variant={w.id === waveId ? 'primary' : 'ghost'}
                            aria-pressed={w.id === waveId}
                            aria-label={`${t('waveReference', { code: shortWaveReference(w.waveCode) })}, ${status}, ${t('cutoff')}: ${cutoff}`}
                            title={w.waveCode}
                            className="h-auto min-h-0 w-full justify-between gap-2 rounded-none px-3.5 py-3 text-left whitespace-normal shadow-none"
                            disabled={!!pending || busy}
                            onClick={() => setWaveId(w.id)}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {t('waveReference', { code: shortWaveReference(w.waveCode) })}
                              </span>
                              <time
                                className={`mt-0.5 block text-xs font-normal ${
                                  w.id === waveId
                                    ? 'text-white/85'
                                    : 'text-[var(--sc-text-secondary)]'
                                }`}
                                dateTime={w.cutoffAt}
                              >
                                {cutoff}
                              </time>
                            </span>
                            <Badge label={status} status={badgeStatus} />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {(cursor || next) && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--sc-border-default)] pt-3">
                  {cursor ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!pending || busy}
                      onClick={() => setCursor(null)}
                    >
                      {t('firstWaves')}
                    </Button>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!pending || busy}
                      onClick={() => setCursor(next)}
                    >
                      {t('next')}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {!waveId ? (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)]/50 px-6 py-10 text-center">
                  <h2 className="text-base font-semibold text-[var(--sc-text-primary)]">
                    {t('chooseWave')}
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm text-[var(--sc-text-secondary)]">
                    {t('chooseWaveHint')}
                  </p>
                </div>
              ) : !detail ? (
                <p
                  role="status"
                  className="py-6 text-center text-sm text-[var(--sc-text-secondary)]"
                >
                  {t('loading')}
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-border-default)] pb-3">
                    <h2
                      className="min-w-0 break-words text-base font-semibold text-[var(--sc-text-primary)]"
                      title={detail.waveCode}
                    >
                      {t('pickList')} ·{' '}
                      {t('waveReference', { code: shortWaveReference(detail.waveCode) })}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--sc-text-secondary)]">
                        {detail.lines.filter((item) => item.remainingQty === 0).length}/
                        {detail.lines.length}
                      </span>
                      <PickLineLabels
                        waveCode={shortWaveReference(detail.waveCode)}
                        lines={detail.lines}
                      />
                      <Badge
                        label={t(`statuses.${detail.status}`)}
                        status={
                          detail.status === 'COMPLETED'
                            ? 'success'
                            : detail.status === 'EXCEPTION'
                              ? 'warning'
                              : 'info'
                        }
                      />
                    </div>
                  </div>
                  {manager && staff.some((person) => person.id === detail.assigneeId) && (
                    <p className="mb-2 text-sm text-[var(--sc-text-secondary)]">
                      {t('assignee')}:{' '}
                      <strong className="font-semibold text-[var(--sc-text-primary)]">
                        {staff.find((person) => person.id === detail.assigneeId)?.fullName}
                      </strong>
                    </p>
                  )}
                  <p className="mb-4 rounded-lg bg-[var(--sc-bg-secondary)]/65 px-3 py-2 text-xs text-[var(--sc-text-secondary)]">
                    {t(manager ? 'reviewHint' : 'scanHint')}
                  </p>
                  <div className="space-y-3">
                    {detail.lines.map((line) => (
                      <PickLineCard
                        warehouseId={warehouse}
                        key={`${line.id}:${line.version}`}
                        line={line}
                        disabled={!!pending || busy}
                        manager={manager}
                        execute={execute}
                        canConfirm={
                          can('warehouse.picking.confirm') &&
                          line.id ===
                            detail.lines.find((item) => item.remainingQty > 0 && !item.shortage)?.id
                        }
                      />
                    ))}
                  </div>
                  {(lineCursor || detail.nextCursor) && (
                    <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--sc-border-default)] pt-3">
                      {lineCursor && (
                        <Button
                          variant="outline"
                          disabled={busy || !!pending}
                          onClick={() => setLineCursor(null)}
                        >
                          {t('firstLines')}
                        </Button>
                      )}
                      {detail.nextCursor && (
                        <Button
                          variant="outline"
                          disabled={busy || !!pending}
                          onClick={() => setLineCursor(detail.nextCursor)}
                        >
                          {t('nextLines')}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
function WaveForm({
  warehouseId,
  staff,
  disabled,
  onSubmit,
}: {
  warehouseId: string;
  staff: { id: string; fullName: string }[];
  disabled: boolean;
  onSubmit: (v: z.infer<typeof pickWaveFormSchema>) => void;
}) {
  const t = useTranslations('Picking');
  const f = useForm<z.infer<typeof pickWaveFormSchema>>({
    resolver: zodResolver(pickWaveFormSchema),
    defaultValues: { assigneeId: '', cutoffAt: currentCutoffInput(), maxParcels: 20 },
  });
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof pickingApi.previewWave>> | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const cutoffAt = f.watch('cutoffAt');
  const maxParcels = f.watch('maxParcels');
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [cutoffAt, maxParcels, warehouseId]);
  const requestPreview = async () => {
    if (!(await f.trigger(['cutoffAt', 'maxParcels']))) {
      notifyInvalidForm();
      return;
    }
    const values = f.getValues();
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      setPreview(
        await pickingApi.previewWave(
          warehouseId,
          new Date(values.cutoffAt).toISOString(),
          values.maxParcels,
        ),
      );
    } catch (cause) {
      const code = cause instanceof ApiError ? (cause.code.split('.').at(-1) ?? '') : '';
      setPreviewError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('previewError'));
    } finally {
      setPreviewBusy(false);
    }
  };
  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 font-semibold">{t('waveSetup')}</h2>
        <form onSubmit={f.handleSubmit(onSubmit, () => notifyInvalidForm())} className="space-y-3">
          <Input
            type="datetime-local"
            label={t('cutoff')}
            required
            {...f.register('cutoffAt')}
            disabled={disabled}
            error={f.formState.errors.cutoffAt ? t('required') : undefined}
          />
          <Select
            label={t('assignee')}
            required
            options={staff.map((s) => ({ value: s.id, label: s.fullName }))}
            {...f.register('assigneeId')}
            disabled={disabled}
            error={f.formState.errors.assigneeId ? t('required') : undefined}
          />
          <Input
            type="number"
            min={1}
            max={50}
            label={t('cartCapacity')}
            {...f.register('maxParcels', { valueAsNumber: true })}
            disabled={disabled}
            error={f.formState.errors.maxParcels ? t('capacityInvalid') : undefined}
          />
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('cartCapacityHint')}</p>
          {preview && (
            <div
              className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-sm"
              role="status"
            >
              {preview.firstParcelTooLarge
                ? t('firstParcelTooLarge')
                : t('wavePreview', {
                    proposedOrders: preview.proposedOrders,
                    proposedParcels: preview.proposedParcels,
                  })}
              {preview.candidateScanLimitReached && <p className="mt-1">{t('previewScanLimit')}</p>}
            </div>
          )}
          {previewError && <Alert variant="error">{previewError}</Alert>}
          <div className="grid gap-2">
            <Button
              className="w-full"
              type="button"
              variant="outline"
              disabled={disabled || previewBusy}
              isLoading={previewBusy}
              onClick={() => void requestPreview()}
            >
              {t('previewWave')}
            </Button>
            <Button
              className="w-full"
              type="submit"
              disabled={
                disabled ||
                previewBusy ||
                (!!preview &&
                  ((preview.proposedParcels === 0 && !preview.candidateScanLimitReached) ||
                    preview.firstParcelTooLarge))
              }
            >
              {t('createWave')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
function isTechnicalLotCode(value: string) {
  return /^(?:[a-z]{2,5}-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function shortWaveReference(value: string) {
  const reference = value.replace(/^PICK-/i, '');
  return reference.length > 8 ? reference.slice(0, 8).toUpperCase() : reference;
}
function PickLineCard({
  warehouseId,
  line,
  disabled,
  manager,
  canConfirm,
  execute,
}: {
  warehouseId: string;
  line: PickLine;
  disabled: boolean;
  manager: boolean;
  canConfirm: boolean;
  execute: (c: PickPending) => Promise<'LOT_SCAN_REQUIRED' | void>;
}) {
  const t = useTranslations('Picking'),
    [mode, setMode] = useState<'scan' | 'short'>('scan'),
    [step, setStep] = useState<(typeof PICK_STEPS)[number]>('binScan'),
    [uploadBusy, setUploadBusy] = useState(false),
    [resolvingBin, setResolvingBin] = useState(false);
  const binLookupSeq = useRef(0),
    binLookupAbort = useRef<AbortController | null>(null);
  const f = useForm<z.infer<typeof pickScanSchema>>({
    resolver: zodResolver(pickScanSchema),
    defaultValues: { binScan: '', skuScan: '', lotScan: '', qty: 1 },
  });
  const shortage = useForm<z.infer<typeof pickShortFormSchema>>({
    resolver: zodResolver(pickShortFormSchema),
    defaultValues: { observedQty: 0 },
  });
  const approval = useForm<z.infer<typeof pickApprovalSchema>>({
    resolver: zodResolver(pickApprovalSchema),
  });
  useEffect(() => {
    if (
      canConfirm &&
      !disabled &&
      !resolvingBin &&
      mode === 'scan' &&
      line.remainingQty > 0 &&
      !line.shortage
    ) {
      f.setFocus(step);
    }
  }, [f, canConfirm, disabled, resolvingBin, mode, step, line.remainingQty, line.shortage]);
  useEffect(() => {
    return () => {
      binLookupSeq.current += 1;
      binLookupAbort.current?.abort();
    };
  }, []);
  async function resolveScannedBinIfNeeded(code: string): Promise<string | null> {
    if (code === line.binCode) return code;
    binLookupAbort.current?.abort();
    const controller = new AbortController();
    binLookupAbort.current = controller;
    const seq = ++binLookupSeq.current;
    setResolvingBin(true);
    try {
      const resolved = await pickingApi.resolveBinCode(warehouseId, code, controller.signal);
      if (seq !== binLookupSeq.current || controller.signal.aborted) return null;
      return resolved ? normalizeScannedCode(resolved) : code;
    } finally {
      if (seq === binLookupSeq.current) setResolvingBin(false);
    }
  }
  async function acceptScan(field: PickScanField, rawCode: string) {
    if (disabled || resolvingBin) return;
    const structured = parsePickQrPayload(rawCode);
    const scanned: Partial<Record<PickScanField, string>> = structured
      ? { binScan: structured.bin, skuScan: structured.sku, lotScan: structured.lot }
      : { [field]: normalizeScannedCode(rawCode) };
    const expected = { binScan: line.binCode, skuScan: line.sku, lotScan: line.lotCode };
    let next: (typeof PICK_STEPS)[number] = field;
    for (const name of PICK_SCAN_FIELDS.slice(PICK_SCAN_FIELDS.indexOf(field))) {
      const code = scanned[name];
      if (!code && name !== field) break;
      const actual = name === 'binScan' && code ? await resolveScannedBinIfNeeded(code) : code;
      if (actual === null) return;
      f.setValue(name, actual ?? '', { shouldDirty: true });
      if (!actual || actual !== expected[name]) {
        setStep(name);
        f.setError(name, { message: t(`errors.${PICK_SCAN_ERRORS[name]}`) }, { shouldFocus: true });
        return;
      }
      f.clearErrors(name);
      next = getNextPickScanField(name);
    }
    setStep(next);
  }
  const stepIndex = PICK_STEPS.indexOf(step);
  const backStep = PICK_STEPS[stepIndex - 1];
  const isCompleted = line.remainingQty === 0;
  const isActivePick = line.remainingQty > 0 && canConfirm && !line.shortage;
  return (
    <section
      className={`space-y-3 rounded-xl border p-4 transition-colors ${
        line.shortage
          ? 'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/20'
          : isCompleted
            ? 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)]/20'
            : isActivePick
              ? 'border-[var(--sc-primary)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)]'
              : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="min-w-0 break-words text-sm font-semibold text-[var(--sc-text-primary)]">
            {line.productName}
          </h3>
          <span className="inline-flex items-center rounded-md bg-[var(--sc-bg-secondary)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--sc-text-primary)]">
            {line.sku}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PickLineLabels waveCode={line.orderCode} lines={[line]} label={t('lineQr')} size="sm" />
          <p
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              isCompleted
                ? 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]'
                : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]'
            }`}
          >
            {t('progress', { picked: line.pickedQty, remaining: line.remainingQty })}
          </p>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 p-3 text-sm">
        <p className="font-semibold text-[var(--sc-text-primary)]">
          {t('pickForOrder', { orderCode: line.orderCode, parcelNo: line.parcelNo })}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2.5 py-1 text-[var(--sc-text-secondary)]">
            {t('bin')}:{' '}
            <strong className="font-mono font-semibold text-[var(--sc-text-primary)]">
              {line.binCode}
            </strong>
          </span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2.5 py-1 text-[var(--sc-text-secondary)]">
            {t('lot')}:{' '}
            <strong className="break-all font-mono font-semibold text-[var(--sc-text-primary)]">
              {line.lotCode}
            </strong>
          </span>
        </div>
      </div>
      {line.shortage ? (
        <div className="space-y-3">
          <Alert variant="warning">
            {t('shortPending')} · {line.shortage.evidenceRefs.reason}
            <p className="mt-1">
              {t('shortageQuantities', {
                observed: line.shortage.evidenceRefs.observedQty,
                remaining: line.shortage.evidenceRefs.remainingQty,
                picked: line.shortage.evidenceRefs.pickedQty,
              })}
            </p>
          </Alert>
          <PickShortEvidence
            warehouseId={warehouseId}
            lineId={line.id}
            disabled={disabled}
            evidenceKey={line.shortage.evidenceRefs.evidenceKey}
          />
          {manager && (
            <form
              className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3"
              onSubmit={approval.handleSubmit(
                (v) =>
                  void execute({
                    path: `pick-shortages/${line.shortage?.id}/replacement`,
                    payload: { ...v, clientScanId: createUuid() },
                  }),
                () => notifyInvalidForm(),
              )}
            >
              <div className="min-w-52 flex-1">
                <Input
                  label={t('approvalReason')}
                  {...approval.register('reason')}
                  error={approval.formState.errors?.reason?.message}
                  required
                  disabled={disabled}
                />
              </div>
              <Button type="submit" disabled={disabled}>
                {t('approveReplacement')}
              </Button>
            </form>
          )}
        </div>
      ) : line.remainingQty > 0 && canConfirm ? (
        <div className="space-y-3">
          <div className="inline-flex gap-1 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/70 p-1">
            <Button
              size="sm"
              variant={mode === 'scan' ? 'primary' : 'ghost'}
              disabled={disabled || uploadBusy}
              onClick={() => setMode('scan')}
            >
              {t('scan')}
            </Button>
            <Button
              size="sm"
              variant={mode === 'short' ? 'primary' : 'ghost'}
              disabled={disabled || resolvingBin}
              onClick={() => setMode('short')}
            >
              {t('reportShort')}
            </Button>
          </div>
          {mode === 'scan' ? (
            <form
              className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]/45 p-3.5"
              autoComplete="off"
              onSubmit={
                step === 'qty'
                  ? f.handleSubmit(
                      async (v) => {
                        const result = await execute({
                          path: `pick-lines/${line.id}/confirm`,
                          payload: {
                            binScan: v.binScan,
                            skuScan: v.skuScan,
                            ...(v.lotScan ? { lotScan: v.lotScan } : {}),
                            qty: v.qty,
                            expectedVersion: line.version,
                            clientScanId: createUuid(),
                          },
                        });
                        if (result === 'LOT_SCAN_REQUIRED') setStep('lotScan');
                      },
                      () => notifyInvalidForm(),
                    )
                  : (event) => {
                      event.preventDefault();
                      void acceptScan(step, f.getValues(step));
                    }
              }
            >
              <p className="text-xs text-[var(--sc-text-secondary)]" aria-live="polite">
                {t('scanProgress', { step: stepIndex + 1, total: PICK_STEPS.length })}
              </p>
              {step === 'qty' ? (
                <Input
                  key={step}
                  type="number"
                  label={t('qty')}
                  {...f.register('qty', { valueAsNumber: true })}
                  onFocus={(event) => event.currentTarget.select()}
                  disabled={disabled}
                  required
                  min={1}
                  max={line.remainingQty}
                  error={f.formState.errors.qty ? t('invalidQty') : undefined}
                />
              ) : (
                <div key={step} className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      label={t(step)}
                      {...f.register(step, {
                        onChange: () => f.clearErrors(step),
                      })}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        void acceptScan(step, event.currentTarget.value);
                      }}
                      readOnly={resolvingBin}
                      disabled={disabled}
                      required
                      helperText={step === 'lotScan' ? t('lotOptional') : undefined}
                      error={f.formState.errors[step]?.message}
                    />
                  </div>
                  <BarcodeScanButton
                    label={t(`scanCamera.${step}`)}
                    className="mt-6"
                    disabled={disabled || resolvingBin}
                    onScan={(code) => void acceptScan(step, code)}
                  />
                </div>
              )}
              {resolvingBin && (
                <p className="text-xs text-[var(--sc-text-secondary)]" role="status">
                  {t('resolvingBin')}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {backStep && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || resolvingBin}
                    onClick={() => setStep(backStep)}
                  >
                    {t('previousStep')}
                  </Button>
                )}
                {step === 'lotScan' && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => {
                      f.setValue('lotScan', '');
                      f.clearErrors('lotScan');
                      setStep('qty');
                    }}
                  >
                    {t('skipLot')}
                  </Button>
                )}
                <Button type="submit" className="min-h-11" disabled={disabled || resolvingBin}>
                  {t(step === 'qty' ? 'confirmScan' : 'continueScan')}
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="grid gap-3 rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/20 p-3.5 sm:grid-cols-2"
              onSubmit={shortage.handleSubmit(
                (v) =>
                  execute({
                    path: `pick-lines/${line.id}/shortages`,
                    payload: { ...v, expectedVersion: line.version, clientScanId: createUuid() },
                  }),
                () => notifyInvalidForm(),
              )}
            >
              <Input
                type="number"
                label={t('observed')}
                {...shortage.register('observedQty', { valueAsNumber: true })}
                error={shortage.formState.errors?.observedQty?.message}
                disabled={disabled}
                required
                min={0}
                max={line.remainingQty - 1}
              />
              <PickShortEvidence
                warehouseId={warehouseId}
                lineId={line.id}
                disabled={disabled}
                onBusyChange={setUploadBusy}
                evidenceKey={shortage.watch('evidenceKey')}
                onVerified={(key) =>
                  shortage.setValue('evidenceKey', key, { shouldValidate: true })
                }
              />
              {shortage.formState.errors.evidenceKey && (
                <Alert variant="error" compact className="sm:col-span-2">
                  {t('evidenceRequired')}
                </Alert>
              )}
              <div className="sm:col-span-2">
                <Input
                  label={t('reason')}
                  {...shortage.register('reason')}
                  error={shortage.formState.errors?.reason?.message}
                  disabled={disabled}
                  required
                />
              </div>
              <Button
                type="submit"
                className="sm:col-span-2"
                disabled={disabled || uploadBusy || !shortage.watch('evidenceKey')}
              >
                {t('reportShort')}
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}
