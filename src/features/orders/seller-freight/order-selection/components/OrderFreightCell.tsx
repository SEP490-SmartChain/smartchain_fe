import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common';

import { formatFreightVnd } from '../../lookup/components/FreightTierCards';
import type { DispatchFreightEstimate, OrderFreightRow, ParcelFreight } from '../../shared';

type ReviewFreight = Extract<ParcelFreight, { state: 'REVIEW_REQUIRED' }>;
type Parcel = Extract<OrderFreightRow, { state: 'VISIBLE' }>['parcels'][number];

export function OrderShippingAmounts({
  customer,
  shop,
}: {
  customer: ReactNode;
  shop?: ReactNode;
}) {
  const t = useTranslations('Orders.collectionList');
  return (
    <dl className="m-0 space-y-1 text-right">
      <div className="flex flex-wrap items-baseline justify-end gap-x-2">
        <dt className="text-xs text-[var(--sc-text-secondary)]">{t('customerShipping')}</dt>
        <dd className="m-0">{customer}</dd>
      </div>
      {shop && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-2">
          <dt className="text-xs text-[var(--sc-text-secondary)]">{t('shopFreight')}</dt>
          <dd className="m-0">{shop}</dd>
        </div>
      )}
    </dl>
  );
}

export function ReviewFreightPrice({ freight }: { freight: ReviewFreight }) {
  const t = useTranslations('Orders.collectionList');
  return (
    <span className="tabular-nums">
      {t('approvedPrice', { amount: formatFreightVnd(freight.previousAmountVnd) })}
      {freight.reason === 'PRICE_CHANGED' && freight.newAmountVnd !== null && (
        <> → {t('newPrice', { amount: formatFreightVnd(freight.newAmountVnd) })}</>
      )}
    </span>
  );
}

export function validDispatchEstimate(
  estimate: DispatchFreightEstimate | undefined,
  row: OrderFreightRow | undefined,
  now = Date.now(),
): boolean {
  return (
    !!estimate &&
    row?.state === 'VISIBLE' &&
    row.sourceRevision === estimate.sourceRevision &&
    Date.parse(estimate.expiresAt) > now &&
    row.parcels.length > 0 &&
    row.parcels.every(({ freight }) =>
      ['ESTIMATED', 'NOT_QUOTED', 'NEEDS_INPUT', 'UNAVAILABLE'].includes(freight.state),
    )
  );
}

export function OrderFreightCell({
  parcels,
  loading,
  canQuote,
  onQuickLookup,
  onReviewParcel,
  estimateAmountVnd,
}: {
  readonly parcels?: readonly Parcel[];
  readonly loading: boolean;
  readonly canQuote?: boolean;
  readonly onQuickLookup?: () => void;
  readonly estimateAmountVnd?: string;
  readonly onReviewParcel?: (parcelId: string) => void;
}) {
  const t = useTranslations('Orders.collectionList');
  if (estimateAmountVnd !== undefined) {
    return (
      <span className="text-xs tabular-nums">
        {formatFreightVnd(estimateAmountVnd)} · {t('freightStates.ESTIMATED')}
      </span>
    );
  }
  if (!parcels?.length) {
    return <span className="text-xs">{loading ? t('freightLoading') : '—'}</span>;
  }

  const groups = new Map<ParcelFreight['state'], { count: number; amount: bigint | null }>();
  for (const { freight } of parcels) {
    const group = groups.get(freight.state) ?? { count: 0, amount: null };
    group.count++;
    if ('amountVnd' in freight)
      group.amount = (group.amount ?? BigInt(0)) + BigInt(freight.amountVnd);
    groups.set(freight.state, group);
  }
  const canLookup =
    groups.has('NOT_QUOTED') ||
    groups.has('NEEDS_INPUT') ||
    groups.has('UNAVAILABLE') ||
    groups.has('ESTIMATED');
  const reviewCount = groups.get('REVIEW_REQUIRED')?.count ?? 0;

  return (
    <div className="flex flex-col items-end gap-1 text-xs text-[var(--sc-text-secondary)]">
      {[...groups].map(([state, group]) => {
        if (state === 'REVIEW_REQUIRED') return null;
        return (
          <span key={state}>
            {group.amount !== null && (
              <strong className="whitespace-nowrap font-semibold tabular-nums text-[var(--sc-text-primary)]">
                {formatFreightVnd(group.amount.toString())} ·{' '}
              </strong>
            )}
            {t('freightStates.' + state)}
            {group.count < parcels.length && (
              <> · {t('parcelCount', { count: group.count, total: parcels.length })}</>
            )}
          </span>
        );
      })}
      {reviewCount > 0 && parcels.length > 1 && (
        <span>{t('reviewCount', { count: reviewCount })}</span>
      )}
      {parcels.map(({ freight, fulfillmentOrderId, parcelNumber }, index) => {
        if (freight.state !== 'REVIEW_REQUIRED') return null;
        const action = t(freight.reason === 'PRICE_CHANGED' ? 'reviewPrice' : 'chooseService');
        return (
          <span
            key={fulfillmentOrderId ?? index}
            className="flex flex-wrap items-baseline justify-end gap-x-1"
          >
            {parcels.length > 1 && parcelNumber !== undefined && (
              <span>{t('parcelNumber', { number: parcelNumber })} · </span>
            )}
            <ReviewFreightPrice freight={freight} />
            {freight.reason === 'SERVICE_UNAVAILABLE' && <span>{t('serviceUnavailable')}</span>}
            {freight.canChoose && onReviewParcel && fulfillmentOrderId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-1 py-0 text-xs"
                aria-label={
                  parcelNumber !== undefined
                    ? t('reviewParcelAction', { action, number: parcelNumber })
                    : action
                }
                onClick={() => onReviewParcel(fulfillmentOrderId)}
              >
                {action}
              </Button>
            ) : (
              <span>{freight.canChoose ? action : t('awaitingOffer')}</span>
            )}
          </span>
        );
      })}
      {canQuote && onQuickLookup && canLookup && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-2.5 text-xs"
          isLoading={loading}
          onClick={onQuickLookup}
        >
          {t(groups.has('NEEDS_INPUT') ? 'enterAndQuote' : 'quote')}
        </Button>
      )}
    </div>
  );
}
