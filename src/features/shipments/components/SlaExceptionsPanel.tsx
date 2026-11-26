import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Link, useSearchParams } from 'react-router-dom';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { useRealtimeSync } from '@/features/realtime-notifications';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import styles from './SlaExceptionsPanel.module.css';
import { shipmentApi } from '../api/shipmentApi';

import type { SlaException } from '../schemas/shipmentSchema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_REASON_FILTERS = new Set<SlaException['reasonCode']>([
  'SLA.HANDOVER_OVERDUE',
  'SLA.TRACKING_STALLED',
  'DISPATCH.LABEL_RETRIES_EXHAUSTED',
]);

type FulfillmentStageKey =
  | 'WAITING_PICK'
  | 'PICKING'
  | 'WAITING_PACK'
  | 'WAITING_LABEL'
  | 'WAITING_LABEL_VERIFYING'
  | 'WAITING_HANDOVER'
  | 'DISPATCH_FAILED'
  | 'HANDED_OVER'
  | 'OTHER';

type OverdueJumpAction = {
  readonly to: string;
  readonly labelKey:
    | 'actionOpenHandover'
    | 'actionOpenPacking'
    | 'actionOpenPicking'
    | 'actionOpenShipments';
};

type SlaOverdueElapsed =
  | { readonly kind: 'days_hours'; readonly days: number; readonly hours: number }
  | { readonly kind: 'hours_minutes'; readonly hours: number; readonly minutes: number }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'under_minute' };

function computeOverdueElapsed(
  deadlineIso: string | null | undefined,
  nowMs: number,
): SlaOverdueElapsed | null {
  if (!deadlineIso) return null;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return null;
  const elapsedMs = nowMs - deadlineMs;
  if (elapsedMs <= 0) return null;
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  if (totalMinutes < 1) return { kind: 'under_minute' };
  if (totalMinutes < 60) return { kind: 'minutes', minutes: totalMinutes };
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return { kind: 'hours_minutes', hours: totalHours, minutes: totalMinutes % 60 };
  }
  return { kind: 'days_hours', days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

function mapFulfillmentStatusToStageKey(
  status: string | null | undefined,
): FulfillmentStageKey | null {
  if (!status) return null;
  switch (status) {
    case 'CREATED':
    case 'STOCK_RESERVED':
    case 'RATED':
    case 'ALLOCATION_FAILED':
      return 'WAITING_PICK';
    case 'PICK_ASSIGNED':
    case 'PICKING':
      return 'PICKING';
    case 'PICKED':
      return 'WAITING_PACK';
    case 'PACKED_AWAITING_LABEL':
      return 'WAITING_LABEL';
    case 'LABEL_VERIFYING':
      return 'WAITING_LABEL_VERIFYING';
    case 'PACKED':
    case 'LABEL_CREATED':
    case 'DISPATCHED':
      return 'WAITING_HANDOVER';
    case 'DISPATCH_FAILED':
      return 'DISPATCH_FAILED';
    case 'HANDED_OVER':
      return 'HANDED_OVER';
    default:
      return 'OTHER';
  }
}

function resolveOverdueParcelAction(
  row: SlaException,
  routeAccess: {
    readonly canHandover: boolean;
    readonly canPacking: boolean;
    readonly canPicking: boolean;
    readonly canShipments: boolean;
  },
): OverdueJumpAction | null {
  if (row.reasonCode !== 'SLA.HANDOVER_OVERDUE' || row.status === 'RESOLVED') return null;
  const fulfillmentId =
    row.fulfillmentOrderId ?? (row.aggregateType === 'fulfillment_order' ? row.aggregateId : null);
  if (!fulfillmentId) return null;

  const query = new URLSearchParams({
    warehouse: row.warehouseId,
    fulfillment: fulfillmentId,
  }).toString();

  const stageKey = mapFulfillmentStatusToStageKey(row.fulfillmentStatus);
  if (stageKey === 'HANDED_OVER') return null;

  if (stageKey === 'DISPATCH_FAILED') {
    if (routeAccess.canShipments) {
      return { to: '/shipments', labelKey: 'actionOpenShipments' };
    }
    if (routeAccess.canPacking) {
      return { to: `/warehouse/packing?${query}`, labelKey: 'actionOpenPacking' };
    }
    return null;
  }

  if (
    stageKey === 'WAITING_PACK' ||
    stageKey === 'WAITING_LABEL' ||
    stageKey === 'WAITING_LABEL_VERIFYING'
  ) {
    return routeAccess.canPacking
      ? { to: `/warehouse/packing?${query}`, labelKey: 'actionOpenPacking' }
      : null;
  }

  if (stageKey === 'WAITING_PICK' || stageKey === 'PICKING') {
    return routeAccess.canPicking
      ? { to: `/warehouse/picking?${query}`, labelKey: 'actionOpenPicking' }
      : null;
  }

  // Default for PACKED / LABEL_CREATED / DISPATCHED / unknown stage on overdue handover: Handover screen.
  if (routeAccess.canHandover) {
    return { to: `/warehouse/handover?${query}`, labelKey: 'actionOpenHandover' };
  }
  if (routeAccess.canPacking) {
    return { to: `/warehouse/packing?${query}`, labelKey: 'actionOpenPacking' };
  }
  return null;
}

function getLoadError(
  failure: unknown,
  messages: {
    network: string;
    permission: string;
    invalidResponse: string;
    general: string;
  },
) {
  if (failure instanceof ApiError) {
    if (failure.status === 0) return messages.network;
    if (failure.status === 403) return messages.permission;
  }
  if (failure instanceof Error && failure.name === 'ZodError') return messages.invalidResponse;
  return messages.general;
}

function matchesHighlight(row: SlaException, highlightId: string | null): boolean {
  if (!highlightId) return false;
  return (
    row.id === highlightId ||
    row.aggregateId === highlightId ||
    row.fulfillmentOrderId === highlightId
  );
}

/**
 * SS-1319 / UC-104: overdue handover and stalled carrier progress for platform operators.
 * Breaches close automatically when the parcel is handed over or the carrier reports progress.
 */
export function SlaExceptionsPanel() {
  const t = useTranslations('SlaExceptions');
  const { can, isRouteAllowed } = useAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const locale = useLocaleStore((state) => state.locale);
  const authRevision = useAuthStore((state) => state.revision);
  const [isOpenOnly, setIsOpenOnly] = useState(true);
  const [items, setItems] = useState<SlaException[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  const scrolledHighlightRef = useRef<string | null>(null);

  const rawWarehouseParam = searchParams.get('warehouse');
  const warehouseFilter =
    rawWarehouseParam && UUID_RE.test(rawWarehouseParam) ? rawWarehouseParam : null;
  const rawReasonParam = searchParams.get('reason');
  const reasonFilter =
    rawReasonParam && ALLOWED_REASON_FILTERS.has(rawReasonParam as SlaException['reasonCode'])
      ? (rawReasonParam as SlaException['reasonCode'])
      : null;
  const rawHighlightParam = searchParams.get('highlight');
  const highlightFilter =
    rawHighlightParam && UUID_RE.test(rawHighlightParam) ? rawHighlightParam : null;
  const hasActiveFilter = Boolean(warehouseFilter || reasonFilter || highlightFilter);
  const isOverdueFocus = reasonFilter === 'SLA.HANDOVER_OVERDUE';

  // Keep overdue elapsed badges accurate while the tab is open.
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const interval = window.setInterval(tick, 60_000);
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') tick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const displayedItems = useMemo(
    () =>
      items.filter((row) => {
        if (warehouseFilter && row.warehouseId !== warehouseFilter) return false;
        if (reasonFilter && row.reasonCode !== reasonFilter) return false;
        return true;
      }),
    [items, reasonFilter, warehouseFilter],
  );

  const openOverdueCount = useMemo(
    () =>
      displayedItems.filter(
        (row) => row.reasonCode === 'SLA.HANDOVER_OVERDUE' && row.status !== 'RESOLVED',
      ).length,
    [displayedItems],
  );

  const highlightedRow = useMemo(
    () =>
      highlightFilter
        ? (displayedItems.find((row) => matchesHighlight(row, highlightFilter)) ?? null)
        : null,
    [displayedItems, highlightFilter],
  );

  const matchedWarehouseCode = useMemo(() => {
    if (!warehouseFilter) return null;
    return items.find((row) => row.warehouseId === warehouseFilter)?.warehouseCode ?? null;
  }, [items, warehouseFilter]);

  const clearContextFilter = () => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('warehouse');
        next.delete('reason');
        next.delete('highlight');
        return next;
      },
      { replace: true },
    );
  };

  const loadErrorMessage = t('loadError');
  const networkErrorMessage = t('networkError');
  const permissionErrorMessage = t('permissionError');
  const invalidResponseMessage = t('invalidResponse');
  const generalErrorMessage = t('loadErrorDetail');
  const canAssign = can('shipments.sla.assign');

  const routeAccess = useMemo(
    () => ({
      canHandover: isRouteAllowed('/warehouse/handover'),
      canPacking: isRouteAllowed('/warehouse/packing'),
      canPicking: isRouteAllowed('/warehouse/picking'),
      canShipments: isRouteAllowed('/shipments'),
    }),
    [isRouteAllowed],
  );

  const localeTag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(localeTag) : '—';

  const formatParcelLabel = useCallback(
    (row: SlaException) => {
      if (row.orderCode) {
        return row.parcelNo
          ? t('parcelTitle', { orderCode: row.orderCode, parcelNo: row.parcelNo })
          : row.orderCode;
      }
      return row.trackingNumber ?? row.aggregateId.slice(0, 8);
    },
    [t],
  );

  const formatOverdueElapsed = useCallback(
    (deadlineIso: string | null) => {
      const elapsed = computeOverdueElapsed(deadlineIso, nowMs);
      if (!elapsed) return null;
      if (elapsed.kind === 'under_minute') return t('overdueElapsedUnderMinute');
      if (elapsed.kind === 'minutes') {
        return t('overdueElapsedMinutes', { minutes: elapsed.minutes });
      }
      if (elapsed.kind === 'hours_minutes') {
        return elapsed.minutes > 0
          ? t('overdueElapsedHoursMinutes', { hours: elapsed.hours, minutes: elapsed.minutes })
          : t('overdueElapsedHours', { hours: elapsed.hours });
      }
      return elapsed.hours > 0
        ? t('overdueElapsedDaysHours', { days: elapsed.days, hours: elapsed.hours })
        : t('overdueElapsedDays', { days: elapsed.days });
    },
    [nowMs, t],
  );

  const load = useCallback(
    async (before: string | null) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setIsLoading(true);
      setError(null);
      try {
        const page = await shipmentApi.slaExceptions(isOpenOnly, before, abort.signal, {
          warehouseId: warehouseFilter,
          reasonCode: reasonFilter,
        });
        if (abort.signal.aborted) return;
        setItems((current) => (before ? [...current, ...page.items] : page.items));
        setNextCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (!abort.signal.aborted) {
          setError(
            getLoadError(failure, {
              network: networkErrorMessage,
              permission: permissionErrorMessage,
              invalidResponse: invalidResponseMessage,
              general: generalErrorMessage,
            }),
          );
        }
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    },
    [
      generalErrorMessage,
      invalidResponseMessage,
      isOpenOnly,
      networkErrorMessage,
      permissionErrorMessage,
      reasonFilter,
      warehouseFilter,
    ],
  );

  useEffect(() => {
    void load(null);
    return () => controller.current?.abort();
  }, [load, authRevision]);

<<<<<<< HEAD
  useRealtimeSync(['sla.exceptions', 'shipments.tracking'], () => {
    void load(null);
  });
=======

  // Smoothly scroll a specifically requested parcel row into view once loaded.
  useEffect(() => {
    if (!highlightFilter || !highlightedRow || isLoading) return;
    if (scrolledHighlightRef.current === highlightedRow.id) return;
    const rowEl = document.getElementById(`sla-exception-row-${highlightedRow.id}`);
    if (!rowEl) return;
    scrolledHighlightRef.current = highlightedRow.id;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rowEl.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [highlightFilter, highlightedRow, isLoading]);
>>>>>>> origin/develop

  const handleAssign = async (row: SlaException) => {
    setAssigningId(row.id);
    setActionError(null);
    const revision = useAuthStore.getState().revision;
    try {
      await shipmentApi.assignSlaException(row.id);
      if (revision !== useAuthStore.getState().revision) return;
      await load(null);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : t('assignError'));
    } finally {
      setAssigningId(null);
    }
  };

  const handleRetryLabel = async (row: SlaException) => {
    setAssigningId(row.id);
    setActionError(null);
    const revision = useAuthStore.getState().revision;
    try {
      await shipmentApi.retryLabelException(row.id);
      if (revision !== useAuthStore.getState().revision) return;
      await load(null);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : t('retryLabelError'));
    } finally {
      setAssigningId(null);
    }
  };

  const backToPickingPath = warehouseFilter
    ? `/warehouse/picking?${new URLSearchParams({ warehouse: warehouseFilter }).toString()}`
    : '/warehouse/picking';

  const columns: ColumnDef<SlaException>[] = [
    {
      key: 'reference',
      label: t('reference'),
      render: (row) => {
        const primaryLabel = formatParcelLabel(row);
        const stageKey = mapFulfillmentStatusToStageKey(row.fulfillmentStatus);
        const isHighlighted = matchesHighlight(row, highlightFilter);
        const showSecondaryTracking =
          Boolean(row.orderCode) &&
          Boolean(row.trackingNumber) &&
          row.trackingNumber !== primaryLabel;

        return (
          <div className="min-w-0">
            <div className={styles.parcelPrimary}>
              <span className={styles.parcelCode}>{primaryLabel}</span>
              {isHighlighted && <span className={styles.selectedTag}>{t('selectedTag')}</span>}
            </div>
            {(stageKey || showSecondaryTracking) && (
              <div className={styles.parcelMeta}>
                {stageKey && <span className={styles.stageChip}>{t(`stages.${stageKey}`)}</span>}
                {showSecondaryTracking && row.trackingNumber && (
                  <span className={styles.trackingRef}>
                    {t('trackingShort', { code: row.trackingNumber })}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'reason',
      label: t('reason'),
      render: (row) => {
        const label = t(
          `reasonCode.${row.reasonCode === 'SLA.HANDOVER_OVERDUE' ? 'HANDOVER' : row.reasonCode === 'SLA.TRACKING_STALLED' ? 'STALLED' : 'LABEL'}`,
        );
        if (row.status === 'RESOLVED') {
          return <span className="text-[var(--sc-text-secondary)]">{label}</span>;
        }
        return (
          <Badge
            status={row.reasonCode === 'SLA.HANDOVER_OVERDUE' ? 'error' : 'warning'}
            label={label}
          />
        );
      },
    },
    {
      key: 'clock',
      label: t('clock'),
      render: (row) => {
        if (row.reasonCode === 'SLA.HANDOVER_OVERDUE') {
          const overdueElapsed =
            row.status !== 'RESOLVED' ? formatOverdueElapsed(row.deadline) : null;
          return (
            <div>
              {overdueElapsed && (
                <span className={styles.overdueDurationPill}>
                  <AlertTriangle aria-hidden="true" size={12} />
                  <span>{overdueElapsed}</span>
                </span>
              )}
              <div className={styles.clockSubtext}>
                {t('deadlineValue', { time: formatTime(row.deadline) })}
              </div>
            </div>
          );
        }
        if (row.reasonCode === 'SLA.TRACKING_STALLED') {
          return (
            <span className="tabular-nums">
              {t('stalledValue', {
                time: formatTime(row.lastProgressAt),
                hours: row.stallHours ?? 0,
              })}
            </span>
          );
        }
        return <span className="tabular-nums">{formatTime(row.createdAt)}</span>;
      },
    },
    {
      key: 'warehouseCode',
      label: t('warehouse'),
      render: (row) => (
        <span className="font-medium tabular-nums text-[var(--sc-text-primary)]">
          {row.warehouseCode}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('state'),
      render: (row) => (
        <Badge
          status={row.status === 'RESOLVED' ? 'success' : row.isAssigned ? 'info' : 'warning'}
          label={
            row.status === 'RESOLVED'
              ? t('resolved')
              : row.reasonCode === 'DISPATCH.LABEL_RETRIES_EXHAUSTED' &&
                  row.isAssignedToMe &&
                  !row.canRetryLabel
                ? t('retryScheduled')
                : row.isAssignedToMe
                  ? t('mine')
                  : row.isAssigned
                    ? t('assigned')
                    : t('open')
          }
        />
      ),
    },
    {
      key: 'actions',
      label: t('actions'),
      align: 'right',
      render: (row) => {
        const jumpAction = resolveOverdueParcelAction(row, routeAccess);
        const showRetryLabel =
          canAssign &&
          row.reasonCode === 'DISPATCH.LABEL_RETRIES_EXHAUSTED' &&
          row.isAssignedToMe &&
          row.canRetryLabel;
        const showAssign = canAssign && row.status !== 'RESOLVED' && !row.isAssigned;

        if (!jumpAction && !showRetryLabel && !showAssign) {
          return <span className="text-xs text-[var(--sc-text-tertiary)]">—</span>;
        }

        return (
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            {jumpAction && (
              <Link to={jumpAction.to} className={styles.quickJumpLink}>
                <span>{t(jumpAction.labelKey)}</span>
                <ArrowUpRight aria-hidden="true" size={13} className="shrink-0 opacity-80" />
              </Link>
            )}
            {showRetryLabel ? (
              <Button
                size="sm"
                variant="outline"
                isLoading={assigningId === row.id}
                onClick={() => void handleRetryLabel(row)}
              >
                {t('retryLabel')}
              </Button>
            ) : showAssign ? (
              <Button
                size="sm"
                variant="outline"
                isLoading={assigningId === row.id}
                onClick={() => void handleAssign(row)}
              >
                {t('assign')}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const getRowClassName = (row: SlaException): string | undefined => {
    const isHighlighted = matchesHighlight(row, highlightFilter);
    const isActiveOverdue = row.reasonCode === 'SLA.HANDOVER_OVERDUE' && row.status !== 'RESOLVED';
    if (isHighlighted) {
      return isActiveOverdue ? styles.highlightedRow : styles.highlightedNeutralRow;
    }
    if (isActiveOverdue) {
      return styles.overdueRow;
    }
    return undefined;
  };

  return (
    <section aria-labelledby="sla-exceptions-title">
      <Card
        padding="none"
        className={`${styles.panelCard} ${
          isOverdueFocus && openOverdueCount > 0 ? styles.panelCardOverdue : ''
        }`}
      >
        <div
          className={`${styles.panelHeader} ${
            isOverdueFocus && openOverdueCount > 0 ? styles.panelHeaderOverdue : ''
          }`}
        >
          <div className="flex min-w-0 gap-3">
            <span
              className={`${styles.headerIcon} ${
                isOverdueFocus && openOverdueCount > 0 ? styles.headerIconOverdue : ''
              }`}
            >
              {isOverdueFocus && openOverdueCount > 0 ? (
                <AlertTriangle aria-hidden="true" size={21} />
              ) : (
                <Clock3 aria-hidden="true" size={21} />
              )}
            </span>
            <div className="min-w-0">
              <h1 id="sla-exceptions-title" className="text-xl font-semibold">
                {t('title')}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[var(--sc-text-secondary)]">
                {t('description')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <Checkbox
              label={t('openOnly')}
              checked={isOpenOnly}
              onChange={(event) => setIsOpenOnly(event.target.checked)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => void load(null)}
              disabled={isLoading}
            >
              <RefreshCw aria-hidden="true" size={13} />
              <span>{t('refresh')}</span>
            </Button>
          </div>
        </div>

        {!hasActiveFilter && (
          <div className="grid gap-px border-b border-[var(--sc-border-default)] bg-[var(--sc-border-default)] md:grid-cols-2">
            <article className="flex gap-3 bg-[var(--sc-bg-surface)] px-5 py-3 sm:px-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]">
                <PackageCheck aria-hidden="true" size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">
                  {t('handoverTitle')}
                </h3>
                <p className="mt-0.5 text-sm text-[var(--sc-text-secondary)]">
                  {t('handoverDescription')}
                </p>
              </div>
            </article>
            <article className="flex gap-3 bg-[var(--sc-bg-surface)] px-5 py-3 sm:px-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]">
                <Truck aria-hidden="true" size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">
                  {t('trackingTitle')}
                </h3>
                <p className="mt-0.5 text-sm text-[var(--sc-text-secondary)]">
                  {t('trackingDescription')}
                </p>
              </div>
            </article>
          </div>
        )}

        {hasActiveFilter && (
          <div
            className={`${styles.focusStrip} ${
              isOverdueFocus && openOverdueCount > 0 ? styles.focusStripOverdue : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isOverdueFocus && openOverdueCount > 0 ? (
                <span className={styles.focusCountPill}>
                  <AlertTriangle aria-hidden="true" size={13} />
                  <span>
                    {nextCursor
                      ? t('overdueCountSummaryMore', { count: openOverdueCount })
                      : t('overdueCountSummary', { count: openOverdueCount })}
                  </span>
                </span>
              ) : (
                <span className="font-medium text-[var(--sc-text-primary)]">
                  {t('filteredContext')}
                </span>
              )}
              {matchedWarehouseCode && (
                <Badge
                  status="info"
                  label={t('filteredWarehouseLabel', { code: matchedWarehouseCode })}
                />
              )}
              {reasonFilter && !isOverdueFocus && (
                <Badge
                  status="warning"
                  label={t(
                    `reasonCode.${reasonFilter === 'SLA.TRACKING_STALLED' ? 'STALLED' : 'LABEL'}`,
                  )}
                />
              )}
              {reasonFilter && isOverdueFocus && openOverdueCount === 0 && (
                <Badge status="warning" label={t('filteredReasonHandover')} />
              )}
              {highlightedRow && (
                <span className={styles.focusSelectedPill}>
                  {t('focusedParcelLabel', { label: formatParcelLabel(highlightedRow) })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOverdueFocus && routeAccess.canPicking && (
                <Link to={backToPickingPath} className={styles.backLink}>
                  <ArrowLeft aria-hidden="true" size={13} />
                  <span>{t('backToOutbound')}</span>
                </Link>
              )}
              <Button size="sm" variant="outline" onClick={clearContextFilter}>
                {t('clearFilter')}
              </Button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="p-4 pb-0 sm:px-6">
            <Alert variant="error" onClose={() => setActionError(null)}>
              {actionError}
            </Alert>
          </div>
        )}
        {error ? (
          <div className="p-4 sm:p-6">
            <Alert variant="error" title={loadErrorMessage}>
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => void load(null)}>
                {t('refresh')}
              </Button>
            </Alert>
          </div>
        ) : (
          <DataTable
            ariaLabel={t('tableLabel')}
            columns={columns}
            data={displayedItems}
            isLoading={isLoading && items.length === 0}
            getRowKey={(row) => row.id}
            getRowId={(row) => `sla-exception-row-${row.id}`}
            getRowClassName={getRowClassName}
            emptyMessage={
              <div className="mx-auto flex max-w-md items-start justify-center gap-3 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]">
                  <CheckCircle2 aria-hidden="true" size={19} />
                </span>
                <span>
                  <span className="block font-medium text-[var(--sc-text-primary)]">
                    {t('emptyTitle')}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--sc-text-secondary)]">
                    {hasActiveFilter ? t('filteredEmpty') : t('empty')}
                  </span>
                  {hasActiveFilter && (
                    <span className="mt-2 block">
                      <Button size="sm" variant="outline" onClick={clearContextFilter}>
                        {t('clearFilter')}
                      </Button>
                    </span>
                  )}
                </span>
              </div>
            }
          />
        )}
        {nextCursor && !error && (
          <div className="border-t border-[var(--sc-border-default)] p-3 text-center">
            <Button variant="ghost" isLoading={isLoading} onClick={() => void load(nextCursor)}>
              {t('loadMore')}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
