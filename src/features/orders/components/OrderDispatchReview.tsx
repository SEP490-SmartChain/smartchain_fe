import { useEffect, useRef, useState } from 'react';

import { Package, RefreshCw, Ruler, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Checkbox, Select } from '@/components/Common';
import { cn } from '@/lib/utils';

import { DispatchParcelMeasurements } from './DispatchParcelMeasurements';
import { dispatchReviewApi } from '../api/dispatchReviewApi';
import { formatOrderMoney } from '../lib/orderPresentation';
import { orderScope } from '../lib/orderScope';
import {
  selectedDispatchEstimate,
  type DispatchFreightEstimate,
  type DispatchReviewRow,
  type SelectedOrderOption,
} from '../seller-freight/shared/dispatchReview';
import { TIERS, type OrderLookupItem, type Tier } from '../seller-freight/shared/schema';

interface ReviewOrder {
  id: string;
  externalOrderCode: string;
}

interface OrderDispatchReviewProps {
  scope: string;
  orders: readonly ReviewOrder[];
  onAccepted: (ids: readonly string[]) => void;
  onEstimates: (updates: Readonly<Record<string, DispatchFreightEstimate | undefined>>) => void;
}

const REVIEW_REQUEST_SIZE = 10;
const CONFIRM_REQUEST_SIZE = 100;
const KNOWN_REASONS = new Set([
  'ORDER_NOT_ALLOCATED',
  'ORIGIN_UNAVAILABLE',
  'ORDER_DATA_INCOMPLETE',
  'ORDER_DATA_CHANGED',
  'ADDRESS_UNMAPPED',
  'ETA_UNAVAILABLE',
  'UNSERVICEABLE',
  'TEMPORARY',
  'RATE_LIMIT',
  'NO_QUOTE',
]);

function reasonMessageKey(reason: string): string {
  if (reason === 'NEEDS_PARCEL_INPUT') return 'dimensionsNeeded';
  return KNOWN_REASONS.has(reason) ? `reasons.${reason}` : 'unavailable';
}

export function OrderDispatchReview({
  scope,
  orders,
  onAccepted,
  onEstimates,
}: OrderDispatchReviewProps) {
  const t = useTranslations('OrderReview');
  const [tier, setTier] = useState<Tier>('ECONOMY');
  const [rows, setRows] = useState<DispatchReviewRow[]>([]);
  const [optionsByOrder, selectOptions] = useState<Record<string, string>>({});
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [measureOrder, setMeasureOrder] = useState<ReviewOrder | null>(null);
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<'quote' | 'confirm' | null>(null);
  const [error, setError] = useState<'quoteFailed' | 'confirmFailed' | null>(null);
  const assumptions = useRef(new Map<string, OrderLookupItem>());
  const request = useRef<AbortController | null>(null);
  const idempotency = useRef(new Map<string, string>());
  const scopeMatches = () => orderScope() === scope;
  useEffect(() => () => request.current?.abort(), []);
  const selected = rows.flatMap((row): SelectedOrderOption[] => {
    const optionRef = optionsByOrder[row.orderId];
    return optionRef &&
      !unchecked.has(row.orderId) &&
      !accepted.has(row.orderId) &&
      !rejected.has(row.orderId) &&
      row.state === 'QUOTED' &&
      row.options.some((option) => option.optionRef === optionRef)
      ? [{ orderId: row.orderId, optionRef }]
      : [];
  });

  function selectTier(nextTier: Tier) {
    if (active === 'confirm') return;
    request.current?.abort();
    setActive(null);
    onEstimates(Object.fromEntries(orders.map(({ id }) => [id, undefined])));
    setTier(nextTier);
    setRows([]);
    selectOptions({});
    setError(null);
  }

  async function quote(onlyOrderId?: string) {
    if ((request.current && !request.current.signal.aborted) || !scopeMatches()) return;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => !controller.signal.aborted && scopeMatches();
    setActive('quote');
    setError(null);
    if (onlyOrderId) {
      setRows((current) => current.filter(({ orderId }) => orderId !== onlyOrderId));
      setRejected((current) => new Set([...current].filter((id) => id !== onlyOrderId)));
    } else {
      setRows([]);
      selectOptions({});
      setRejected(new Set());
    }
    try {
      const requested = orders
        .filter(({ id }) => !accepted.has(id) && (!onlyOrderId || id === onlyOrderId))
        .map(({ id }) => assumptions.current.get(id) ?? { orderId: id });
      onEstimates(Object.fromEntries(requested.map(({ orderId }) => [orderId, undefined])));
      const results: DispatchReviewRow[] = [];
      for (let start = 0; start < requested.length; start += REVIEW_REQUEST_SIZE) {
        if (!isCurrent()) return;
        const items = requested.slice(start, start + REVIEW_REQUEST_SIZE);
        results.push(
          ...(await dispatchReviewApi.suggest({ items, deliveryTier: tier }, controller.signal)),
        );
      }
      if (!isCurrent()) return;
      const byId = new Map(results.map((row) => [row.orderId, row]));
      const next = requested.map(
        ({ orderId }): DispatchReviewRow =>
          byId.get(orderId) ?? {
            orderId,
            state: 'UNAVAILABLE',
            reason: 'NO_QUOTE',
          },
      );
      setRows((current) => (onlyOrderId ? [...current, ...next] : next));
      onEstimates(
        Object.fromEntries(
          next.map((row) => [
            row.orderId,
            row.state === 'QUOTED' ? selectedDispatchEstimate(row, row.recommendedRef) : undefined,
          ]),
        ),
      );
      selectOptions((current) => ({
        ...current,
        ...Object.fromEntries(
          next.flatMap((row) =>
            row.state === 'QUOTED' &&
            row.options.some(({ optionRef }) => optionRef === row.recommendedRef)
              ? [[row.orderId, row.recommendedRef]]
              : [],
          ),
        ),
      }));
    } catch {
      if (isCurrent()) setError('quoteFailed');
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (isCurrent()) setActive(null);
      }
    }
  }

  async function confirm() {
    if (request.current || !scopeMatches() || selected.length === 0) return;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => !controller.signal.aborted && scopeMatches();
    setActive('confirm');
    setError(null);
    try {
      for (let start = 0; start < selected.length; start += CONFIRM_REQUEST_SIZE) {
        if (!isCurrent()) return;
        const items = selected.slice(start, start + CONFIRM_REQUEST_SIZE);
        const signature = JSON.stringify(items);
        const key = idempotency.current.get(signature) ?? crypto.randomUUID();
        idempotency.current.set(signature, key);
        const response = await dispatchReviewApi.confirm(items, key, controller.signal);
        if (!isCurrent()) return;
        const acceptedIds = new Set(
          response.filter((row) => row.state === 'ACCEPTED').map(({ orderId }) => orderId),
        );
        const completed = items
          .filter(({ orderId }) => acceptedIds.has(orderId))
          .map(({ orderId }) => orderId);
        const needsRefresh = items
          .filter(({ orderId }) => !acceptedIds.has(orderId))
          .map(({ orderId }) => orderId);
        setAccepted((current) => new Set([...current, ...completed]));
        setRejected((current) => new Set([...current, ...needsRefresh]));
        onEstimates(Object.fromEntries(items.map(({ orderId }) => [orderId, undefined])));
        if (completed.length > 0) onAccepted(completed);
      }
    } catch {
      if (isCurrent()) setError('confirmFailed');
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (isCurrent()) setActive(null);
      }
    }
  }

  if (measureOrder) {
    return (
      <DispatchParcelMeasurements
        scope={scope}
        order={measureOrder}
        initialAssumptions={assumptions.current.get(measureOrder.id)?.assumptions}
        onCancel={() => setMeasureOrder(null)}
        onSave={(item) => {
          assumptions.current.set(item.orderId, item);
          setMeasureOrder(null);
          void quote(item.orderId);
        }}
      />
    );
  }

  const pendingOrders = orders.filter(({ id }) => !accepted.has(id));
  const selectedTotalVnd = selected.reduce((sum, { orderId, optionRef }) => {
    const row = rows.find((item) => item.orderId === orderId);
    const option =
      row?.state === 'QUOTED' ? row.options.find((item) => item.optionRef === optionRef) : null;
    return option ? sum + BigInt(option.totalVnd) : sum;
  }, BigInt(0));

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2.5 sm:flex-1 sm:flex-row sm:items-end sm:gap-3">
            <div className="w-full sm:max-w-xs sm:flex-1">
              <Select
                label={t('tier')}
                value={tier}
                options={TIERS.map((value) => ({ value, label: t(value) }))}
                disabled={active === 'confirm'}
                onChange={(event) => selectTier(event.target.value as Tier)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              isLoading={active === 'quote'}
              disabled={active === 'confirm' || accepted.size === orders.length}
              onClick={() => void quote()}
            >
              <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
              {t('suggest')}
            </Button>
          </div>
          {rows.length > 0 && pendingOrders.length > 0 && (
            <div className="self-start sm:self-end sm:pb-1.5">
              <Badge
                status="info"
                size="sm"
                label={t('batchSummary', {
                  selected: selected.length,
                  total: pendingOrders.length,
                })}
              />
            </div>
          )}
        </div>
        {rows.length === 0 && active !== 'quote' && pendingOrders.length > 0 && (
          <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t('quotePrompt')}</p>
        )}
      </div>

      {error && <Alert variant="error">{t(error)}</Alert>}
      {accepted.size > 0 && (
        <Alert variant="success">{t('accepted', { count: accepted.size })}</Alert>
      )}

      <div className="space-y-2.5">
        {pendingOrders.map((order) => {
          const row = rows.find(({ orderId }) => orderId === order.id);
          const picked =
            row?.state === 'QUOTED'
              ? row.options.find(({ optionRef }) => optionRef === optionsByOrder[order.id])
              : undefined;
          const isIncluded = !unchecked.has(order.id);
          const needsMeasurements =
            row?.state === 'UNAVAILABLE' && row.reason === 'NEEDS_PARCEL_INPUT';
          return (
            <section
              key={order.id}
              className={cn(
                'space-y-3 rounded-xl border p-3.5 shadow-[var(--sc-shadow-section)] transition-colors',
                row?.state === 'QUOTED' && !isIncluded
                  ? 'border-[var(--sc-border-light)] bg-[var(--sc-bg-primary)] opacity-75'
                  : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {row?.state === 'QUOTED' && !rejected.has(order.id) && (
                    <Checkbox
                      aria-label={t('chooseOrder', { code: order.externalOrderCode })}
                      checked={isIncluded}
                      disabled={active !== null}
                      onChange={(event) => {
                        const include = event.target.checked;
                        setUnchecked((current) => {
                          const next = new Set(current);
                          if (include) next.delete(order.id);
                          else next.add(order.id);
                          return next;
                        });
                      }}
                    />
                  )}
                  <Package
                    size={15}
                    className="shrink-0 text-[var(--sc-text-tertiary)]"
                    aria-hidden="true"
                  />
                  <h3 className="m-0 min-w-0 break-words text-sm font-semibold leading-5 text-[var(--sc-text-primary)]">
                    {order.externalOrderCode}
                  </h3>
                </div>
                {picked && !rejected.has(order.id) && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-[var(--sc-primary-dark)]">
                      {formatOrderMoney(picked.totalVnd)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={active !== null}
                      onClick={() => setMeasureOrder(order)}
                    >
                      <Ruler size={13} className="mr-1" aria-hidden="true" />
                      {t('editDimensions')}
                    </Button>
                  </div>
                )}
              </div>

              {rejected.has(order.id) ? (
                <Alert variant="warning">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t('stale')}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={active !== null}
                      onClick={() => void quote(order.id)}
                    >
                      {t('retryOrder')}
                    </Button>
                  </div>
                </Alert>
              ) : row?.state === 'UNAVAILABLE' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--sc-bg-primary)] px-3 py-2 text-sm text-[var(--sc-text-secondary)]">
                  <p className="m-0">{t(reasonMessageKey(row.reason))}</p>
                  {needsMeasurements && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={active !== null}
                      onClick={() => setMeasureOrder(order)}
                    >
                      <Ruler size={13} className="mr-1" aria-hidden="true" />
                      {t('enterDimensions')}
                    </Button>
                  )}
                </div>
              ) : (
                row?.state === 'QUOTED' && (
                  <div className="space-y-2.5">
                    <Select
                      label={t('service')}
                      value={picked?.optionRef ?? ''}
                      disabled={active !== null}
                      options={row.options.map(({ optionRef, parcels, totalVnd }) => ({
                        value: optionRef,
                        label: `${parcels.map(({ carrierName, serviceName }) => `${carrierName} · ${serviceName}`).join(' / ')} · ${formatOrderMoney(totalVnd)}`,
                      }))}
                      onChange={(event) => {
                        const optionRef = event.target.value;
                        selectOptions((current) => ({ ...current, [order.id]: optionRef }));
                        onEstimates({ [order.id]: selectedDispatchEstimate(row, optionRef) });
                      }}
                    />
                    {picked && (
                      <ul className="m-0 list-none space-y-1.5 rounded-lg bg-[var(--sc-bg-primary)] px-3 py-2 p-0 text-xs text-[var(--sc-text-secondary)]">
                        {picked.parcels.map(
                          ({ parcelRef, carrierName, serviceName, amountVnd }, index) => (
                            <li
                              key={parcelRef}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Truck size={12} aria-hidden="true" />
                                {t('parcel', { number: index + 1 })} · {carrierName} · {serviceName}
                              </span>
                              <span className="font-semibold tabular-nums text-[var(--sc-text-primary)]">
                                {formatOrderMoney(amountVnd)}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )
              )}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] pt-3.5">
        <div className="min-w-0">
          {selected.length > 0 && (
            <div className="space-y-0.5">
              <span className="block text-xs text-[var(--sc-text-secondary)]">
                {t('batchTotalLabel', { count: selected.length })}
              </span>
              <span className="block text-base font-bold tabular-nums text-[var(--sc-text-primary)]">
                {formatOrderMoney(selectedTotalVnd.toString())}
              </span>
            </div>
          )}
        </div>
        <Button
          type="button"
          disabled={active === 'quote' || selected.length === 0}
          isLoading={active === 'confirm'}
          onClick={() => void confirm()}
        >
          {t('confirmBatch', { count: selected.length })}
        </Button>
      </div>
    </div>
  );
}
