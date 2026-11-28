import { useEffect, useMemo, useRef, useState } from 'react';

import { useLocation } from 'react-router-dom';

import { Download, ExternalLink, Plus, RefreshCw, Search, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropzone,
  Input,
  PageHeader,
  Select,
  UnderConstruction,
} from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useIsRealtimeConnected, useRealtimeSync } from '@/features/realtime-notifications';
import { calendarRangeIssue, reportIncompleteDateInput } from '@/lib/dateValidation';
import { notificationTarget } from '@/lib/notificationTarget';
import { useAuthStore } from '@/stores/authStore';

import { GoogleSheetConnection } from './GoogleSheetConnection';
import { ManualOrderForm } from './ManualOrderForm';
import { OrderCancellationActions } from './OrderCancellationActions';
import { OrderCollectionAmount, OrderCollectionTotal } from './OrderCodCollection';
import { OrderDetail } from './OrderDetail';
import { OrderDispatchReview } from './OrderDispatchReview';
import { OrderLifecycleActions } from './OrderLifecycleActions';
import { OrderPolicyActions } from './OrderPolicyActions';
import { PackedOrderDispatchReview } from './PackedOrderDispatchReview';
import { SellerWithdrawalForm } from './SellerWithdrawalForm';
import {
  ORDER_STATUSES,
  ordersApi,
  type ImportResult,
  type OrderFilters,
  type SellerOrder,
  type SellerOrderDetail,
} from '../api/ordersApi';
import { useOrderDetailRefresh } from '../hooks/useOrderDetailRefresh';
import { useOrders } from '../hooks/useOrders';
import { importRowFeedback, orderErrorKey, orderReasonKey } from '../lib/orderFeedback';
import { formatOrderDate, formatOrderMoney } from '../lib/orderPresentation';
import {
  orderScope,
  sellerFreightAccess,
  sellerOrderAccess,
  sellerWithdrawalAccess,
} from '../lib/orderScope';
import {
  DEFAULT_QUICK_PARCEL,
  QuickFreightLookupModal,
  useQuickFreightLookup,
} from '../seller-freight/lookup';
import {
  OrderFreightCell,
  OrderShippingAmounts,
  validDispatchEstimate,
  OrderLifecycleBadge,
  OrderWaybillCell,
  OrderWaybillDetails,
  buildAssumptionModalTargets,
  buildLookupItemsFromAssumptions,
  createInitialAssumptionParcels,
  toggleOrderSelection,
  toggleVisibleOrderSelection,
  useOrderFreight,
} from '../seller-freight/order-selection';
import {
  preventInvalidIntegerKeyDown,
  validateParcelIntegerField,
  type DispatchFreightEstimate,
  type FreightDraftSeed,
  type ParcelDimensions,
} from '../seller-freight/shared';

export function SellerOrders() {
  const search = useLocation().search;
  const linkedOrder = notificationTarget(search, 'orderId');
  const linkedParcel = linkedOrder ? notificationTarget(search, 'parcelId') : null;
  const scope = useAuthStore(orderScope);
  const access = sellerOrderAccess();
  if (!access.read) return <UnderConstruction />;
  return (
    <SellerOrdersSession
      key={`${scope}:${linkedOrder ?? ''}:${linkedParcel ?? ''}`}
      scope={scope}
      owner={access.create}
      initialId={linkedOrder}
      initialParcelId={linkedParcel}
    />
  );
}

function SellerOrdersSession({
  scope,
  owner,
  initialId,
  initialParcelId,
}: {
  scope: string;
  owner: boolean;
  initialId: string | null;
  initialParcelId: string | null;
}) {
  const canIntake = useAuthStore((state) => state.user?.serviceStatus === 'ACTIVE');
  const t = useTranslations('Orders');
  const tReview = useTranslations('OrderReview');
  const tCommon = useTranslations('Common');
  const dateText = useTranslations('DateValidation');
  const locale = useLocale();
  const [draftFilters, setDraftFilters] = useState<OrderFilters>({
    status: '',
    channel: '',
    from: '',
    to: '',
  });
  const [filters, setFilters] = useState(draftFilters);
  const dateIssue = calendarRangeIssue(draftFilters.from, draftFilters.to);
  const orders = useOrders(scope, filters, owner);
  const freightAccess = sellerFreightAccess();
  const [reviewSelection, setReviewSelection] = useState<ReadonlySet<string>>(new Set());
  const [reviewOrders, setReviewOrders] = useState<SellerOrder[] | null>(null);
  const [packedConfirmedOrderId, setPackedConfirmedOrderId] = useState<string | null>(null);
  const [focusedReview, setFocusedReview] = useState(
    initialId && initialParcelId ? { orderId: initialId, parcelId: initialParcelId } : null,
  );
  const [reviewEstimates, setReviewEstimates] = useState<Record<string, DispatchFreightEstimate>>(
    {},
  );
  useEffect(() => {
    const expires = Object.values(reviewEstimates).map(({ expiresAt }) => Date.parse(expiresAt));
    if (!expires.length) return;
    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        setReviewEstimates((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, estimate]) => Date.parse(estimate.expiresAt) > now),
          ),
        );
      },
      Math.max(0, Math.min(...expires) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [reviewEstimates]);
  const reviewable =
    owner && freightAccess.canQuoteFreight
      ? orders.items.filter(({ dispatchReviewState }) => dispatchReviewState === 'AWAITING_INITIAL')
      : [];
  const selectedReviewOrders = reviewable.filter(({ id }) => reviewSelection.has(id));
  const [modal, setModal] = useState<
    | 'manual'
    | 'import'
    | 'detail'
    | 'sheet'
    | 'withdrawal'
    | 'freight'
    | 'freight-assumption'
    | null
  >(null);
  const [manualSeed, setManualSeed] = useState<FreightDraftSeed | null>(null);
  const [assumptionTargets, setAssumptionTargets] = useState<string[]>([]);
  const [assumptionParcelsByKey, setAssumptionParcelsByKey] = useState<
    Record<string, ParcelDimensions>
  >({});
  const [assumptionDraftsByKey, setAssumptionDraftsByKey] = useState<
    Record<string, { weightG: string; lengthCm: string; widthCm: string; heightCm: string }>
  >({});
  const [assumptionTouched, setAssumptionTouched] = useState<Record<string, boolean>>({});
  const [assumptionSubmitted, setAssumptionSubmitted] = useState(false);
  const [detail, setDetail] = useState<SellerOrderDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expandedWaybillId, setExpandedWaybillId] = useState<string | null>(null);
  const [waybillRequestNumber, setWaybillRequestNumber] = useState(0);
  const [waybillResult, setWaybillResult] = useState<{
    requestKey: string;
    detail: SellerOrderDetail | null;
  } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const hasExcelShipping = result?.items.some((row) => row.excelShipPolicy) ?? false;
  const [accepted, setAccepted] = useState<{ id: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeDetailId = useRef<string | null>(null);
  const assumptionReturnModal = useRef<'detail' | null>(null);
  const isRealtimeConnected = useIsRealtimeConnected();
  const running = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const visibleOrderIdsKey = orders.items.map((o) => o.id).join(',');
  const visibleOrderIds = useMemo(
    () => (visibleOrderIdsKey ? visibleOrderIdsKey.split(',') : []),
    [visibleOrderIdsKey],
  );
  const orderFreight = useOrderFreight({ scope, visibleOrderIds });
  const expandedOrderVersion = orders.items.find(({ id }) => id === expandedWaybillId)?.version;
  const expandedFreightRow = expandedWaybillId
    ? orderFreight.state.rowsByOrderId[expandedWaybillId]
    : undefined;
  const waybillRequestKey =
    owner &&
    freightAccess.canViewFreight &&
    expandedWaybillId &&
    expandedOrderVersion !== undefined &&
    expandedFreightRow?.state === 'VISIBLE' &&
    expandedFreightRow.parcels.filter(({ trackingNumber }) => trackingNumber?.trim()).length > 1
      ? `${expandedWaybillId}:${expandedOrderVersion}:${expandedFreightRow.sourceRevision}:${waybillRequestNumber}`
      : null;
  const { refreshStatus: refreshOrderFreightStatus } = orderFreight;
  const assumptionOrigins = useQuickFreightLookup({
    scope,
    isOpen: modal === 'freight-assumption',
    enabled: freightAccess.canQuoteFreight,
  });
  const freightOrderIds = useMemo(
    () =>
      modal === 'detail' && detailId && !visibleOrderIds.includes(detailId)
        ? [...visibleOrderIds, detailId]
        : visibleOrderIds,
    [modal, detailId, visibleOrderIds],
  );
  useEffect(() => {
    if (freightAccess.canViewFreight && freightOrderIds.length > 0)
      void refreshOrderFreightStatus(freightOrderIds);
  }, [freightAccess.canViewFreight, freightOrderIds, refreshOrderFreightStatus]);
  useEffect(() => {
    if (!waybillRequestKey || !expandedWaybillId || orderScope() !== scope) return;
    const controller = new AbortController();
    const pending = controllers.current;
    pending.add(controller);
    const canApply = () => !controller.signal.aborted && orderScope() === scope;
    void ordersApi
      .detail(expandedWaybillId, true, controller.signal)
      .then(
        (response) => {
          if (canApply()) setWaybillResult({ requestKey: waybillRequestKey, detail: response });
        },
        () => {
          if (canApply()) setWaybillResult({ requestKey: waybillRequestKey, detail: null });
        },
      )
      .finally(() => pending.delete(controller));
    return () => {
      controller.abort();
      pending.delete(controller);
    };
  }, [expandedWaybillId, scope, waybillRequestKey]);
  useOrderDetailRefresh({
    scope,
    owner,
    detail,
    active: modal === 'detail' && !busy,
    realtimeConnected: isRealtimeConnected,
    setDetail,
    setError,
  });
  useRealtimeSync(['outbound.orders', 'shipments.tracking'], () => {
    orders.reload();
    if (freightAccess.canViewFreight && freightOrderIds.length > 0) {
      void refreshOrderFreightStatus(freightOrderIds);
    }
    const currentId = activeDetailId.current;
    if (modal === 'detail' && currentId && !running.current && orderScope() === scope) {
      void execute(async (signal) => {
        const response = await ordersApi.detail(currentId, owner, signal);
        if (orderScope() === scope && !signal.aborted && activeDetailId.current === currentId) {
          setDetail((current) =>
            current?.id === currentId && current.version > response.version ? current : response,
          );
        }
      });
    }
  });
  useEffect(() => {
    const pending = controllers.current;
    const abort = () => pending.forEach((controller) => controller.abort());
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) abort();
    });
    return () => {
      unsubscribe();
      abort();
    };
  }, [scope]);

  async function execute(action: (signal: AbortSignal) => Promise<void>, write = false) {
    if (
      running.current ||
      orderScope() !== scope ||
      !(write ? sellerOrderAccess().create && sellerOrderAccess().intake : sellerOrderAccess().read)
    ) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted && orderScope() === scope) setError(t(orderErrorKey(failure)));
    } finally {
      controllers.current.delete(controller);
      running.current = false;
      if (orderScope() === scope) setBusy(false);
    }
  }
  function openDetail(id: string) {
    activeDetailId.current = id;
    setDetail((current) => (current?.id === id ? current : null));
    setDetailId(id);
    setModal('detail');
    void execute(async (signal) => {
      const response = await ordersApi.detail(id, owner, signal);
      if (orderScope() === scope && !signal.aborted && activeDetailId.current === id) {
        setDetail((current) =>
          current?.id === id && current.version > response.version ? current : response,
        );
      }
    });
  }
  useEffect(() => {
    if (!initialId || orderScope() !== scope) return;
    const controller = new AbortController();
    controllers.current.add(controller);
    setDetail(null);
    activeDetailId.current = initialId;
    setDetailId(initialId);
    setModal('detail');
    setError(null);
    setBusy(true);
    void ordersApi
      .detail(initialId, owner, controller.signal)
      .then((response) => {
        if (
          !controller.signal.aborted &&
          orderScope() === scope &&
          activeDetailId.current === initialId
        ) {
          setDetail((current) =>
            current?.id === initialId && current.version > response.version ? current : response,
          );
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && orderScope() === scope) {
          setError(t(orderErrorKey(failure)));
        }
      })
      .finally(() => {
        controllers.current.delete(controller);
        if (!controller.signal.aborted && orderScope() === scope) setBusy(false);
      });
    return () => controller.abort();
  }, [initialId, owner, scope, t]);
  function importOrders(preview = false) {
    if (!files[0] || !files[0].name.toLowerCase().endsWith('.xlsx')) {
      setError(t('invalid_file'));
      return;
    }
    void execute(async (signal) => {
      const response = await ordersApi.import(files[0], signal, preview);
      if (orderScope() === scope && !signal.aborted) {
        setResult(response);
        if (!preview) await orders.reload();
      }
    }, true);
  }
  function downloadTemplate(sheet = false, detailed = false) {
    void execute(async (signal) => {
      const template = await ordersApi.template(signal, sheet, detailed);
      if (orderScope() !== scope || signal.aborted) return;
      const bytes = Uint8Array.from(atob(template.contentBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = template.fileName;
      link.click();
      URL.revokeObjectURL(url);
    }, true);
  }
  const assumptionModalTargets = useMemo(
    () => buildAssumptionModalTargets(assumptionTargets, orderFreight.state.rowsByOrderId),
    [assumptionTargets, orderFreight.state.rowsByOrderId],
  );
  const requiresAssumptionOrigin = assumptionModalTargets.some((target) => target.requiresOrigin);

  const handleOrderLookupRequest = (targetIds: string[]) => {
    if (!freightAccess.canQuoteFreight || targetIds.length === 0) return;
    if (targetIds.length === 1) {
      const targetId = targetIds[0];
      const existing = targetId ? orderFreight.state.rowsByOrderId[targetId] : undefined;
      if (
        existing?.state === 'VISIBLE' &&
        existing.parcels.some((p) => p.freight.state === 'NEEDS_INPUT')
      ) {
        const nextTargets = buildAssumptionModalTargets(
          [targetId],
          orderFreight.state.rowsByOrderId,
        );
        const initialParcels = createInitialAssumptionParcels(nextTargets, DEFAULT_QUICK_PARCEL);
        const initialDrafts: Record<
          string,
          { weightG: string; lengthCm: string; widthCm: string; heightCm: string }
        > = {};
        for (const [key, parcel] of Object.entries(initialParcels)) {
          initialDrafts[key] = {
            weightG: String(parcel.weightG),
            lengthCm: String(parcel.lengthCm),
            widthCm: String(parcel.widthCm),
            heightCm: String(parcel.heightCm),
          };
        }
        assumptionReturnModal.current = modal === 'detail' ? 'detail' : null;
        setAssumptionTargets([targetId]);
        setAssumptionParcelsByKey(initialParcels);
        setAssumptionDraftsByKey(initialDrafts);
        setAssumptionTouched({});
        setAssumptionSubmitted(false);
        setModal('freight-assumption');
        return;
      }
    }
    void orderFreight.lookupOrders(targetIds.map((orderId) => ({ orderId })));
  };

  const updateAssumptionParcelField = (
    key: string,
    field: 'weightG' | 'lengthCm' | 'widthCm' | 'heightCm',
    rawValue: string,
  ) => {
    const limits =
      field === 'weightG'
        ? { label: 'Cân nặng', min: 1, max: 1_000_000, unit: 'g' }
        : { label: field, min: 1, max: 1_000, unit: 'cm' };
    const check = validateParcelIntegerField(rawValue, limits);
    setAssumptionDraftsByKey((prev) => {
      const current = prev[key] ?? {
        weightG: String(DEFAULT_QUICK_PARCEL.weightG),
        lengthCm: String(DEFAULT_QUICK_PARCEL.lengthCm),
        widthCm: String(DEFAULT_QUICK_PARCEL.widthCm),
        heightCm: String(DEFAULT_QUICK_PARCEL.heightCm),
      };
      return {
        ...prev,
        [key]: { ...current, [field]: rawValue },
      };
    });
    setAssumptionParcelsByKey((prev) => {
      const current = prev[key] ?? { ...DEFAULT_QUICK_PARCEL, itemCount: 1 };
      return {
        ...prev,
        [key]: { ...current, [field]: check.value ?? 0 },
      };
    });
  };

  const getAssumptionFieldChecks = (key: string) => {
    const draft = assumptionDraftsByKey[key] ?? {
      weightG: String(DEFAULT_QUICK_PARCEL.weightG),
      lengthCm: String(DEFAULT_QUICK_PARCEL.lengthCm),
      widthCm: String(DEFAULT_QUICK_PARCEL.widthCm),
      heightCm: String(DEFAULT_QUICK_PARCEL.heightCm),
    };
    return {
      draft,
      weightG: validateParcelIntegerField(draft.weightG, {
        label: 'Cân nặng',
        min: 1,
        max: 1_000_000,
        unit: 'g',
      }),
      lengthCm: validateParcelIntegerField(draft.lengthCm, {
        label: 'Dài',
        min: 1,
        max: 1_000,
        unit: 'cm',
      }),
      widthCm: validateParcelIntegerField(draft.widthCm, {
        label: 'Rộng',
        min: 1,
        max: 1_000,
        unit: 'cm',
      }),
      heightCm: validateParcelIntegerField(draft.heightCm, {
        label: 'Cao',
        min: 1,
        max: 1_000,
        unit: 'cm',
      }),
    };
  };

  const hasInvalidAssumptionParcel = assumptionModalTargets.some((target) => {
    const checks = getAssumptionFieldChecks(target.key);
    return (
      checks.weightG.value === null ||
      checks.lengthCm.value === null ||
      checks.widthCm.value === null ||
      checks.heightCm.value === null
    );
  });

  const handleCloseAssumptionModal = () => {
    const returnTo = assumptionReturnModal.current;
    assumptionReturnModal.current = null;
    setAssumptionSubmitted(false);
    setModal(returnTo);
  };

  const handleConfirmAssumptionLookup = () => {
    setAssumptionSubmitted(true);
    if (
      assumptionModalTargets.length === 0 ||
      hasInvalidAssumptionParcel ||
      (requiresAssumptionOrigin && !assumptionOrigins.state.selectedOriginId)
    ) {
      return;
    }
    const items = buildLookupItemsFromAssumptions({
      targetOrderIds: assumptionTargets,
      rowsByOrderId: orderFreight.state.rowsByOrderId,
      parcelsByKey: assumptionParcelsByKey,
      selectedOriginId: assumptionOrigins.state.selectedOriginId,
      defaultParcel: DEFAULT_QUICK_PARCEL,
    });
    const returnTo = assumptionReturnModal.current;
    assumptionReturnModal.current = null;
    setAssumptionSubmitted(false);
    setModal(returnTo);
    void orderFreight.lookupOrders(items);
  };

  const columns: ColumnDef<SellerOrder>[] = [
    ...(reviewable.length > 0
      ? [
          {
            key: 'dispatchReviewSelection',
            label: (
              <Checkbox
                aria-label={tReview('chooseVisible')}
                checked={selectedReviewOrders.length === reviewable.length}
                onChange={() =>
                  setReviewSelection((current) =>
                    toggleVisibleOrderSelection(
                      current,
                      reviewable.map(({ id }) => id),
                    ),
                  )
                }
              />
            ),
            render: (order: SellerOrder) =>
              order.dispatchReviewState === 'AWAITING_INITIAL' ? (
                <Checkbox
                  aria-label={tReview('chooseOrder', { code: order.externalOrderCode })}
                  checked={reviewSelection.has(order.id)}
                  onChange={() =>
                    setReviewSelection((current) => toggleOrderSelection(current, order.id))
                  }
                />
              ) : null,
          } satisfies ColumnDef<SellerOrder>,
        ]
      : []),
    {
      key: 'externalOrderCode',
      label: t('order_code'),
      render: (order) => (
        <div className="min-w-0">
          <button
            type="button"
            disabled={busy}
            className="whitespace-nowrap text-left font-mono text-[13px] font-semibold text-[var(--sc-primary-dark)] transition-colors hover:text-[var(--sc-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)] disabled:opacity-50"
            onClick={() => openDetail(order.id)}
          >
            {order.externalOrderCode}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--sc-text-secondary)]">
            <span className="inline-flex items-center whitespace-nowrap rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-medium">
              {order.kind === 'WITHDRAWAL'
                ? t('withdrawalOrder')
                : order.sourceChannel === 'manual'
                  ? t('manual_channel')
                  : order.sourceChannel === 'excel'
                    ? t('excel_channel')
                    : order.sourceChannel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {formatOrderDate(order.createdAt, locale)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: t('status'),
      render: (order) => {
        const isCodHold = order.holdReason === 'HOLD_RISKY_COD';
        return (
          <div className="flex flex-col items-start gap-1">
            {isCodHold && order.status === 'ON_HOLD' ? (
              <span title={t(orderReasonKey(order.holdReason))}>
                <OrderLifecycleBadge status={order.status} label={t('holdShort.HOLD_RISKY_COD')} />
              </span>
            ) : (
              <>
                <OrderLifecycleBadge status={order.status} label={t(`statuses.${order.status}`)} />
                {order.holdReason && (
                  <p
                    title={t(orderReasonKey(order.holdReason))}
                    className={
                      isCodHold
                        ? 'text-[11px] leading-4 text-[var(--sc-warning-dark)]'
                        : 'max-w-[200px] text-[11px] leading-4 text-[var(--sc-warning-dark)] line-clamp-2'
                    }
                  >
                    {isCodHold
                      ? t('holdShort.HOLD_RISKY_COD')
                      : t(orderReasonKey(order.holdReason))}
                  </p>
                )}
              </>
            )}
            {owner && order.dispatchReviewState && (
              <span className="text-[11px] font-medium text-[var(--sc-warning-dark)]">
                {tReview(order.dispatchReviewState)}
              </span>
            )}
          </div>
        );
      },
    },
    ...(freightAccess.canViewFreight
      ? [
          {
            key: 'trackingNumber',
            label: t('trackingLabel'),
            render: (order: SellerOrder) => (
              <OrderWaybillCell
                row={orderFreight.state.rowsByOrderId[order.id]}
                orderKind={order.kind}
                loading={orderFreight.state.statusLoading}
                expanded={expandedWaybillId === order.id && waybillRequestKey !== null}
                onToggle={() => {
                  if (expandedWaybillId !== order.id) {
                    setWaybillRequestNumber((value) => value + 1);
                  }
                  setExpandedWaybillId(expandedWaybillId === order.id ? null : order.id);
                }}
              />
            ),
          } satisfies ColumnDef<SellerOrder>,
        ]
      : []),
    ...(owner
      ? [
          {
            key: 'goodsDue',
            label: t('collectionList.goods'),
            align: 'right' as const,
            render: (order: SellerOrder) => <OrderCollectionAmount order={order} field="goods" />,
          } satisfies ColumnDef<SellerOrder>,
          {
            key: 'shippingDue',
            label: t('collectionList.shipping'),
            align: 'right' as const,
            render: (order: SellerOrder) => {
              const row = orderFreight.state.rowsByOrderId[order.id];
              const estimate = reviewEstimates[order.id];
              const displayEstimate =
                order.dispatchReviewState === 'AWAITING_INITIAL' &&
                row?.state === 'VISIBLE' &&
                row.orderVersion === order.version &&
                validDispatchEstimate(estimate, row);
              return (
                <OrderShippingAmounts
                  customer={<OrderCollectionAmount order={order} field="shipping" />}
                  shop={
                    freightAccess.canViewFreight &&
                    order.kind !== 'WITHDRAWAL' && (
                      <OrderFreightCell
                        parcels={row?.state === 'VISIBLE' ? row.parcels : undefined}
                        estimateAmountVnd={displayEstimate ? estimate?.amountVnd : undefined}
                        loading={
                          orderFreight.state.statusLoading ||
                          orderFreight.state.pendingOrderIds.has(order.id)
                        }
                        canQuote={freightAccess.canQuoteFreight}
                        onQuickLookup={() => handleOrderLookupRequest([order.id])}
                        onReviewParcel={
                          freightAccess.canQuoteFreight
                            ? (parcelId) => {
                                setFocusedReview({ orderId: order.id, parcelId });
                                openDetail(order.id);
                              }
                            : undefined
                        }
                      />
                    )
                  }
                />
              );
            },
          } satisfies ColumnDef<SellerOrder>,
          {
            key: 'codAmount',
            label: t('collectionList.total'),
            align: 'right' as const,
            render: (order: SellerOrder) => <OrderCollectionTotal order={order} />,
          } satisfies ColumnDef<SellerOrder>,
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              isLoading={orders.loading}
              onClick={() => {
                void orders.reload();
                if (freightAccess.canViewFreight && freightOrderIds.length)
                  void refreshOrderFreightStatus(freightOrderIds);
              }}
            >
              <RefreshCw size={16} />
              {t('refresh')}
            </Button>
            {owner && (
              <>
                {sellerWithdrawalAccess() && (
                  <Button variant="outline" onClick={() => setModal('withdrawal')}>
                    {t('withdrawalOrder')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!canIntake}
                  onClick={() => {
                    setError(null);
                    setModal('sheet');
                  }}
                >
                  {t('sheetConnect')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setModal('import');
                  }}
                >
                  <Upload size={16} />
                  {t('import')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!freightAccess.canQuoteFreight}
                  onClick={() => {
                    setError(null);
                    setModal('freight');
                  }}
                >
                  {t('freight.quickButton')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!canIntake}
                  onClick={() => {
                    setError(null);
                    setModal('manual');
                  }}
                >
                  <Plus size={16} />
                  {t('create')}
                </Button>
              </>
            )}
          </div>
        }
      />
      {accepted && (
        <Alert variant="success" onClose={() => setAccepted(null)}>
          {t('accepted_hint')}
          <p>{accepted.code}</p>
          <Button variant="ghost" onClick={() => openDetail(accepted.id)}>
            {t('view_order')}
          </Button>
        </Alert>
      )}
      {orders.error !== null && (
        <Alert variant="error">
          {t('response_error')}
          <Button variant="ghost" onClick={() => void orders.reload()}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      <Card padding="none" className="@container overflow-hidden">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (dateIssue || reportIncompleteDateInput(event.currentTarget)) return;
            const trimmedFilters: OrderFilters = {
              ...draftFilters,
              q: draftFilters.q?.trim() || undefined,
              channel: draftFilters.channel.trim(),
            };
            setDraftFilters(trimmedFilters);
            setFilters(trimmedFilters);
            setReviewSelection(new Set());
          }}
          noValidate
          className="grid items-start gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 @[66rem]:grid-cols-[minmax(160px,1.35fr)_minmax(145px,1fr)_minmax(115px,0.85fr)_minmax(130px,0.9fr)_minmax(130px,0.9fr)_auto]"
        >
          <Input
            label={t('order_code')}
            placeholder={t('search_code')}
            maxLength={100}
            leftIcon={<Search size={15} aria-hidden="true" />}
            value={draftFilters.q ?? ''}
            onChange={(event) => setDraftFilters({ ...draftFilters, q: event.target.value })}
          />
          <Select
            label={t('status')}
            value={draftFilters.status}
            isPlaceholderDisabled={false}
            placeholder={t('all_statuses')}
            options={ORDER_STATUSES.map((status) => ({
              value: status,
              label: t(`statuses.${status}`),
            }))}
            onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value })}
          />
          <Input
            label={t('fields.sourceChannel')}
            placeholder="manual, excel..."
            value={draftFilters.channel}
            maxLength={100}
            onChange={(event) => setDraftFilters({ ...draftFilters, channel: event.target.value })}
          />
          <Input
            label={t('from')}
            type="date"
            value={draftFilters.from}
            max={draftFilters.to || undefined}
            error={dateIssue?.field === 'from' ? dateText(dateIssue.message) : undefined}
            onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
          />
          <Input
            label={t('to')}
            type="date"
            value={draftFilters.to}
            min={draftFilters.from || undefined}
            error={dateIssue?.field === 'to' ? dateText(dateIssue.message) : undefined}
            onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
          />
          <div className="flex items-center gap-2 sm:pt-7 lg:justify-end @[66rem]:justify-start @[66rem]:flex-nowrap">
            <Button type="submit" disabled={orders.loading}>
              {t('filter')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const empty = { status: '', channel: '', from: '', to: '' };
                setDraftFilters(empty);
                setFilters(empty);
                setReviewSelection(new Set());
              }}
            >
              {t('reset_filters')}
            </Button>
          </div>
        </form>
        {selectedReviewOrders.length > 0 && (
          <div className="flex justify-end border-b border-[var(--sc-border-default)] px-5 py-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => setReviewOrders(selectedReviewOrders)}
            >
              {tReview('openBatch', { count: selectedReviewOrders.length })}
            </Button>
          </div>
        )}
        <DataTable
          dense
          ariaLabel={t('title')}
          columns={columns}
          data={orders.items}
          getRowKey={(order) => order.id}
          renderRowDetails={(order, columnCount) => {
            if (
              !owner ||
              order.id !== expandedWaybillId ||
              !waybillRequestKey ||
              expandedFreightRow?.state !== 'VISIBLE'
            ) {
              return null;
            }
            const result = waybillResult?.requestKey === waybillRequestKey ? waybillResult : null;
            if (result?.detail) {
              return <OrderWaybillDetails order={result.detail} freight={expandedFreightRow} />;
            }
            return (
              <tr id={`waybill-details-${order.id}`}>
                <td
                  colSpan={columnCount}
                  className="px-4 py-2 text-sm text-[var(--sc-text-secondary)]"
                >
                  {result ? (
                    <div className="flex items-center gap-2">
                      <span role="status">{t('waybillDetailsError')}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setWaybillRequestNumber((value) => value + 1)}
                      >
                        {t('retry')}
                      </Button>
                    </div>
                  ) : (
                    <span role="status">{t('loading')}</span>
                  )}
                </td>
              </tr>
            );
          }}
          isLoading={orders.loading && !orders.items.length}
          emptyMessage={t('empty')}
        />
        {orders.hasNext && (
          <div className="flex justify-center p-4">
            <Button
              variant="secondary"
              isLoading={orders.loading}
              onClick={() => void orders.loadMore()}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </Card>
      {owner && (
        <Modal
          isOpen={modal === 'sheet'}
          title={t('sheetConnect')}
          width="640px"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal === 'sheet' && (
            <GoogleSheetConnection scope={scope} onTemplate={() => downloadTemplate(true)} />
          )}
          {busy && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error">{error}</Alert>}
        </Modal>
      )}
      {owner && (
        <SellerWithdrawalForm
          scope={scope}
          isOpen={modal === 'withdrawal'}
          onClose={() => setModal(null)}
          onAccepted={(id, code) => {
            setAccepted({ id, code });
            setModal(null);
            void orders.reload();
          }}
        />
      )}
      {/* Keep the form mounted across dialog closes; scope changes remount this session. */}
      {owner && (
        <ManualOrderForm
          scope={scope}
          isOpen={modal === 'manual'}
          initialSeed={manualSeed}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          onBusyChange={setBusy}
          onAccepted={(id, code) => {
            setAccepted({ id, code });
            setModal(null);
            void orders.reload();
          }}
        />
      )}
      {freightAccess.canQuoteFreight && (
        <QuickFreightLookupModal
          scope={scope}
          isOpen={modal === 'freight'}
          onClose={() => setModal(null)}
          canQuote={freightAccess.canQuoteFreight}
          canCreateOrder={canIntake}
          onCreateOrderWithSeed={(seed) => {
            setManualSeed(seed);
            setModal('manual');
          }}
        />
      )}
      <Modal
        isOpen={modal === 'freight-assumption'}
        title="Giả định kiện để tra cước"
        width="min(94vw, 560px)"
        onClose={handleCloseAssumptionModal}
      >
        <div className="space-y-4">
          <Alert variant="info">
            {assumptionModalTargets.length > 1
              ? `Đơn có ${assumptionModalTargets.length} kiện chưa đóng gói. Nhập kích thước dự kiến cho từng kiện để hỏi giá hãng (không tạo vận đơn).`
              : 'Đơn chưa có vận đơn/đóng gói cần xác nhận ước tính cho kiện chưa có số đo (không tạo vận đơn).'}
          </Alert>
          {requiresAssumptionOrigin && (
            <Select
              label="Kho gửi giả định"
              isRequired
              placeholder="Chọn kho hợp đồng"
              value={assumptionOrigins.state.selectedOriginId}
              error={
                (assumptionTouched.origin || assumptionSubmitted) &&
                !assumptionOrigins.state.selectedOriginId
                  ? 'Chọn kho hợp đồng để tra cước.'
                  : undefined
              }
              onBlur={() => setAssumptionTouched((prev) => ({ ...prev, origin: true }))}
              onChange={(event) => {
                setAssumptionTouched((prev) => ({ ...prev, origin: true }));
                assumptionOrigins.setSelectedOrigin(event.target.value);
              }}
              options={assumptionOrigins.state.origins.map((origin) => ({
                value: origin.id,
                label: `${origin.name} (${origin.code})`,
              }))}
            />
          )}
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {assumptionModalTargets.map((target) => {
              const checks = getAssumptionFieldChecks(target.key);
              const labelPrefix =
                assumptionModalTargets.length > 1 ? `Kiện #${target.parcelNumber}` : null;
              const showAssumptionError = (
                field: 'weightG' | 'lengthCm' | 'widthCm' | 'heightCm',
              ) => {
                const check = checks[field];
                if (!check.error) return undefined;
                if (
                  !check.isEmpty ||
                  assumptionTouched[`${target.key}:${field}`] ||
                  assumptionSubmitted
                ) {
                  return check.error;
                }
                return undefined;
              };
              return (
                <fieldset
                  key={target.key}
                  className="space-y-2 rounded-lg border border-[var(--sc-border-default)] p-3"
                >
                  {labelPrefix && (
                    <legend className="px-1.5 text-xs font-semibold text-[var(--sc-text-primary)]">
                      {labelPrefix}
                    </legend>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Input
                      label="Cân nặng (g)"
                      isRequired
                      aria-label={labelPrefix ? `${labelPrefix} - Cân nặng (g)` : 'Cân nặng (g)'}
                      type="text"
                      inputMode="numeric"
                      value={checks.draft.weightG}
                      error={showAssumptionError('weightG')}
                      onKeyDown={preventInvalidIntegerKeyDown}
                      onBlur={() =>
                        setAssumptionTouched((prev) => ({
                          ...prev,
                          [`${target.key}:weightG`]: true,
                        }))
                      }
                      onChange={(event) =>
                        updateAssumptionParcelField(target.key, 'weightG', event.target.value)
                      }
                    />
                    <Input
                      label="Dài (cm)"
                      isRequired
                      aria-label={labelPrefix ? `${labelPrefix} - Dài (cm)` : 'Dài (cm)'}
                      type="text"
                      inputMode="numeric"
                      value={checks.draft.lengthCm}
                      error={showAssumptionError('lengthCm')}
                      onKeyDown={preventInvalidIntegerKeyDown}
                      onBlur={() =>
                        setAssumptionTouched((prev) => ({
                          ...prev,
                          [`${target.key}:lengthCm`]: true,
                        }))
                      }
                      onChange={(event) =>
                        updateAssumptionParcelField(target.key, 'lengthCm', event.target.value)
                      }
                    />
                    <Input
                      label="Rộng (cm)"
                      isRequired
                      aria-label={labelPrefix ? `${labelPrefix} - Rộng (cm)` : 'Rộng (cm)'}
                      type="text"
                      inputMode="numeric"
                      value={checks.draft.widthCm}
                      error={showAssumptionError('widthCm')}
                      onKeyDown={preventInvalidIntegerKeyDown}
                      onBlur={() =>
                        setAssumptionTouched((prev) => ({
                          ...prev,
                          [`${target.key}:widthCm`]: true,
                        }))
                      }
                      onChange={(event) =>
                        updateAssumptionParcelField(target.key, 'widthCm', event.target.value)
                      }
                    />
                    <Input
                      label="Cao (cm)"
                      isRequired
                      aria-label={labelPrefix ? `${labelPrefix} - Cao (cm)` : 'Cao (cm)'}
                      type="text"
                      inputMode="numeric"
                      value={checks.draft.heightCm}
                      error={showAssumptionError('heightCm')}
                      onKeyDown={preventInvalidIntegerKeyDown}
                      onBlur={() =>
                        setAssumptionTouched((prev) => ({
                          ...prev,
                          [`${target.key}:heightCm`]: true,
                        }))
                      }
                      onChange={(event) =>
                        updateAssumptionParcelField(target.key, 'heightCm', event.target.value)
                      }
                    />
                  </div>
                </fieldset>
              );
            })}
          </div>
          {assumptionSubmitted &&
            (hasInvalidAssumptionParcel ||
              (requiresAssumptionOrigin && !assumptionOrigins.state.selectedOriginId)) && (
              <Alert variant="error" compact notify={false}>
                Vui lòng nhập đầy đủ số đo nguyên dương hợp lệ (cân nặng 1–1.000.000 g; dài/rộng/cao
                1–1.000 cm) và kho gửi trước khi tra cước.
              </Alert>
            )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCloseAssumptionModal}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={assumptionModalTargets.length === 0}
              onClick={handleConfirmAssumptionLookup}
            >
              {assumptionModalTargets.length > 1
                ? `Xác nhận tra cho ${assumptionModalTargets.length} kiện`
                : 'Xác nhận tra cho 1 kiện'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={modal === 'import'}
        title={t('importModalTitle')}
        width="760px"
        onClose={() => {
          if (!busy) setModal(null);
        }}
      >
        <div className="space-y-4">
          <Dropzone
            compact
            title={t('importDropzoneTitle')}
            hint={t('importLimits')}
            files={files}
            onFilesChange={(next) => {
              setFiles(next);
              setResult(null);
              setError(null);
            }}
            accept=".xlsx"
            multiple={false}
            maxSizeMb={1}
            disabled={busy}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.03em] text-[var(--sc-text-secondary)]">
              {t('importTemplatesTitle')}
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => downloadTemplate()}
                className="group flex w-full flex-col items-start gap-1 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3.5 py-3 text-left shadow-[var(--sc-shadow-button)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)] disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--sc-text-primary)] group-hover:text-[var(--sc-primary-dark)]">
                  <Download size={15} aria-hidden="true" />
                  {t('quickTemplate')}
                </span>
                <span className="text-xs leading-4 text-[var(--sc-text-secondary)]">
                  {t('quickTemplateDesc')}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => downloadTemplate(false, true)}
                className="group flex w-full flex-col items-start gap-1 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3.5 py-3 text-left shadow-[var(--sc-shadow-button)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)] disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--sc-text-primary)] group-hover:text-[var(--sc-primary-dark)]">
                  <Download size={15} aria-hidden="true" />
                  {t('detailedTemplateTitle')}
                </span>
                <span className="text-xs leading-4 text-[var(--sc-text-secondary)]">
                  {t('detailedTemplateDesc')}
                </span>
              </button>
            </div>
          </section>
          <details className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/35 px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-medium text-[var(--sc-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
              {t('importGuideTitle')}
            </summary>
            <div className="mt-3 space-y-2.5 border-t border-[var(--sc-border-default)] pt-3 text-xs leading-relaxed text-[var(--sc-text-secondary)]">
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sc-text-tertiary)]"
                  />
                  <span>
                    <strong className="font-semibold text-[var(--sc-text-primary)]">
                      {t('importGuideRowsLabel')}
                    </strong>{' '}
                    {t('importGuideRowsText')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sc-text-tertiary)]"
                  />
                  <span>
                    <strong className="font-semibold text-[var(--sc-text-primary)]">
                      {t('importGuidePriceLabel')}
                    </strong>{' '}
                    {t('importGuidePriceText')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sc-text-tertiary)]"
                  />
                  <span>
                    <strong className="font-semibold text-[var(--sc-text-primary)]">
                      {t('importGuideDetailedLabel')}
                    </strong>{' '}
                    {t('importGuideDetailedText')}
                  </span>
                </li>
              </ul>
              <a
                href="/catalog/skus"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--sc-primary-dark)] underline underline-offset-2 hover:text-[var(--sc-primary)]"
              >
                {t('importGuideSkuLink')}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
          </details>
          {result && (
            <>
              <Alert variant={result.rejected ? 'warning' : 'success'}>
                {result.ready === undefined
                  ? t('import_summary', {
                      accepted: result.items.filter(
                        (row) => row.status === 'ACCEPTED' && !row.existing,
                      ).length,
                      rejected: result.rejected,
                    })
                  : t('preview_summary', { ready: result.ready, rejected: result.rejected })}
                {result.items.some((row) => row.existing) && (
                  <>
                    {' '}
                    ·{' '}
                    {t('existing_summary', {
                      count: result.items.filter((row) => row.existing).length,
                    })}
                  </>
                )}
              </Alert>
              {result.ready !== undefined && <p className="text-sm">{t('preview_hint')}</p>}
              <DataTable
                dense
                ariaLabel={t('import_results')}
                data={result.items}
                getRowKey={(row) => row.row}
                columns={[
                  {
                    key: 'row',
                    label: t('row'),
                    render: (row) => row.excelRows?.join(', ') ?? row.row,
                  },
                  {
                    key: 'externalOrderCode',
                    label: t('order_code'),
                    render: (row) => row.externalOrderCode ?? t('automatic_code'),
                  },
                  {
                    key: 'status',
                    label: t('status'),
                    render: (row) =>
                      row.existing
                        ? t('existing_order')
                        : row.status === 'ACCEPTED'
                          ? t('accepted')
                          : row.status === 'READY'
                            ? t('ready')
                            : t('rejected'),
                  },
                  ...(hasExcelShipping
                    ? [
                        {
                          key: 'excelShipPolicy',
                          label: t('excelShipping.policyColumn'),
                          render: (row) => {
                            const policy = row.excelShipPolicy;
                            if (!policy) return '—';
                            return (
                              <div className="min-w-44 space-y-1.5">
                                <span className="inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--sc-text-primary)]">
                                  {t(`excelShipping.policy.${policy.mode}`)}
                                </span>
                                {policy.mode === 'CUSTOMER_FIXED' && (
                                  <p className="text-xs text-[var(--sc-text-secondary)]">
                                    {t('excelShipping.agreedFee', {
                                      amount: formatOrderMoney(policy.agreedFeeVnd),
                                    })}
                                  </p>
                                )}
                                {row.goodsDueVnd !== undefined && (
                                  <p className="text-xs tabular-nums text-[var(--sc-text-secondary)]">
                                    {t('excelShipping.goodsDue', {
                                      amount: formatOrderMoney(row.goodsDueVnd),
                                    })}
                                  </p>
                                )}
                                {row.finalOrderCodVnd !== undefined &&
                                  (row.finalOrderCodVnd === null ? (
                                    <span className="inline-flex w-fit items-center rounded-md border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/70 px-1.5 py-0.5 text-[11px] font-medium text-[var(--sc-warning-dark)]">
                                      {t('excelShipping.awaitingQuote')}
                                    </span>
                                  ) : (
                                    <p className="text-xs font-semibold tabular-nums text-[var(--sc-primary-dark)]">
                                      {t('excelShipping.totalDue', {
                                        amount: formatOrderMoney(row.finalOrderCodVnd),
                                      })}
                                    </p>
                                  ))}
                              </div>
                            );
                          },
                        } satisfies ColumnDef<ImportResult['items'][number]>,
                      ]
                    : []),
                  {
                    key: 'reference',
                    label: t('reference'),
                    render: (row) =>
                      row.orderId ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (row.orderId) openDetail(row.orderId);
                          }}
                        >
                          {t('view_order')}
                        </Button>
                      ) : row.status === 'READY' ? (
                        t('ready_hint')
                      ) : (
                        importRowFeedback(row, (key, values) =>
                          t.has(key) ? t(key, values) : t('items'),
                        )
                      ),
                  },
                ]}
              />
            </>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sc-border-default)] pt-4">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setModal(null)}>
              {tCommon('close')}
            </Button>
            {result?.ready !== undefined && result.ready > 0 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={busy}
                  disabled={!files.length}
                  onClick={() => importOrders(true)}
                >
                  {t('preview_import')}
                </Button>
                <Button type="button" isLoading={busy} onClick={() => importOrders()}>
                  {t('confirm_import', { count: result.ready })}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="primary"
                isLoading={busy}
                disabled={!files.length}
                onClick={() => importOrders(true)}
              >
                {t('preview_import')}
              </Button>
            )}
          </div>
        </div>
      </Modal>
      {reviewOrders && (
        <Modal isOpen title={tReview('title')} width="800px" onClose={() => setReviewOrders(null)}>
          <OrderDispatchReview
            scope={scope}
            orders={reviewOrders}
            onEstimates={(updates) =>
              setReviewEstimates((current) => {
                const next = { ...current };
                for (const [id, estimate] of Object.entries(updates)) {
                  if (estimate) next[id] = estimate;
                  else delete next[id];
                }
                return next;
              })
            }
            onAccepted={(ids) => {
              void refreshOrderFreightStatus([...new Set([...freightOrderIds, ...ids])], ids);
              setReviewSelection(
                (current) => new Set([...current].filter((id) => !ids.includes(id))),
              );
              void orders.reload();
              if (detailId && ids.includes(detailId)) openDetail(detailId);
            }}
          />
        </Modal>
      )}
      <Modal
        isOpen={modal === 'detail' && !reviewOrders}
        title={t('detail')}
        width="850px"
        onClose={() => {
          if (!busy) {
            setModal(null);
            setPackedConfirmedOrderId(null);
            setFocusedReview(null);
            void orders.reload();
          }
        }}
      >
        {busy && <p role="status">{t('loading')}</p>}
        {error && (
          <Alert variant="error">
            {error}
            <Button
              variant="ghost"
              onClick={() => {
                if (detailId) openDetail(detailId);
              }}
            >
              {t('retry')}
            </Button>
          </Alert>
        )}
        {detail && (
          <div className="space-y-5">
            <OrderDetail
              order={detail}
              freightRow={orderFreight.state.rowsByOrderId[detail.id]}
              freightLoading={
                orderFreight.state.statusLoading ||
                orderFreight.state.pendingOrderIds.has(detail.id)
              }
              canQuoteFreight={freightAccess.canQuoteFreight}
              onLookupFreight={() => handleOrderLookupRequest([detail.id])}
              headerAction={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => openDetail(detail.id)}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  {t('refresh')}
                </Button>
              }
              priorityActions={
                <>
                  {owner &&
                    detail.dispatchReviewState === 'AWAITING_INITIAL' &&
                    freightAccess.canQuoteFreight && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => setReviewOrders([detail])}
                      >
                        {tReview('title')}
                      </Button>
                    )}
                  {owner &&
                    !reviewOrders &&
                    modal === 'detail' &&
                    packedConfirmedOrderId === detail.id &&
                    detail.dispatchReviewState !== 'AWAITING_PACKED' && (
                      <Alert variant="success">{tReview('packedAccepted')}</Alert>
                    )}
                  {owner &&
                    !reviewOrders &&
                    modal === 'detail' &&
                    (detail.dispatchReviewState === 'AWAITING_PACKED' ||
                      detail.id === focusedReview?.orderId) && (
                      <PackedOrderDispatchReview
                        key={detail.id}
                        scope={scope}
                        orderId={detail.id}
                        initialParcelId={
                          detail.id === focusedReview?.orderId ? focusedReview.parcelId : null
                        }
                        onChanged={() => {
                          setPackedConfirmedOrderId(detail.id);
                          void refreshOrderFreightStatus(freightOrderIds, [detail.id]);
                          openDetail(detail.id);
                          void orders.reload();
                        }}
                      />
                    )}
                  <OrderLifecycleActions
                    key={`OrderLifecycleActions:${detail.id}`}
                    order={detail}
                    onChanged={() => {
                      openDetail(detail.id);
                      void orders.reload();
                    }}
                  />
                  <OrderPolicyActions
                    key={`OrderPolicyActions:${detail.id}`}
                    order={detail}
                    onChanged={() => {
                      openDetail(detail.id);
                      void orders.reload();
                    }}
                  />
                </>
              }
            />
            <OrderCancellationActions
              key={`OrderCancellationActions:${detail.id}`}
              order={detail}
              orderCode={detail.externalOrderCode}
              onChanged={() => {
                openDetail(detail.id);
                void orders.reload();
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
