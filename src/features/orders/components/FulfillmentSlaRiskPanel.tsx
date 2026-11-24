import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Link } from 'react-router-dom';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import styles from './FulfillmentSlaRiskPanel.module.css';
import {
  buildLocalParcelExplanation,
  buildOverdueExceptionsPath,
  computeNextAutoRefreshDelayMs,
  computeParcelTargetSignature,
  createScopedExplanationController,
  createScopedOverdueController,
  createScopedRiskController,
  evaluateRiskViewState,
  formatOverdueElapsedDuration,
  formatRemainingDuration,
  formatRiskClockTime,
  formatRiskProbability,
  formatWarehouseDeadline,
  getItemEffectiveExpiryMs,
  isRiskSnapshotExpired,
  renderGroundedAdvicePattern,
  resolveAdviceActionKey,
  resolveAdviceReasonKey,
  resolveFactTranslation,
  resolvePrimarySignal,
  resolveRiskNavigation,
  summarizeExcludedCoverage,
  type FulfillmentSlaRiskExplanationFact,
  type FulfillmentSlaRiskExplanationLocale,
  type FulfillmentSlaRiskItem,
  type FulfillmentSlaRiskStage,
  type FulfillmentSlaRiskTier,
  type RiskNavigationTarget,
  type ScopedExplanationEntry,
  type ScopedOverdueHandoverState,
  type ScopedRiskSnapshot,
} from '../api/fulfillmentSlaRiskApi';

const DEFAULT_VISIBLE_PRIORITY = 3;
const MAX_INLINE_OVERDUE_CHIPS = 4;
const LOAD_MORE_STEP = 10;
const INITIAL_API_LIMIT = 20;
const MAX_API_LIMIT = 50;
const FOCUS_REFRESH_THROTTLE_MS = 15_000;
const COUNTDOWN_TICK_MS = 60_000;
const DESKTOP_CONTAINER_BREAKPOINT_PX = 720;

const OUTBOUND_PIPELINE_STAGES: readonly FulfillmentSlaRiskStage[] = [
  'WAITING_PICK',
  'PICKING',
  'WAITING_PACK',
  'WAITING_LABEL',
  'WAITING_HANDOVER',
];

const METER_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type PickingDeepLinkRequest =
  | {
      readonly kind: 'open_picking_line';
      readonly fulfillmentOrderId: string;
      readonly waveId: string;
      readonly waveCode: string;
      readonly lineId: string;
      readonly intent: 'shortage' | 'progress';
      readonly exceptionId?: string;
    }
  | {
      readonly kind: 'open_picking_wave';
      readonly fulfillmentOrderId: string;
      readonly waveId: string;
      readonly waveCode: string;
    };

interface FulfillmentSlaRiskPanelProps {
  readonly warehouseId: string;
  readonly warehouseName?: string;
  readonly showWarehouseName?: boolean;
  readonly canManagePicking?: boolean;
  readonly onFocusBacklog: () => void;
  readonly onFocusWaves?: () => void;
  readonly onOpenPickingTarget?: (target: PickingDeepLinkRequest) => void;
}

function stageIndexOf(stage: FulfillmentSlaRiskStage): number {
  const idx = OUTBOUND_PIPELINE_STAGES.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

function isUrgentCountdown(deadlineAt: string, nowMs: number): boolean {
  const remaining = formatRemainingDuration(deadlineAt, nowMs);
  return (
    remaining.kind === 'expired' ||
    remaining.kind === 'under_minute' ||
    remaining.kind === 'minutes'
  );
}

function probabilityTickClass(tier: FulfillmentSlaRiskTier): string {
  if (tier === 'HIGH') return styles.meterTickHigh;
  if (tier === 'MEDIUM') return styles.meterTickMedium;
  return styles.meterTickLow;
}

export function FulfillmentSlaRiskPanel({
  warehouseId,
  warehouseName,
  showWarehouseName = false,
  canManagePicking = true,
  onFocusBacklog,
  onFocusWaves,
  onOpenPickingTarget,
}: FulfillmentSlaRiskPanelProps) {
  const actorId = useAuthStore((s) => s.user?.userId) ?? '';
  const revision = useAuthStore((s) => s.revision);
  const scopeKey = `${actorId}:${revision}:${warehouseId}`;

  const locale = useLocale();
  const explanationLocale: FulfillmentSlaRiskExplanationLocale = locale === 'en' ? 'en' : 'vi';
  const t = useTranslations('FulfillmentSlaRisk');
  const { isRouteAllowed } = useAccess();

  const [snapshot, setSnapshot] = useState<ScopedRiskSnapshot>({
    scopeKey,
    loading: true,
    loadMoreLoading: false,
    loadMoreError: false,
    result: null,
  });
  const [apiLimit, setApiLimit] = useState(INITIAL_API_LIMIT);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_PRIORITY);
  const [lowExpanded, setLowExpanded] = useState(false);
  const [excludedExpanded, setExcludedExpanded] = useState(false);
  const [unavailableParcelIds, setUnavailableParcelIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Active parcel shown in the detail popup modal.
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [conflictRefreshing, setConflictRefreshing] = useState(false);
  const [explanationEntries, setExplanationEntries] = useState<
    Readonly<Record<string, ScopedExplanationEntry>>
  >({});
  const [overdueState, setOverdueState] = useState<ScopedOverdueHandoverState>({
    scopeKey: '',
    status: 'idle',
    count: 0,
    hasMorePages: false,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  );
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true,
  );

  const panelRootRef = useRef<HTMLDivElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastLoadAtRef = useRef(0);
  const mountedRef = useRef(true);
  const controllerRef = useRef<ReturnType<typeof createScopedRiskController> | null>(null);
  const explanationCtrlRef = useRef<ReturnType<typeof createScopedExplanationController> | null>(
    null,
  );
  const overdueCtrlRef = useRef<ReturnType<typeof createScopedOverdueController> | null>(null);
  const apiLimitRef = useRef(INITIAL_API_LIMIT);
  const previousAsOfRef = useRef<string | null>(null);
  const lastScopePrefixRef = useRef('');
  const selectedParcelIdRef = useRef<string | null>(null);
  const explanationLocaleRef = useRef<FulfillmentSlaRiskExplanationLocale>(explanationLocale);
  const announcedExplanationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedParcelIdRef.current = selectedParcelId;
  }, [selectedParcelId]);

  useEffect(() => {
    explanationLocaleRef.current = explanationLocale;
  }, [explanationLocale]);

  const canPackingRoute = isRouteAllowed('/warehouse/packing');
  const canHandoverRoute = isRouteAllowed('/warehouse/handover');
  const canShipmentsRoute = isRouteAllowed('/shipments');
  const canExceptionsRoute = isRouteAllowed('/exceptions');

  // Container-width responsive layout (UI6): adapts cleanly to open/collapsed sidebar and mobile 390px.
  useEffect(() => {
    const node = panelRootRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const updateWidth = (width: number) => {
      if (width > 0) {
        setIsDesktopLayout(width >= DESKTOP_CONTAINER_BREAKPOINT_PX);
      }
    };
    updateWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const triggerLoad = useCallback(
    (
      force = false,
      options?: {
        readonly limitOverride?: number;
        readonly isLoadMore?: boolean;
        readonly preserveOnError?: boolean;
        readonly incrementVisibleBy?: number;
      },
    ) => {
      if (!warehouseId || !controllerRef.current) return;
      const now = Date.now();
      if (!force && now - lastLoadAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      const nextLimit = Math.min(MAX_API_LIMIT, options?.limitOverride ?? apiLimitRef.current);
      if (!options?.isLoadMore) {
        apiLimitRef.current = nextLimit;
        setApiLimit(nextLimit);
      }
      lastLoadAtRef.current = now;
      setNowMs(now);
      void controllerRef.current
        .load(scopeKey, warehouseId, nextLimit, {
          isLoadMore: options?.isLoadMore,
          preserveOnError: options?.preserveOnError,
        })
        .then((nextState) => {
          if (!mountedRef.current || nextState.scopeKey !== scopeKey) return;
          if (options?.isLoadMore) {
            // M3: Only advance apiLimit & visibleCount after THIS in-scope load-more request
            // genuinely succeeded (never when controller preserved stale rows on loadMoreError).
            if (
              nextState.loadMoreSucceeded &&
              !nextState.loadMoreError &&
              nextState.result?.kind === 'ok'
            ) {
              apiLimitRef.current = nextLimit;
              setApiLimit(nextLimit);
              const incrementBy = options.incrementVisibleBy;
              if (incrementBy) {
                setVisibleCount((prev) => prev + incrementBy);
              }
            }
            return;
          }
          if (nextState.result?.kind === 'ok') {
            if (nextState.result.data.state === 'READY') {
              setRetryAttempt(0);
            } else if (
              nextState.result.data.state === 'WARMING_UP' ||
              nextState.result.data.state === 'INSUFFICIENT_DATA' ||
              nextState.result.data.state === 'STALE' ||
              nextState.result.data.state === 'MODEL_UNAVAILABLE'
            ) {
              setRetryAttempt((prev) => Math.min(prev + 1, 4));
            }
          } else if (nextState.result?.kind === 'error') {
            setRetryAttempt((prev) => Math.min(prev + 1, 4));
          }
        });
      if (canExceptionsRoute && !options?.isLoadMore) {
        void overdueCtrlRef.current?.load(scopeKey, warehouseId);
      }
    },
    [canExceptionsRoute, scopeKey, warehouseId],
  );

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    apiLimitRef.current = INITIAL_API_LIMIT;
    previousAsOfRef.current = null;
    lastScopePrefixRef.current = '';
    announcedExplanationKeysRef.current = new Set();
    setApiLimit(INITIAL_API_LIMIT);
    setVisibleCount(DEFAULT_VISIBLE_PRIORITY);
    setLowExpanded(false);
    setExcludedExpanded(false);
    setUnavailableParcelIds(new Set());
    setSelectedParcelId(null);
    setConflictRefreshing(false);
    setExplanationEntries({});
    setRetryAttempt(0);
    setStatusAnnouncement('');
    setOverdueState({ scopeKey: '', status: 'idle', count: 0, hasMorePages: false });

    const ctrl = createScopedRiskController(undefined, (next) => {
      if (active && mountedRef.current) {
        setNowMs(Date.now());
        setSnapshot(next);
        if (next.result?.kind === 'forbidden' || next.result?.kind === 'endpoint_unavailable') {
          explanationCtrlRef.current?.reset('');
          overdueCtrlRef.current?.reset();
          setSelectedParcelId(null);
          setConflictRefreshing(false);
          setExplanationEntries({});
        }
      }
    });
    const expCtrl = createScopedExplanationController(undefined, {
      onChange: (entries) => {
        if (active && mountedRef.current) {
          setExplanationEntries(entries);
        }
      },
      onConflict: () => {
        if (!active || !mountedRef.current) return;
        const staleAsOf = previousAsOfRef.current;
        setConflictRefreshing(true);
        void ctrl
          .load(scopeKey, warehouseId, apiLimitRef.current, { preserveOnError: true })
          .then((nextState) => {
            if (!active || !mountedRef.current || nextState.scopeKey !== scopeKey) return;
            const openId = selectedParcelIdRef.current;
            const nextData = nextState.result?.kind === 'ok' ? nextState.result.data : null;
            // Seamlessly re-request Gemini with the fresh asOf while keeping the popup open
            // (prevents 409 SLA_RISK.SNAPSHOT_SUPERSEDED from closing the user's popup on first click).
            if (
              openId &&
              nextData &&
              nextData.state === 'READY' &&
              nextData.asOf &&
              nextData.asOf !== staleAsOf
            ) {
              const freshItem = nextData.risks.find((item) => item.fulfillmentOrderId === openId);
              if (freshItem && buildLocalParcelExplanation(freshItem).hasMultipleInterpretations) {
                const nextScopePrefix = `${scopeKey}:${nextData.asOf}`;
                lastScopePrefixRef.current = nextScopePrefix;
                expCtrl.reset(nextScopePrefix);
                void expCtrl.request({
                  scopePrefix: nextScopePrefix,
                  warehouseId,
                  fulfillmentOrderId: freshItem.fulfillmentOrderId,
                  asOf: nextData.asOf,
                  expiresAtMs: getItemEffectiveExpiryMs(freshItem.deadlineAt, nextData.validUntil),
                  locale: explanationLocaleRef.current,
                  targetSignature: computeParcelTargetSignature(freshItem),
                });
              }
            }
          })
          .finally(() => {
            if (active && mountedRef.current) {
              setConflictRefreshing(false);
            }
          });
      },
      onParcelUnavailable: (parcelId) => {
        if (!active || !mountedRef.current) return;
        // Medium #1: Immediately hide parcel & stale CTA when POST confirms 404 ineligible, then refresh.
        setUnavailableParcelIds((prev) => {
          const next = new Set(prev);
          next.add(parcelId);
          return next;
        });
        setSelectedParcelId((prev) => (prev === parcelId ? null : prev));
        setConflictRefreshing(false);
        void ctrl.load(scopeKey, warehouseId, apiLimitRef.current, { preserveOnError: true });
      },
      onForbidden: () => {
        if (active && mountedRef.current) {
          ctrl.clearForbidden(scopeKey);
          overdueCtrlRef.current?.reset();
          setSelectedParcelId(null);
          setConflictRefreshing(false);
          setExplanationEntries({});
        }
      },
    });
    const overdueCtrl = createScopedOverdueController(undefined, (next) => {
      if (active && mountedRef.current) {
        setOverdueState(next);
      }
    });
    controllerRef.current = ctrl;
    explanationCtrlRef.current = expCtrl;
    overdueCtrlRef.current = overdueCtrl;
    lastLoadAtRef.current = Date.now();
    setNowMs(Date.now());
    setSnapshot({
      scopeKey,
      loading: true,
      loadMoreLoading: false,
      loadMoreError: false,
      result: null,
    });

    const startTimer = window.setTimeout(() => {
      if (!active) return;
      void ctrl.load(scopeKey, warehouseId, INITIAL_API_LIMIT);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(startTimer);
      mountedRef.current = false;
      ctrl.cancel();
      expCtrl.reset('');
      overdueCtrl.reset();
      controllerRef.current = null;
      explanationCtrlRef.current = null;
      overdueCtrlRef.current = null;
    };
  }, [scopeKey, warehouseId]);

  const view = useMemo(
    () => evaluateRiskViewState(snapshot, scopeKey, nowMs),
    [snapshot, scopeKey, nowMs],
  );

  const snapshotScopePrefix =
    view.kind === 'READY' && view.data.asOf ? `${scopeKey}:${view.data.asOf}` : '';

  const readyAsOf = view.kind === 'READY' ? view.data.asOf : null;
  const readyTimeZone = view.kind === 'READY' ? view.data.warehouseTimeZone : '';

  const latestReadyViewRef = useRef<Extract<typeof view, { readonly kind: 'READY' }> | null>(null);
  useEffect(() => {
    latestReadyViewRef.current = view.kind === 'READY' ? view : null;
  }, [view]);

  // Reset cached explanations and announce politely when a newer snapshot replaces the previous one.
  // Keep any currently open parcel popup open if the parcel is still active in the new snapshot,
  // and automatically re-request Gemini with the fresh asOf instead of kicking the user out.
  useEffect(() => {
    const prevAsOf = previousAsOfRef.current;
    if (prevAsOf && readyAsOf && prevAsOf !== readyAsOf && view.kind === 'READY') {
      const clock = formatRiskClockTime(readyAsOf, readyTimeZone, locale);
      setStatusAnnouncement(t('snapshotUpdatedAnnounced', { time: clock }));
    }
    previousAsOfRef.current = readyAsOf;
    announcedExplanationKeysRef.current = new Set();
    setUnavailableParcelIds(new Set());

    if (lastScopePrefixRef.current === snapshotScopePrefix) {
      return;
    }
    lastScopePrefixRef.current = snapshotScopePrefix;
    explanationCtrlRef.current?.reset(snapshotScopePrefix);

    const openId = selectedParcelIdRef.current;
    const readyView = latestReadyViewRef.current;
    if (openId && snapshotScopePrefix && readyAsOf && readyView) {
      const freshItem = readyView.activeRisks.find((item) => item.fulfillmentOrderId === openId);
      if (freshItem && buildLocalParcelExplanation(freshItem).hasMultipleInterpretations) {
        const expiresAtMs = getItemEffectiveExpiryMs(
          freshItem.deadlineAt,
          readyView.data.validUntil,
        );
        void explanationCtrlRef.current?.request({
          scopePrefix: snapshotScopePrefix,
          warehouseId,
          fulfillmentOrderId: freshItem.fulfillmentOrderId,
          asOf: readyAsOf,
          expiresAtMs,
          locale: explanationLocale,
          targetSignature: computeParcelTargetSignature(freshItem),
        });
      }
    }
  }, [
    explanationLocale,
    locale,
    readyAsOf,
    readyTimeZone,
    snapshotScopePrefix,
    t,
    view.kind,
    warehouseId,
  ]);

  // Medium #1: Evict cached POST entries whenever GET returns a newer target or reason set within the same asOf.
  useEffect(() => {
    if (view.kind !== 'READY' || !snapshotScopePrefix) return;
    const signatures: Record<string, string> = {};
    for (const item of view.activeRisks) {
      signatures[item.fulfillmentOrderId] = computeParcelTargetSignature(item);
    }
    explanationCtrlRef.current?.reconcileItems(snapshotScopePrefix, signatures);
  }, [snapshotScopePrefix, view]);

  // Evict expired per-parcel details/explanations immediately and close popup cleanly if the parcel disappeared
  // or the panel entered a non-ready terminal state.
  useEffect(() => {
    explanationCtrlRef.current?.evictExpired(nowMs);
    if (view.kind === 'loading') return;
    if (view.kind !== 'READY') {
      if (selectedParcelId) {
        setSelectedParcelId(null);
      }
      return;
    }
    const activeIds = new Set(view.activeRisks.map((item) => item.fulfillmentOrderId));
    if (selectedParcelId && !activeIds.has(selectedParcelId)) {
      setSelectedParcelId(null);
      panelHeadingRef.current?.focus();
    }
  }, [nowMs, selectedParcelId, view]);

  // Announce once via aria-live="polite" when Gemini result arrives for the currently open parcel (UI3).
  useEffect(() => {
    if (view.kind !== 'READY' || !selectedParcelId || !snapshotScopePrefix) return;
    const entryKey = `${snapshotScopePrefix}:${selectedParcelId}`;
    const entry = explanationEntries[entryKey];
    if (!entry || entry.loading || !entry.data || entry.data.source !== 'GEMINI') return;
    const announcementKey = `${entryKey}:${entry.data.advicePattern ?? ''}`;
    if (announcedExplanationKeysRef.current.has(announcementKey)) return;
    const item = view.activeRisks.find((r) => r.fulfillmentOrderId === selectedParcelId);
    if (!item) return;
    announcedExplanationKeysRef.current.add(announcementKey);
    setStatusAnnouncement(
      t('geminiResultAnnounced', {
        orderCode: item.orderCode,
        parcelNo: item.parcelNo,
      }),
    );
  }, [explanationEntries, selectedParcelId, snapshotScopePrefix, t, view]);

  // Schedule local clock wake-up at earliest of validUntil, parcel deadlineAt, or 1-minute countdown.
  useEffect(() => {
    if (view.kind !== 'READY' || view.nextExpiryMs === null) return;
    const delayUntilExpiry = Math.max(0, view.nextExpiryMs - Date.now()) + 25;
    const nextTickMs = Math.min(COUNTDOWN_TICK_MS, delayUntilExpiry);
    const timer = window.setTimeout(() => {
      if (mountedRef.current) setNowMs(Date.now());
    }, nextTickMs);
    return () => window.clearTimeout(timer);
  }, [view]);

  // Controlled foreground auto-refresh (UI2): refreshes near validUntil or bounded backoff while visible; stops when hidden.
  useEffect(() => {
    const delayMs = computeNextAutoRefreshDelayMs({
      view,
      isVisible,
      loading: snapshot.loading || Boolean(snapshot.loadMoreLoading),
      retryAttempt,
      nowMs: Date.now(),
    });
    if (delayMs === null) return;
    const timer = window.setTimeout(() => {
      if (!mountedRef.current || document.visibilityState === 'hidden') return;
      triggerLoad(true, { preserveOnError: view.kind === 'READY' });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [isVisible, retryAttempt, snapshot.loadMoreLoading, snapshot.loading, triggerLoad, view]);

  const canShowOverdueBridge =
    canExceptionsRoute &&
    Boolean(warehouseId) &&
    view.kind !== 'scope_mismatch' &&
    view.kind !== 'loading' &&
    view.kind !== 'endpoint_unavailable' &&
    view.kind !== 'forbidden' &&
    view.kind !== 'DISABLED';

  const deadlineCrossingSignal =
    view.kind === 'STALE' && view.staleReason === 'all_past_deadline'
      ? 'all_past_deadline'
      : view.kind === 'READY'
        ? `ready:${view.expiredByDeadlineCount}`
        : view.kind;

  // Load/refresh warehouse-scoped UC-104 overdue handover summary only when panel is active & permitted.
  useEffect(() => {
    if (!canShowOverdueBridge) {
      overdueCtrlRef.current?.reset();
      return;
    }
    void overdueCtrlRef.current?.load(scopeKey, warehouseId);
  }, [canShowOverdueBridge, deadlineCrossingSignal, scopeKey, snapshotScopePrefix, warehouseId]);

  // Re-evaluate expiry and refresh stale snapshots on window focus or returning from a background tab.
  useEffect(() => {
    const checkForeground = () => {
      const visibleNow = document.visibilityState !== 'hidden';
      setIsVisible(visibleNow);
      if (!visibleNow) return;
      const current = controllerRef.current?.getState();
      const currentNow = Date.now();
      setNowMs(currentNow);
      explanationCtrlRef.current?.evictExpired(currentNow);
      if (canShowOverdueBridge) {
        void overdueCtrlRef.current?.load(scopeKey, warehouseId);
      }
      if (!current || current.loading) return;
      const currentData = current.result?.kind === 'ok' ? current.result.data : null;
      if (
        !currentData ||
        currentData.state === 'STALE' ||
        currentData.state === 'INSUFFICIENT_DATA' ||
        currentData.state === 'WARMING_UP' ||
        currentData.state === 'MODEL_UNAVAILABLE' ||
        isRiskSnapshotExpired(currentData.validUntil, currentNow)
      ) {
        triggerLoad(false);
      }
    };
    window.addEventListener('focus', checkForeground);
    document.addEventListener('visibilitychange', checkForeground);
    return () => {
      window.removeEventListener('focus', checkForeground);
      document.removeEventListener('visibilitychange', checkForeground);
    };
  }, [canShowOverdueBridge, scopeKey, triggerLoad, warehouseId]);

  const formatRemaining = useCallback(
    (deadlineAt: string) => {
      const parts = formatRemainingDuration(deadlineAt, nowMs);
      if (parts.kind === 'expired' || parts.kind === 'under_minute') {
        return t('remainingUnderMinute');
      }
      if (parts.kind === 'minutes') {
        return t('remainingMinutes', { minutes: parts.minutes });
      }
      return t('remainingHoursMinutes', { hours: parts.hours, minutes: parts.minutes });
    },
    [nowMs, t],
  );

  const formatOverdueElapsed = useCallback(
    (deadlineAt: string | null) => {
      const elapsed = formatOverdueElapsedDuration(deadlineAt, nowMs);
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

  // Avoid repeating the stage name in the Signal column when Column 1 already displays it.
  const formatPrimarySignal = useCallback(
    (item: FulfillmentSlaRiskItem) => {
      const resolved = resolvePrimarySignal(item, locale);
      if (resolved.key === 'signals.OPEN_PICK_SHORTAGE') {
        return t('signalShortageConcise');
      }
      if (resolved.key === 'signals.STAGE_AGE_ELEVATED' && resolved.stageKey === item.stage) {
        return t('signalStageAgeConcise', resolved.values);
      }
      if (resolved.stageKey) {
        return t(resolved.key, {
          ...resolved.values,
          stage: t(`stages.${resolved.stageKey}`),
        });
      }
      return t(resolved.key, resolved.values);
    },
    [locale, t],
  );

  const formatFact = useCallback(
    (
      fact: FulfillmentSlaRiskExplanationFact,
      snapshotClock: string | null,
      hasPickRemainingFact = false,
    ) => {
      const resolved = resolveFactTranslation(fact, snapshotClock, locale, {
        hasPickRemainingFact,
      });
      if (resolved.stageKey) {
        return t(resolved.key, {
          ...resolved.values,
          stage: t(`stages.${resolved.stageKey}`),
        });
      }
      return t(resolved.key, resolved.values);
    },
    [locale, t],
  );

  const handleOpenParcelModal = useCallback(
    (item: FulfillmentSlaRiskItem, validUntil: string | null, asOf: string | null) => {
      if (!snapshotScopePrefix || !asOf) return;
      selectedParcelIdRef.current = item.fulfillmentOrderId;
      setSelectedParcelId(item.fulfillmentOrderId);

      const localPlan = buildLocalParcelExplanation(item);
      if (!localPlan.hasMultipleInterpretations) return;
      const expiresAtMs = getItemEffectiveExpiryMs(item.deadlineAt, validUntil);
      void explanationCtrlRef.current?.request({
        scopePrefix: snapshotScopePrefix,
        warehouseId,
        fulfillmentOrderId: item.fulfillmentOrderId,
        asOf,
        expiresAtMs,
        locale: explanationLocale,
        targetSignature: computeParcelTargetSignature(item),
      });
    },
    [explanationLocale, snapshotScopePrefix, warehouseId],
  );

  const handleCloseParcelModal = useCallback(() => {
    selectedParcelIdRef.current = null;
    setSelectedParcelId(null);
    setConflictRefreshing(false);
  }, []);

  const handleRetryGemini = useCallback(
    (item: FulfillmentSlaRiskItem, validUntil: string | null, asOf: string | null) => {
      if (!snapshotScopePrefix || !asOf) return;
      const localPlan = buildLocalParcelExplanation(item);
      if (!localPlan.hasMultipleInterpretations) return;
      const expiresAtMs = getItemEffectiveExpiryMs(item.deadlineAt, validUntil);
      void explanationCtrlRef.current?.request({
        scopePrefix: snapshotScopePrefix,
        warehouseId,
        fulfillmentOrderId: item.fulfillmentOrderId,
        asOf,
        expiresAtMs,
        locale: explanationLocale,
        targetSignature: computeParcelTargetSignature(item),
      });
    },
    [explanationLocale, snapshotScopePrefix, warehouseId],
  );

  const handleRephraseParcel = useCallback(
    (item: FulfillmentSlaRiskItem, validUntil: string | null, asOf: string | null) => {
      if (!snapshotScopePrefix || !asOf) return;
      const localPlan = buildLocalParcelExplanation(item);
      if (!localPlan.hasMultipleInterpretations) return;
      const expiresAtMs = getItemEffectiveExpiryMs(item.deadlineAt, validUntil);
      void explanationCtrlRef.current?.request({
        scopePrefix: snapshotScopePrefix,
        warehouseId,
        fulfillmentOrderId: item.fulfillmentOrderId,
        asOf,
        expiresAtMs,
        locale: explanationLocale,
        targetSignature: computeParcelTargetSignature(item),
        forceRefresh: true,
      });
    },
    [explanationLocale, snapshotScopePrefix, warehouseId],
  );

  if (view.kind === 'scope_mismatch') return null;
  if (view.kind === 'endpoint_unavailable') return null;
  if (view.kind === 'DISABLED') return null;

  const okData =
    view.kind === 'READY' ||
    view.kind === 'STALE' ||
    view.kind === 'WARMING_UP' ||
    view.kind === 'INSUFFICIENT_DATA' ||
    view.kind === 'MODEL_UNAVAILABLE'
      ? view.data
      : null;

  const asOfClock = okData?.asOf
    ? formatRiskClockTime(okData.asOf, okData.warehouseTimeZone, locale)
    : null;

  const visibleActiveRisks =
    view.kind === 'READY'
      ? view.activeRisks.filter((item) => !unavailableParcelIds.has(item.fulfillmentOrderId))
      : [];

  const priorityRisks = visibleActiveRisks.filter(
    (item) => item.tier === 'HIGH' || item.tier === 'MEDIUM',
  );
  const lowRisks = visibleActiveRisks.filter((item) => item.tier === 'LOW');

  const selectedParcel =
    selectedParcelId !== null
      ? (visibleActiveRisks.find((item) => item.fulfillmentOrderId === selectedParcelId) ?? null)
      : null;

  const visiblePriorityRisks = priorityRisks.slice(0, visibleCount);
  const hasHiddenLocalPriority = priorityRisks.length > visibleCount;
  const canLoadMoreFromApi =
    view.kind === 'READY' && view.hasMore && !hasHiddenLocalPriority && apiLimit < MAX_API_LIMIT;
  const atApiCapWithMore =
    view.kind === 'READY' && view.hasMore && !hasHiddenLocalPriority && apiLimit >= MAX_API_LIMIT;

  const warehousePriorityTotal =
    view.kind === 'READY' &&
    view.summaryScope === 'warehouse' &&
    view.expiredByDeadlineCount === 0 &&
    unavailableParcelIds.size === 0
      ? view.summary.highCount + view.summary.mediumCount
      : null;
  const knownPriorityTotal =
    warehousePriorityTotal !== null && warehousePriorityTotal >= priorityRisks.length
      ? warehousePriorityTotal
      : view.kind === 'READY' && !view.hasMore
        ? priorityRisks.length
        : null;
  const remainingKnownPriority =
    knownPriorityTotal !== null
      ? Math.max(0, knownPriorityTotal - visiblePriorityRisks.length)
      : null;

  const handleShowMore = () => {
    if (hasHiddenLocalPriority) {
      setVisibleCount((prev) => prev + LOAD_MORE_STEP);
      return;
    }
    if (canLoadMoreFromApi) {
      // UI4: batch of 10 only; visibleCount increments ONLY after the API response succeeds!
      const nextLimit = Math.min(MAX_API_LIMIT, apiLimit + LOAD_MORE_STEP);
      triggerLoad(true, {
        limitOverride: nextLimit,
        isLoadMore: true,
        preserveOnError: true,
        incrementVisibleBy: LOAD_MORE_STEP,
      });
    }
  };

  let headlineStat: string | null = null;
  if (view.kind === 'READY') {
    const { summary, summaryScope, data } = view;
    const eligible = data.coverage?.eligible ?? summary.validTotal;
    if (eligible === 0 && summary.validTotal === 0) {
      headlineStat = t('empty');
    } else if (summary.highCount > 0) {
      headlineStat =
        summaryScope === 'displayed'
          ? t('headlineDisplayedHigh', {
              highCount: summary.highCount,
              displayedCount: summary.validTotal,
            })
          : t('headlineHigh', { highCount: summary.highCount });
    } else if (summary.mediumCount > 0) {
      headlineStat =
        summaryScope === 'displayed'
          ? t('headlineDisplayedMediumOnly', {
              mediumCount: summary.mediumCount,
              displayedCount: summary.validTotal,
            })
          : t('headlineMediumOnly', { mediumCount: summary.mediumCount });
    } else if (summary.lowCount > 0) {
      headlineStat = t('headlineLowOnly', { lowCount: summary.lowCount });
    } else {
      headlineStat = t('empty');
    }
  }

  let coverageNote: string | null = null;
  if (view.kind === 'READY' && view.data.coverage) {
    const { scored, eligible } = view.data.coverage;
    if (eligible > 0) {
      if (view.summaryScope === 'warehouse' && view.summary.validTotal < scored) {
        coverageNote = t('coverageValidOfScored', {
          validTotal: view.summary.validTotal,
          scored,
          eligible,
        });
      } else if (view.hasMore) {
        coverageNote = t('coverageTopK', { scored, eligible, limit: apiLimit });
      } else {
        coverageNote = t('coverageShort', { scored, eligible });
      }
    }
  }

  const overdueExceptionsPath = buildOverdueExceptionsPath(warehouseId);

  const renderTierBadge = (tier: FulfillmentSlaRiskTier) => (
    <span data-tier={tier} className={styles.tierBadge}>
      <span aria-hidden="true" className={styles.tierDot} />
      <span>{t(`tiers.${tier}`)}</span>
    </span>
  );

  const renderPrimaryAction = (
    item: FulfillmentSlaRiskItem,
    nav: RiskNavigationTarget,
    variant: 'row' | 'mobile' | 'modal',
    isGeminiSelected: boolean,
    onActionExecuted?: () => void,
  ) => {
    const ctaClass =
      variant === 'modal'
        ? `${styles.modalPrimaryCta} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]`
        : `${styles.rowCta} ${
            variant === 'mobile'
              ? 'min-h-11 w-full px-3.5 text-sm whitespace-normal text-center'
              : 'h-8 px-2.5 text-[12.5px] whitespace-nowrap'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]`;

    const stopRowClick = (event: MouseEvent) => {
      event.stopPropagation();
    };

    let control: ReactNode = null;
    if (nav.kind === 'open_picking_line') {
      control = (
        <button
          type="button"
          className={ctaClass}
          onClick={(event) => {
            stopRowClick(event);
            onActionExecuted?.();
            if (onOpenPickingTarget) {
              onOpenPickingTarget({
                kind: 'open_picking_line',
                fulfillmentOrderId: item.fulfillmentOrderId,
                waveId: nav.waveId,
                waveCode: nav.waveCode,
                lineId: nav.lineId,
                intent: nav.labelKey === 'actionOpenShortageLine' ? 'shortage' : 'progress',
                exceptionId: nav.exceptionId,
              });
            } else {
              (onFocusWaves ?? onFocusBacklog)();
            }
          }}
        >
          <span>{t(nav.labelKey)}</span>
          <ArrowRight aria-hidden="true" size={13} className="shrink-0" />
        </button>
      );
    } else if (nav.kind === 'open_picking_wave') {
      control = (
        <button
          type="button"
          className={ctaClass}
          onClick={(event) => {
            stopRowClick(event);
            onActionExecuted?.();
            if (onOpenPickingTarget) {
              onOpenPickingTarget({
                kind: 'open_picking_wave',
                fulfillmentOrderId: item.fulfillmentOrderId,
                waveId: nav.waveId,
                waveCode: nav.waveCode,
              });
            } else {
              (onFocusWaves ?? onFocusBacklog)();
            }
          }}
        >
          <span>{t(nav.labelKey)}</span>
          <ArrowRight aria-hidden="true" size={13} className="shrink-0" />
        </button>
      );
    } else if (nav.kind === 'focus_backlog') {
      control = (
        <button
          type="button"
          className={ctaClass}
          onClick={(event) => {
            stopRowClick(event);
            onActionExecuted?.();
            onFocusBacklog();
          }}
        >
          <span>{t(nav.labelKey)}</span>
          <ArrowRight aria-hidden="true" size={13} className="shrink-0" />
        </button>
      );
    } else if (nav.kind === 'focus_waves') {
      control = (
        <button
          type="button"
          className={ctaClass}
          onClick={(event) => {
            stopRowClick(event);
            onActionExecuted?.();
            (onFocusWaves ?? onFocusBacklog)();
          }}
        >
          <span>{t(nav.labelKey)}</span>
          <ArrowRight aria-hidden="true" size={13} className="shrink-0" />
        </button>
      );
    } else if (nav.kind === 'link') {
      control = (
        <Link
          to={nav.to}
          className={ctaClass}
          onClick={(event) => {
            stopRowClick(event);
            onActionExecuted?.();
          }}
        >
          <span>{t(nav.labelKey)}</span>
          <ArrowUpRight aria-hidden="true" size={13} className="shrink-0" />
        </Link>
      );
    }
    if (!control) return null;
    if (!isGeminiSelected || variant === 'modal') return control;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          data-cta-source="GEMINI"
          title={t('geminiCtaCueAria')}
          aria-label={t('geminiCtaCueAria')}
          className={styles.geminiBadgePill}
        >
          <Sparkles aria-hidden="true" size={11} className="shrink-0 text-[var(--sc-primary)]" />
          <span>{t('geminiCtaCue')}</span>
        </span>
        {control}
      </span>
    );
  };

  const renderParcelModal = () => {
    if (view.kind !== 'READY' || !selectedParcel) return null;

    const item = selectedParcel;
    const entryKey = `${snapshotScopePrefix}:${item.fulfillmentOrderId}`;
    const remoteEntry = explanationEntries[entryKey];
    const detailId = `sla-risk-detail-${item.fulfillmentOrderId}`;

    const localExplanation = buildLocalParcelExplanation(item);
    const verifiedRemote = remoteEntry?.data ?? null;
    // Medium #1: Honor valid empty POST facts array instead of resurrecting stale local facts.
    const displayFacts = verifiedRemote ? verifiedRemote.facts : localExplanation.facts;
    const hasPickRemainingFact = displayFacts.some((fact) => fact.factId === 'PICK_REMAINING');
    const displayTemplateId = verifiedRemote?.explanationTemplateId ?? null;
    const isCheckingOptions = Boolean(
      (remoteEntry?.loading || (conflictRefreshing && !remoteEntry)) &&
      verifiedRemote?.source !== 'GEMINI',
    );
    const isRephrasing = Boolean(remoteEntry?.loading && verifiedRemote?.source === 'GEMINI');

    // Section 2 + High #1 + Medium #1: ORCA deterministically fills Gemini's validated token
    // pattern ({{action}}, {{reason}}) with server-verified action & reason phrases (zero digits,
    // zero live countdown). Invalid/corrupted patterns are rejected cleanly.
    let renderedGeminiAdvice: string | null = null;
    let geminiPatternRejected = false;
    if (verifiedRemote?.source === 'GEMINI' && verifiedRemote.advicePattern) {
      const actionKey = resolveAdviceActionKey(
        verifiedRemote.candidateAction,
        verifiedRemote.target ?? item.target ?? null,
      );
      const reasonKey = resolveAdviceReasonKey(verifiedRemote.explanationTemplateId, displayFacts);
      renderedGeminiAdvice = renderGroundedAdvicePattern(
        verifiedRemote.advicePattern,
        t(`adviceActions.${actionKey}`),
        t(`adviceReasons.${reasonKey}`),
        explanationLocale,
      );
      geminiPatternRejected = renderedGeminiAdvice === null;
    }

    // Only show Gemini suggestion — never flash an ORCA template suggestion while loading or on fallback.
    const sourceKind =
      verifiedRemote?.source === 'GEMINI' && !geminiPatternRejected ? 'GEMINI' : 'TEMPLATE';
    const hasGeminiAdvice = sourceKind === 'GEMINI' && Boolean(renderedGeminiAdvice);
    const canShowGeminiBlock = localExplanation.hasMultipleInterpretations || hasGeminiAdvice;

    // Section 2: Avoid repeating the open-shortage bullet in "Dữ liệu kho" when Gemini advice
    // already explains the shortage AND PICK_REMAINING already carries the remaining unit/SKU count.
    const leadCoversShortage =
      hasGeminiAdvice &&
      (displayTemplateId === 'SHORTAGE_PRIMARY' ||
        displayTemplateId === 'SHORTAGE_WITH_WORKLOAD' ||
        displayTemplateId === 'SHORTAGE_WITH_TIME_PRESSURE');
    const visibleWarehouseFacts =
      leadCoversShortage && hasPickRemainingFact
        ? displayFacts.filter((fact) => fact.factId !== 'OPEN_PICK_SHORTAGE')
        : displayFacts;

    const probLabel = formatRiskProbability(item.probability, locale);
    const filledTicks =
      item.probability !== null && Number.isFinite(item.probability)
        ? Math.max(1, Math.min(10, Math.round(item.probability * 10)))
        : 0;
    const currentStageIdx = stageIndexOf(item.stage);
    const remainingText = formatRemaining(item.deadlineAt);
    const urgent = isUrgentCountdown(item.deadlineAt, nowMs);
    const deadlineParts = formatWarehouseDeadline(
      item.deadlineAt,
      view.data.warehouseTimeZone,
      locale,
      nowMs,
    );
    const deadlineDisplay =
      deadlineParts.kind === 'today'
        ? t('deadlineToday', { time: deadlineParts.time })
        : deadlineParts.kind === 'tomorrow'
          ? t('deadlineTomorrow', { time: deadlineParts.time })
          : t('deadlineDate', { time: deadlineParts.time, date: deadlineParts.date });
    const methodLabel =
      view.data.source === 'CALIBRATED_LOGISTIC' ? t('sourceCalibrated') : t('sourceEmpirical');

    const nav = resolveRiskNavigation(
      item,
      view.data.warehouseId,
      {
        canManagePicking,
        canPackingRoute,
        canHandoverRoute,
        canShipmentsRoute,
        canExceptionsRoute,
      },
      remoteEntry?.data?.target ?? null,
    );
    const modalPrimaryCta = renderPrimaryAction(
      item,
      nav,
      'modal',
      sourceKind === 'GEMINI',
      handleCloseParcelModal,
    );

    return (
      <Modal
        isOpen={Boolean(selectedParcel)}
        onClose={handleCloseParcelModal}
        title={t('parcelTitle', {
          orderCode: item.orderCode,
          parcelNo: item.parcelNo,
        })}
        width="640px"
        bodyClassName="p-0"
      >
        <div id={detailId} data-explanation-source={sourceKind} className={styles.modalBody}>
          {/* Top Status Strip: Tier + Live Countdown + Handover Cutoff */}
          <div className={styles.modalSummaryBar}>
            <div className={styles.modalSummaryLeft}>
              {renderTierBadge(item.tier)}
              <span
                className={`${styles.modalCountdown} ${
                  urgent && item.tier === 'HIGH' ? styles.modalCountdownUrgent : ''
                }`}
              >
                {remainingText}
              </span>
            </div>
            <span className={styles.deadlinePill} title={view.data.warehouseTimeZone}>
              <CalendarClock
                aria-hidden="true"
                size={13}
                className="shrink-0 text-[var(--sc-primary)]"
              />
              <span>{deadlineDisplay}</span>
            </span>
          </div>

          <div className={styles.modalContent}>
            {/* 1. Compact 5-Stage Outbound Pipeline */}
            <div className={styles.pipelineCard}>
              <p className={styles.sectionKicker}>{t('pipelineLabel')}</p>
              <ol className={styles.pipelineList}>
                {OUTBOUND_PIPELINE_STAGES.map((stageKey, idx) => {
                  const stepState =
                    idx < currentStageIdx
                      ? 'done'
                      : idx === currentStageIdx
                        ? 'current'
                        : 'upcoming';
                  return (
                    <li
                      key={stageKey}
                      data-step-state={stepState}
                      data-tier={item.tier}
                      aria-current={stepState === 'current' ? 'step' : undefined}
                      className={styles.pipelineStep}
                    >
                      <span aria-hidden="true" className={styles.pipelineBar} />
                      <span className={styles.pipelineLabel}>{t(`stages.${stageKey}`)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* 2. Gemini-only Suggestion Card */}
            {canShowGeminiBlock && (
              <div
                data-suggestion-frame={sourceKind}
                data-suggestion-loading={isCheckingOptions ? 'true' : 'false'}
                className={styles.suggestionBlock}
              >
                {hasGeminiAdvice ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={styles.suggestionKicker}>
                        <Sparkles
                          aria-hidden="true"
                          size={12}
                          className="shrink-0 text-[var(--sc-primary)]"
                        />
                        <span>{t('geminiSuggestionBadge')}</span>
                      </span>
                      <button
                        type="button"
                        disabled={isRephrasing}
                        aria-label={t('rephraseAriaLabel', {
                          orderCode: item.orderCode,
                          parcelNo: item.parcelNo,
                        })}
                        onClick={() =>
                          handleRephraseParcel(item, view.data.validUntil, view.data.asOf)
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--sc-text-secondary)] transition-colors duration-150 hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw
                          aria-hidden="true"
                          size={11}
                          className={isRephrasing ? 'shrink-0 animate-spin' : 'shrink-0'}
                        />
                        <span>{t('rephraseAction')}</span>
                      </button>
                    </div>
                    <p className={styles.adviceLead}>{renderedGeminiAdvice}</p>
                  </>
                ) : isCheckingOptions ? (
                  <div role="status" aria-busy="true">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--sc-primary-dark)]">
                      <Sparkles
                        aria-hidden="true"
                        size={13}
                        className="shrink-0 text-[var(--sc-primary)] motion-safe:animate-pulse"
                      />
                      <span>{t('refiningExplanation')}</span>
                    </div>
                    <div aria-hidden="true" className={styles.suggestionSkeleton}>
                      <span className={`${styles.skeletonLine} w-[92%]`} />
                      <span className={`${styles.skeletonLine} w-[68%]`} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[13px] text-[var(--sc-text-secondary)]">
                      <Sparkles
                        aria-hidden="true"
                        size={13}
                        className="shrink-0 text-[var(--sc-text-tertiary)]"
                      />
                      <span>{t('geminiUnavailable')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetryGemini(item, view.data.validUntil, view.data.asOf)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--sc-text-primary)] transition-colors duration-150 hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]"
                    >
                      <RefreshCw aria-hidden="true" size={11} className="shrink-0" />
                      <span>{t('retry')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. Warehouse Data & ORCA Forecast (strictly OUTSIDE AI suggestion frame) */}
            <div className={styles.telemetryGrid}>
              <div data-warehouse-facts="true" className={styles.telemetryCard}>
                <p className={styles.sectionKicker}>{t('systemEvidenceHeading')}</p>
                {visibleWarehouseFacts.length > 0 ? (
                  <ul className={styles.factsList}>
                    {visibleWarehouseFacts.slice(0, 2).map((fact) => (
                      <li key={fact.factId} className={styles.factRow}>
                        {formatFact(fact, asOfClock, hasPickRemainingFact)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyFact}>{t('modalNoFacts')}</p>
                )}
              </div>

              <div data-orca-forecast="true" className={styles.telemetryCard}>
                <div className={styles.forecastTop}>
                  <span className={styles.sectionKicker}>{t('orcaForecastLabel')}</span>
                  <span className={styles.forecastMethod}>{methodLabel}</span>
                </div>
                <div className={styles.forecastReadout}>
                  <span className={styles.forecastProbText}>
                    {probLabel !== null
                      ? t('probabilityValue', { value: probLabel })
                      : t(`tiers.${item.tier}`)}
                  </span>
                  {probLabel !== null && (
                    <div aria-hidden="true" className={styles.meterTrack}>
                      {METER_TICKS.map((tick) => (
                        <span
                          key={tick}
                          className={`${styles.meterTick} ${
                            tick <= filledTicks ? probabilityTickClass(item.tier) : ''
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className={styles.modalFooter}>
            {sourceKind === 'GEMINI' && (
              <span
                data-cta-source="GEMINI"
                title={t('geminiCtaCueAria')}
                aria-label={t('geminiCtaCueAria')}
                className={styles.geminiBadgePill}
              >
                <Sparkles
                  aria-hidden="true"
                  size={11}
                  className="shrink-0 text-[var(--sc-primary)]"
                />
                <span>{t('geminiCtaCue')}</span>
              </span>
            )}
            <div className={styles.modalFooterActions}>
              <Button type="button" variant="secondary" size="sm" onClick={handleCloseParcelModal}>
                {t('modalClose')}
              </Button>
              {modalPrimaryCta}
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  const renderRiskRows = (items: readonly FulfillmentSlaRiskItem[]) => {
    if (view.kind !== 'READY') return null;

    if (isDesktopLayout) {
      return (
        <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                <th scope="col" className="px-4 py-2.5">
                  {t('columns.parcel')}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {t('columns.riskAndDeadline')}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {t('columns.signal')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  {t('columns.nextStep')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
              {items.map((item) => {
                const entryKey = `${snapshotScopePrefix}:${item.fulfillmentOrderId}`;
                const isSelected = selectedParcelId === item.fulfillmentOrderId;
                const remainingText = formatRemaining(item.deadlineAt);
                const urgent = isUrgentCountdown(item.deadlineAt, nowMs);
                const stageIdx = stageIndexOf(item.stage);
                const signalText = formatPrimarySignal(item);
                const remoteEntry = explanationEntries[entryKey];
                const isGeminiSelected = remoteEntry?.data?.source === 'GEMINI';
                const nav = resolveRiskNavigation(
                  item,
                  view.data.warehouseId,
                  {
                    canManagePicking,
                    canPackingRoute,
                    canHandoverRoute,
                    canShipmentsRoute,
                    canExceptionsRoute,
                  },
                  remoteEntry?.data?.target ?? null,
                );
                const actionElement = renderPrimaryAction(item, nav, 'row', isGeminiSelected);

                return (
                  <tr
                    key={item.fulfillmentOrderId}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={`align-middle ${styles.riskRow}`}
                    onClick={() =>
                      handleOpenParcelModal(item, view.data.validUntil, view.data.asOf)
                    }
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="min-w-0">
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={t('expandAriaLabel', {
                            orderCode: item.orderCode,
                            parcelNo: item.parcelNo,
                          })}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenParcelModal(item, view.data.validUntil, view.data.asOf);
                          }}
                          className={`${styles.parcelButton} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] rounded`}
                        >
                          <span className="break-words">
                            {t('parcelTitle', {
                              orderCode: item.orderCode,
                              parcelNo: item.parcelNo,
                            })}
                          </span>
                        </button>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span aria-hidden="true" className={styles.miniTrack}>
                            {OUTBOUND_PIPELINE_STAGES.map((stageKey, idx) => (
                              <span
                                key={stageKey}
                                data-tier={item.tier}
                                className={`${styles.miniSegment} ${
                                  idx < stageIdx
                                    ? styles.miniSegmentDone
                                    : idx === stageIdx
                                      ? styles.miniSegmentCurrent
                                      : ''
                                }`}
                              />
                            ))}
                          </span>
                          <span className="text-[12px] font-medium text-[var(--sc-text-secondary)]">
                            {t(`stages.${item.stage}`)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-2 tabular-nums">
                        {renderTierBadge(item.tier)}
                        <span
                          className={`whitespace-nowrap text-[13.5px] font-semibold ${
                            urgent && item.tier === 'HIGH'
                              ? 'text-[var(--sc-error-dark)]'
                              : 'text-[var(--sc-text-primary)]'
                          }`}
                        >
                          {remainingText}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle text-[13px] leading-5 text-[var(--sc-text-primary)]">
                      <span className="block break-words">{signalText}</span>
                    </td>

                    <td className="px-4 py-3 text-right align-middle">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {actionElement}
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={t('expandAriaLabel', {
                            orderCode: item.orderCode,
                            parcelNo: item.parcelNo,
                          })}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenParcelModal(item, view.data.validUntil, view.data.asOf);
                          }}
                          className={`${styles.detailTrigger} h-8 px-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]`}
                        >
                          <span>{t('whyButton')}</span>
                          <ChevronRight aria-hidden="true" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    // Stacked mobile / narrow-container layout (UI6: 390px, >=44px touch targets, zero horizontal overflow).
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
        <ul className="divide-y divide-[var(--sc-border-default)]">
          {items.map((item) => {
            const entryKey = `${snapshotScopePrefix}:${item.fulfillmentOrderId}`;
            const isSelected = selectedParcelId === item.fulfillmentOrderId;
            const remainingText = formatRemaining(item.deadlineAt);
            const urgent = isUrgentCountdown(item.deadlineAt, nowMs);
            const stageIdx = stageIndexOf(item.stage);
            const signalText = formatPrimarySignal(item);
            const remoteEntry = explanationEntries[entryKey];
            const isGeminiSelected = remoteEntry?.data?.source === 'GEMINI';
            const nav = resolveRiskNavigation(
              item,
              view.data.warehouseId,
              {
                canManagePicking,
                canPackingRoute,
                canHandoverRoute,
                canShipmentsRoute,
                canExceptionsRoute,
              },
              remoteEntry?.data?.target ?? null,
            );
            const actionElement = renderPrimaryAction(item, nav, 'mobile', isGeminiSelected);

            return (
              <li
                key={item.fulfillmentOrderId}
                data-selected={isSelected ? 'true' : 'false'}
                className={`text-sm ${styles.mobileItemCard}`}
                onClick={() => handleOpenParcelModal(item, view.data.validUntil, view.data.asOf)}
              >
                <div className="space-y-2.5 px-4 py-3.5">
                  {/* Mobile Row 1: Parcel + Risk Badge */}
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={t('expandAriaLabel', {
                          orderCode: item.orderCode,
                          parcelNo: item.parcelNo,
                        })}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenParcelModal(item, view.data.validUntil, view.data.asOf);
                        }}
                        className={`${styles.parcelButton} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] rounded`}
                      >
                        <span className="break-words">
                          {t('parcelTitle', {
                            orderCode: item.orderCode,
                            parcelNo: item.parcelNo,
                          })}
                        </span>
                      </button>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span aria-hidden="true" className={styles.miniTrack}>
                          {OUTBOUND_PIPELINE_STAGES.map((stageKey, idx) => (
                            <span
                              key={stageKey}
                              data-tier={item.tier}
                              className={`${styles.miniSegment} ${
                                idx < stageIdx
                                  ? styles.miniSegmentDone
                                  : idx === stageIdx
                                    ? styles.miniSegmentCurrent
                                    : ''
                              }`}
                            />
                          ))}
                        </span>
                        <span className="text-[12px] font-medium text-[var(--sc-text-secondary)]">
                          {t(`stages.${item.stage}`)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">{renderTierBadge(item.tier)}</div>
                  </div>

                  {/* Mobile Row 2: Remaining time + Signal */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                    <span
                      className={`font-semibold ${
                        urgent && item.tier === 'HIGH'
                          ? 'text-[var(--sc-error-dark)]'
                          : 'text-[var(--sc-text-primary)]'
                      }`}
                    >
                      {remainingText}
                    </span>
                    <span aria-hidden="true" className="text-[var(--sc-border-strong)]">
                      ·
                    </span>
                    <span className="min-w-0 break-words text-[var(--sc-text-secondary)]">
                      {signalText}
                    </span>
                  </div>

                  {/* Mobile Row 3: Primary Action + Details popup button (>=44px touch target) */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {actionElement && <div className="min-w-0 flex-1">{actionElement}</div>}
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={t('expandAriaLabel', {
                        orderCode: item.orderCode,
                        parcelNo: item.parcelNo,
                      })}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenParcelModal(item, view.data.validUntil, view.data.asOf);
                      }}
                      className={`${styles.detailTrigger} min-h-11 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]`}
                    >
                      <span>{t('whyButton')}</span>
                      <ChevronRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const scopedOverdue =
    canShowOverdueBridge && overdueState.scopeKey === scopeKey && overdueState.status === 'ready'
      ? overdueState
      : null;
  const showOverdueBanner =
    scopedOverdue !== null && (scopedOverdue.count > 0 || scopedOverdue.hasMorePages);

  const excludedCoverage = summarizeExcludedCoverage(okData?.coverage);
  const showExcludedInline =
    excludedCoverage.total > 0 && view.kind !== 'loading' && view.kind !== 'forbidden';

  const isEmptyReady =
    view.kind === 'READY' && visiblePriorityRisks.length === 0 && lowRisks.length === 0;

  const exceptionsLinkClass =
    'inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-[var(--sc-border-strong)] bg-[var(--sc-bg-surface)] px-2.5 text-xs font-medium text-[var(--sc-text-primary)] transition-colors duration-150 hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]';

  const headerMetaParts = [
    showWarehouseName && warehouseName?.trim() ? warehouseName.trim() : null,
    asOfClock ? t('updatedAt', { time: asOfClock }) : null,
  ].filter(Boolean);

  return (
    <div ref={panelRootRef}>
      <section aria-label={t('title')} className={styles.cockpit}>
        {/* Visually hidden polite live region for single Gemini & snapshot update announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {statusAnnouncement}
        </div>

        <header className={styles.cockpitHeader}>
          <div className={styles.headerTitleBlock}>
            <h2
              ref={panelHeadingRef}
              tabIndex={-1}
              className={`${styles.eyebrow} outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]`}
            >
              <span
                aria-hidden="true"
                className={`${styles.eyebrowDot} ${
                  view.kind === 'READY' ? '' : styles.eyebrowDotIdle
                }`}
              />
              <span>{t('title')}</span>
            </h2>
            {headlineStat && <p className={styles.headline}>{headlineStat}</p>}
          </div>

          <div className={styles.headerControls}>
            {headerMetaParts.length > 0 && (
              <span className={styles.clockStamp} title={okData?.warehouseTimeZone}>
                <Clock aria-hidden="true" size={13} className="shrink-0 text-[var(--sc-primary)]" />
                <span>{headerMetaParts.join(' · ')}</span>
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              isLoading={snapshot.loading}
              onClick={() => {
                setRetryAttempt(0);
                triggerLoad(true);
              }}
            >
              {!snapshot.loading && <RefreshCw aria-hidden="true" size={13} />}
              <span>{t('refresh')}</span>
            </Button>
          </div>
        </header>

        <div className={styles.cockpitBody}>
          {/* Unified clean ORCA 3-tile telemetry strip */}
          {view.kind === 'READY' && (
            <div className={styles.kpiGrid}>
              <div
                className={styles.kpiTile}
                data-tone={
                  view.summary.highCount > 0
                    ? 'red'
                    : view.summary.mediumCount > 0
                      ? 'amber'
                      : 'teal'
                }
              >
                <div className={styles.kpiHeader}>
                  <p className={styles.kpiLabel}>{t('kpiRiskLabel')}</p>
                  <span aria-hidden="true" className={styles.kpiIcon}>
                    <ShieldAlert size={15} />
                  </span>
                </div>
                <div className={styles.kpiFigureRow}>
                  <span
                    className={`${styles.kpiNumber} ${
                      view.summary.highCount > 0 ? styles.kpiNumberDanger : styles.kpiNumberBrand
                    }`}
                  >
                    {view.summary.highCount}
                  </span>
                </div>
                <p className={styles.kpiSub}>
                  {view.summary.mediumCount > 0 || view.summary.lowCount > 0
                    ? t('kpiRiskBreakdown', {
                        mediumCount: view.summary.mediumCount,
                        lowCount: view.summary.lowCount,
                      })
                    : t('kpiRiskHealthy')}
                </p>
              </div>

              <div
                className={styles.kpiTile}
                data-tone={view.summary.topHighStage ? 'amber' : 'muted'}
              >
                <div className={styles.kpiHeader}>
                  <p className={styles.kpiLabel}>{t('kpiBottleneckLabel')}</p>
                  <span aria-hidden="true" className={styles.kpiIcon}>
                    <Layers size={15} />
                  </span>
                </div>
                <div className={styles.kpiFigureRow}>
                  <span className={styles.kpiStageName}>
                    {view.summary.topHighStage
                      ? t(`stages.${view.summary.topHighStage}`)
                      : t('kpiBottleneckNone')}
                  </span>
                </div>
                <p className={styles.kpiSub}>
                  {view.summary.topHighStage && view.summary.topHighStageCount > 0
                    ? t('kpiBottleneckCount', { count: view.summary.topHighStageCount })
                    : t('kpiBottleneckNoneHint')}
                </p>
              </div>

              <div className={styles.kpiTile} data-tone="teal">
                <div className={styles.kpiHeader}>
                  <p className={styles.kpiLabel}>{t('kpiCoverageLabel')}</p>
                  <span aria-hidden="true" className={styles.kpiIcon}>
                    <Activity size={15} />
                  </span>
                </div>
                <div className={styles.kpiFigureRow}>
                  <span className={`${styles.kpiNumber} ${styles.kpiNumberBrand}`}>
                    {view.data.coverage
                      ? `${view.data.coverage.scored}/${view.data.coverage.eligible}`
                      : String(view.summary.validTotal)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--sc-text-secondary)] tabular-nums">
                  {coverageNote && !showExcludedInline && <span>{coverageNote}</span>}
                  {showExcludedInline && (
                    <button
                      type="button"
                      aria-expanded={excludedExpanded}
                      onClick={() => setExcludedExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-0.5 font-medium text-[var(--sc-primary-dark)] underline decoration-dotted underline-offset-2 hover:text-[var(--sc-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]"
                    >
                      <span>{t('excludedInlineButton', { count: excludedCoverage.total })}</span>
                      {excludedExpanded ? (
                        <ChevronUp aria-hidden="true" size={12} />
                      ) : (
                        <ChevronDown aria-hidden="true" size={12} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {view.kind !== 'READY' && showExcludedInline && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--sc-text-secondary)] tabular-nums">
              <button
                type="button"
                aria-expanded={excludedExpanded}
                onClick={() => setExcludedExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 font-medium text-[var(--sc-primary-dark)] underline decoration-dotted underline-offset-2 hover:text-[var(--sc-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]"
              >
                <span>{t('excludedInlineButton', { count: excludedCoverage.total })}</span>
                {excludedExpanded ? (
                  <ChevronUp aria-hidden="true" size={12} />
                ) : (
                  <ChevronDown aria-hidden="true" size={12} />
                )}
              </button>
            </div>
          )}

          {showExcludedInline && excludedExpanded && (
            <ul className="mb-3.5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] px-3.5 py-2 text-xs text-[var(--sc-text-secondary)]">
              {excludedCoverage.missingCalendar > 0 && (
                <li>
                  {t('excludedMissingCalendar', {
                    count: excludedCoverage.missingCalendar,
                  })}
                </li>
              )}
              {excludedCoverage.blocked > 0 && (
                <li>{t('excludedBlocked', { count: excludedCoverage.blocked })}</li>
              )}
              {excludedCoverage.activeOver30Days > 0 && (
                <li>{t('excludedOver30Days', { count: excludedCoverage.activeOver30Days })}</li>
              )}
              {excludedCoverage.unsupported > 0 && (
                <li>{t('excludedUnsupported', { count: excludedCoverage.unsupported })}</li>
              )}
            </ul>
          )}

          {showOverdueBanner && scopedOverdue && (
            <div role="status" className={styles.overdueStrip}>
              <div className={styles.overdueHeader}>
                <span className={styles.overdueLead}>
                  <AlertTriangle aria-hidden="true" size={15} className="shrink-0" />
                  <span>
                    {scopedOverdue.count > 0
                      ? scopedOverdue.hasMorePages
                        ? t('overdueSystemBannerAtLeast', { count: scopedOverdue.count })
                        : t('overdueSystemBanner', { count: scopedOverdue.count })
                      : t('overdueSystemBannerMorePages')}
                  </span>
                </span>
                <Link
                  to={overdueExceptionsPath}
                  className={`${styles.overdueActionLink} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-error)]`}
                >
                  <span>{t('actionViewOverdueParcels')}</span>
                  <ArrowUpRight aria-hidden="true" size={13} className="shrink-0 opacity-85" />
                </Link>
              </div>
              {scopedOverdue.parcels && scopedOverdue.parcels.length > 0 && (
                <div className={styles.overdueParcelList}>
                  {scopedOverdue.parcels.slice(0, MAX_INLINE_OVERDUE_CHIPS).map((parcel) => {
                    const parcelLabel = parcel.parcelNo
                      ? t('parcelTitle', {
                          orderCode: parcel.orderCode,
                          parcelNo: parcel.parcelNo,
                        })
                      : parcel.orderCode;
                    const elapsedLabel = formatOverdueElapsed(parcel.deadline);
                    return (
                      <Link
                        key={parcel.aggregateId}
                        to={buildOverdueExceptionsPath(warehouseId, parcel.aggregateId)}
                        aria-label={t('overdueParcelAriaLabel', { label: parcelLabel })}
                        className={`${styles.overdueParcelChip} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-error)]`}
                      >
                        <span className={styles.overdueParcelCode}>{parcelLabel}</span>
                        {elapsedLabel && (
                          <>
                            <span aria-hidden="true" className="text-[var(--sc-border-strong)]">
                              ·
                            </span>
                            <span className={styles.overdueParcelElapsed}>{elapsedLabel}</span>
                          </>
                        )}
                        <ArrowUpRight
                          aria-hidden="true"
                          size={12}
                          className="shrink-0 text-[var(--sc-error-dark)] opacity-80"
                        />
                      </Link>
                    );
                  })}
                  {(scopedOverdue.count >
                    Math.min(scopedOverdue.parcels.length, MAX_INLINE_OVERDUE_CHIPS) ||
                    scopedOverdue.hasMorePages) && (
                    <Link
                      to={overdueExceptionsPath}
                      className={`${styles.overdueMoreChip} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-error)]`}
                    >
                      {scopedOverdue.hasMorePages
                        ? t('overdueMoreParcelsAtLeast')
                        : t('overdueMoreParcels', {
                            count:
                              scopedOverdue.count -
                              Math.min(scopedOverdue.parcels.length, MAX_INLINE_OVERDUE_CHIPS),
                          })}
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {view.kind === 'loading' && (
            <div role="status" aria-busy="true" className="space-y-3">
              <span className="sr-only">{t('loading')}</span>
              <div className={styles.kpiGrid}>
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-24 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-4 motion-safe:animate-pulse"
                  >
                    <div className="h-3 w-24 rounded bg-[var(--sc-bg-secondary)]" />
                    <div className="mt-3 h-6 w-16 rounded bg-[var(--sc-bg-secondary)]" />
                  </div>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
                <div className="divide-y divide-[var(--sc-border-default)]">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 motion-safe:animate-pulse"
                    >
                      <div className="h-4 w-40 rounded bg-[var(--sc-bg-secondary)]" />
                      <div className="h-4 w-28 rounded bg-[var(--sc-bg-secondary)]" />
                      <div className="h-4 w-44 rounded bg-[var(--sc-bg-secondary)]" />
                      <div className="h-8 w-32 rounded-md bg-[var(--sc-bg-secondary)]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view.kind === 'forbidden' && <Alert variant="warning">{t('forbidden')}</Alert>}

          {view.kind === 'error' && <Alert variant="error">{t('loadError')}</Alert>}

          {view.kind === 'WARMING_UP' && <Alert variant="info">{t('warmingUp')}</Alert>}

          {view.kind === 'INSUFFICIENT_DATA' && (
            <Alert variant="info">{t('insufficientData')}</Alert>
          )}

          {view.kind === 'MODEL_UNAVAILABLE' && (
            <Alert variant="warning">{t('modelUnavailable')}</Alert>
          )}

          {view.kind === 'STALE' && (
            <Alert variant="warning">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {view.staleReason === 'all_past_deadline'
                    ? canExceptionsRoute
                      ? t('staleAllPastDeadline')
                      : t('staleAllPastDeadlineNoLink')
                    : view.staleReason === 'invalidated'
                      ? t('staleInvalidated')
                      : t('stale')}
                </span>
                {canExceptionsRoute &&
                  !showOverdueBanner &&
                  (view.staleReason === 'all_past_deadline' ||
                    view.staleReason === 'invalidated') && (
                    <Link to={overdueExceptionsPath} className={exceptionsLinkClass}>
                      <span>{t('actionViewExceptions')}</span>
                      <ArrowUpRight aria-hidden="true" size={13} className="shrink-0 opacity-75" />
                    </Link>
                  )}
              </div>
            </Alert>
          )}

          {view.kind === 'READY' && view.expiredByDeadlineCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] px-3.5 py-2 text-xs text-[var(--sc-text-secondary)]">
              <span>{t('partialExpiredByDeadline', { count: view.expiredByDeadlineCount })}</span>
              {canExceptionsRoute && !showOverdueBanner && (
                <Link to={overdueExceptionsPath} className={exceptionsLinkClass}>
                  <span>{t('actionViewExceptions')}</span>
                  <ArrowUpRight aria-hidden="true" size={13} className="shrink-0 opacity-75" />
                </Link>
              )}
            </div>
          )}

          {isEmptyReady && !showOverdueBanner && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] px-4 py-3 text-xs text-[var(--sc-text-secondary)]">
              <span className="inline-flex items-center gap-2">
                <PackageCheck
                  aria-hidden="true"
                  size={15}
                  className="shrink-0 text-[var(--sc-primary)]"
                />
                <span>
                  {canExceptionsRoute ? t('emptyOverdueHint') : t('emptyOverdueHintNoLink')}
                </span>
              </span>
              {canExceptionsRoute && (
                <Link to={overdueExceptionsPath} className={exceptionsLinkClass}>
                  <span>{t('actionViewExceptions')}</span>
                  <ArrowUpRight aria-hidden="true" size={13} className="shrink-0 opacity-75" />
                </Link>
              )}
            </div>
          )}

          {view.kind === 'READY' && visiblePriorityRisks.length > 0 && (
            <div className="space-y-2.5">
              {renderRiskRows(visiblePriorityRisks)}
              {(hasHiddenLocalPriority ||
                canLoadMoreFromApi ||
                atApiCapWithMore ||
                snapshot.loadMoreError ||
                (knownPriorityTotal !== null &&
                  knownPriorityTotal > visiblePriorityRisks.length)) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[var(--sc-text-secondary)] tabular-nums">
                      {knownPriorityTotal !== null
                        ? warehousePriorityTotal !== null &&
                          view.summary.highCount > 0 &&
                          view.summary.mediumCount > 0
                          ? t('showingPriorityOfTotalBreakdown', {
                              shown: visiblePriorityRisks.length,
                              total: knownPriorityTotal,
                              highCount: view.summary.highCount,
                              mediumCount: view.summary.mediumCount,
                            })
                          : t('showingPriorityOfTotal', {
                              shown: visiblePriorityRisks.length,
                              total: knownPriorityTotal,
                            })
                        : t('showingPriorityCount', { shown: visiblePriorityRisks.length })}
                    </span>
                    {(hasHiddenLocalPriority || canLoadMoreFromApi) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        isLoading={Boolean(snapshot.loadMoreLoading)}
                        onClick={handleShowMore}
                      >
                        {remainingKnownPriority !== null && remainingKnownPriority > 0
                          ? t('showMoreRemaining', { remaining: remainingKnownPriority })
                          : t('showMore')}
                      </Button>
                    )}
                  </div>
                  {snapshot.loadMoreError && (
                    <div
                      role="status"
                      className="flex flex-wrap items-center gap-2 text-xs text-[var(--sc-error-dark)]"
                    >
                      <span>{t('loadMoreError')}</span>
                      <Button type="button" variant="outline" size="sm" onClick={handleShowMore}>
                        {t('retry')}
                      </Button>
                    </div>
                  )}
                  {atApiCapWithMore && (
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {t('topCapScope', { count: visibleActiveRisks.length })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {view.kind === 'READY' && lowRisks.length > 0 && (
            <div className={visiblePriorityRisks.length > 0 ? 'mt-3' : ''}>
              <button
                type="button"
                aria-expanded={lowExpanded}
                onClick={() => setLowExpanded((prev) => !prev)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-[var(--sc-text-secondary)] transition-colors duration-150 hover:bg-[var(--sc-primary-alpha-08)] hover:text-[var(--sc-primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)]"
              >
                <span>
                  {lowExpanded
                    ? t('hideLowTier', { count: lowRisks.length })
                    : t('showLowTier', { count: lowRisks.length })}
                </span>
                {lowExpanded ? (
                  <ChevronUp aria-hidden="true" size={14} />
                ) : (
                  <ChevronDown aria-hidden="true" size={14} />
                )}
              </button>
              {lowExpanded && (
                <div className="mt-2 space-y-2.5">
                  {renderRiskRows(lowRisks)}
                  {visiblePriorityRisks.length === 0 &&
                    (canLoadMoreFromApi || atApiCapWithMore || snapshot.loadMoreError) && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {canLoadMoreFromApi && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            isLoading={Boolean(snapshot.loadMoreLoading)}
                            onClick={handleShowMore}
                          >
                            {t('showMore')}
                          </Button>
                        )}
                        {snapshot.loadMoreError && (
                          <div
                            role="status"
                            className="flex flex-wrap items-center gap-2 text-xs text-[var(--sc-error-dark)]"
                          >
                            <span>{t('loadMoreError')}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleShowMore}
                            >
                              {t('retry')}
                            </Button>
                          </div>
                        )}
                        {atApiCapWithMore && (
                          <p className="text-xs text-[var(--sc-text-secondary)]">
                            {t('topCapScope', { count: visibleActiveRisks.length })}
                          </p>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {renderParcelModal()}
    </div>
  );
}
