import { useEffect, useRef, useState } from 'react';

import { AlertTriangle, ArrowRight, Package, RefreshCw, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Select } from '@/components/Common';
import { useRealtimeSync } from '@/features/realtime-notifications';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services/apiClient';

import { dispatchReviewApi, type PackedDispatchReview } from '../api/dispatchReviewApi';
import { formatOrderMoney } from '../lib/orderPresentation';
import { orderScope } from '../lib/orderScope';

interface PackedOrderDispatchReviewProps {
  scope: string;
  orderId: string;
  initialParcelId: string | null;
  onChanged: () => void;
}

type ReviewParcel = PackedDispatchReview['parcels'][number];

function defaultOption(parcel: ReviewParcel) {
  return parcel.reason === 'PRICE_CHANGED' && parcel.options.length === 1
    ? parcel.options[0]
    : undefined;
}

function priceDelta(previousVnd: string | null, nextVnd: string): bigint | null {
  if (previousVnd === null) return null;
  return BigInt(nextVnd) - BigInt(previousVnd);
}

function formatDeltaBadge(
  delta: bigint,
  unchangedLabel: string,
): { status: 'success' | 'warning'; label: string } {
  if (delta === BigInt(0)) return { status: 'success', label: unchangedLabel };
  if (delta > BigInt(0)) {
    return { status: 'warning', label: `+${formatOrderMoney(delta.toString())}` };
  }
  return { status: 'success', label: `-${formatOrderMoney((-delta).toString())}` };
}

export function PackedOrderDispatchReview({
  scope,
  orderId,
  initialParcelId,
  onChanged,
}: PackedOrderDispatchReviewProps) {
  const t = useTranslations('OrderReview');
  const [review, setReview] = useState<PackedDispatchReview | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<'loadFailed' | 'confirmFailed' | 'stale' | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    const request = new AbortController();
    const isCurrent = () => !request.signal.aborted && orderScope() === scope;
    void dispatchReviewApi.packed(orderId, request.signal).then(
      (next) => {
        if (isCurrent()) {
          setError(null);
          setReview(next);
        }
      },
      () => {
        if (isCurrent()) {
          setError('loadFailed');
          setReview(null);
        }
      },
    );
    return () => request.abort();
  }, [scope, orderId, revision]);
  useEffect(() => () => mutation.current?.abort(), []);
  useRealtimeSync(['outbound.orders'], () => setRevision((value) => value + 1));

  async function confirm(parcel: ReviewParcel) {
    const optionRef = selected[parcel.reviewRef] ?? defaultOption(parcel)?.optionRef;
    if (mutation.current || !optionRef || orderScope() !== scope) return;
    if (
      !parcel.options.some((option) => option.optionRef === optionRef) ||
      Date.parse(parcel.expiresAt) <= Date.now()
    ) {
      setError('stale');
      setRevision((value) => value + 1);
      return;
    }
    const controller = new AbortController();
    mutation.current = controller;
    const isCurrent = () => !controller.signal.aborted && orderScope() === scope;
    setError(null);
    setConfirmed(false);
    setConfirming(parcel.reviewRef);
    try {
      await dispatchReviewApi.confirmPacked(
        orderId,
        { reviewRef: parcel.reviewRef, optionRef },
        controller.signal,
      );
      if (isCurrent()) {
        setConfirmed(true);
        setReview(
          (current) =>
            current && {
              ...current,
              parcels: current.parcels.filter(({ reviewRef }) => reviewRef !== parcel.reviewRef),
            },
        );
        setRevision((value) => value + 1);
        onChanged();
      }
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof ApiError && failure.status === 409 ? 'stale' : 'confirmFailed');
        setRevision((value) => value + 1);
      }
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (isCurrent()) setConfirming(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t(error)}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setRevision((value) => value + 1);
              }}
            >
              <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
              {t('refresh')}
            </Button>
          </div>
        </Alert>
      )}
      {confirmed && <Alert variant="success">{t('packedAccepted')}</Alert>}
      {!review && !error && (
        <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      )}
      {review &&
        initialParcelId &&
        !confirmed &&
        !review.parcels.some(
          ({ fulfillmentOrderId }) => fulfillmentOrderId === initialParcelId,
        ) && <Alert variant="info">{t('notificationResolved')}</Alert>}
      {review?.parcels.map((parcel) => {
        const currentOption =
          parcel.options.find(({ optionRef }) => optionRef === selected[parcel.reviewRef]) ??
          defaultOption(parcel);
        const isSinglePriceChanged = Boolean(defaultOption(parcel) && currentOption);
        const previousService = [parcel.previousCarrierName, parcel.previousServiceName]
          .filter(Boolean)
          .join(' · ');
        const delta = currentOption
          ? priceDelta(parcel.previousAmountVnd, currentOption.amountVnd)
          : null;
        const deltaBadge = delta !== null ? formatDeltaBadge(delta, t('priceUnchanged')) : null;
        const isFocusedTarget = parcel.fulfillmentOrderId === initialParcelId;
        return (
          <section
            key={parcel.reviewRef}
            tabIndex={isFocusedTarget ? -1 : undefined}
            ref={(element) => {
              if (element && !focused.current && isFocusedTarget) {
                focused.current = true;
                element.focus();
              }
            }}
            className={cn(
              'overflow-hidden rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]',
              isFocusedTarget && 'ring-2 ring-[var(--sc-primary-alpha-20)]',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/45 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]">
                  <AlertTriangle size={15} aria-hidden="true" />
                </span>
                <h3 className="m-0 text-sm font-semibold leading-5 text-[var(--sc-text-primary)]">
                  {t('parcel', { number: parcel.parcelNumber })}
                </h3>
              </div>
              <Badge status="warning" size="sm" label={t(parcel.reason)} />
            </div>

            <div className="space-y-3.5 p-4">
              <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">
                {t(
                  parcel.reason === 'PRICE_CHANGED' ? 'priceChangedHint' : 'serviceUnavailableHint',
                )}
              </p>

              {parcel.options.length === 0 ? (
                <div className="space-y-2.5">
                  {(previousService || parcel.previousAmountVnd !== null) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[var(--sc-bg-primary)] px-3 py-2 text-xs text-[var(--sc-text-secondary)]">
                      {previousService && (
                        <span>{t('previousService', { service: previousService })}</span>
                      )}
                      {parcel.previousAmountVnd !== null && (
                        <span className="tabular-nums">
                          {t('previousPrice', {
                            amount: formatOrderMoney(parcel.previousAmountVnd),
                          })}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] px-3.5 py-2.5">
                    <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
                      {t('noService')}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
                      {t('refresh')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {isSinglePriceChanged && currentOption ? (
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-3.5 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1">
                        <span className="block text-xs font-medium text-[var(--sc-text-secondary)]">
                          {t('previousPriceLabel')}
                        </span>
                        <span className="block text-base font-semibold tabular-nums text-[var(--sc-text-secondary)]">
                          {parcel.previousAmountVnd !== null
                            ? formatOrderMoney(parcel.previousAmountVnd)
                            : '—'}
                        </span>
                        {previousService && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--sc-text-tertiary)]">
                            <Package size={12} aria-hidden="true" />
                            {previousService}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1 border-t border-[var(--sc-border-default)] pt-3 sm:border-l sm:border-t-0 sm:pl-3.5 sm:pt-0">
                        <span className="block text-xs font-medium text-[var(--sc-text-secondary)]">
                          {t('newPriceLabel')}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold tabular-nums text-[var(--sc-text-primary)]">
                            {formatOrderMoney(currentOption.amountVnd)}
                          </span>
                          {deltaBadge && (
                            <Badge status={deltaBadge.status} size="sm" label={deltaBadge.label} />
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--sc-text-secondary)]">
                          <Truck size={12} aria-hidden="true" />
                          {currentOption.carrierName} · {currentOption.serviceName}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(previousService || parcel.previousAmountVnd !== null) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--sc-border-light)] bg-[var(--sc-bg-primary)] px-3 py-2 text-xs text-[var(--sc-text-secondary)]">
                          {previousService && (
                            <span>{t('previousService', { service: previousService })}</span>
                          )}
                          {parcel.previousAmountVnd !== null && (
                            <span className="font-medium tabular-nums">
                              {t('previousPrice', {
                                amount: formatOrderMoney(parcel.previousAmountVnd),
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      <Select
                        label={t('service')}
                        placeholder={t('chooseService')}
                        disabled={confirming !== null}
                        value={currentOption?.optionRef ?? ''}
                        options={parcel.options.map(
                          ({ optionRef, carrierName, serviceName, amountVnd }) => ({
                            value: optionRef,
                            label: `${carrierName} · ${serviceName} · ${formatOrderMoney(amountVnd)}`,
                          }),
                        )}
                        onChange={(event) => {
                          const optionRef = event.target.value;
                          setSelected((current) => ({ ...current, [parcel.reviewRef]: optionRef }));
                        }}
                      />
                      {currentOption && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] px-3.5 py-2.5 text-sm">
                          <span className="inline-flex items-center gap-1.5 text-[var(--sc-text-secondary)]">
                            <ArrowRight size={14} aria-hidden="true" />
                            {t('replacementPriceLabel')}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold tabular-nums text-[var(--sc-text-primary)]">
                              {formatOrderMoney(currentOption.amountVnd)}
                            </span>
                            {deltaBadge && (
                              <Badge
                                status={deltaBadge.status}
                                size="sm"
                                label={deltaBadge.label}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {currentOption && currentOption.codVnd !== null && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-primary-alpha-20)] bg-[var(--sc-primary-alpha-08)] px-3.5 py-2.5 text-sm">
                      <span className="font-medium text-[var(--sc-text-primary)]">
                        {t('codLabel')}
                      </span>
                      <span className="font-bold tabular-nums text-[var(--sc-primary-dark)]">
                        {formatOrderMoney(currentOption.codVnd)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-end border-t border-[var(--sc-border-light)] pt-3">
                    <Button
                      type="button"
                      size="sm"
                      isLoading={confirming === parcel.reviewRef}
                      disabled={!currentOption || confirming !== null}
                      onClick={() => void confirm(parcel)}
                    >
                      {t('confirmParcel')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
