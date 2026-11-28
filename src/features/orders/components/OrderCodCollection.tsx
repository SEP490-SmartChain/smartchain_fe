import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { orderCollectionTotal, type AutoCodView, type SellerOrder } from '../api/ordersApi';
import { formatOrderMoney } from '../lib/orderPresentation';

export function OrderCollectionTotal({ order }: { order: SellerOrder }) {
  return (
    <div className="inline-flex flex-col items-end font-semibold tabular-nums text-[var(--sc-text-primary)]">
      {order.autoCod ? (
        <OrderCodCollection cod={order.autoCod} align="right" />
      ) : order.codAmount === undefined ? (
        '—'
      ) : (
        <span className="whitespace-nowrap">
          {formatOrderMoney(
            orderCollectionTotal({
              codAmount: order.codAmount,
              customerShippingFee: order.customerShippingFee ?? '0',
              shippingFeePayer: order.shippingFeePayer ?? 'SENDER',
            }),
          )}
        </span>
      )}
    </div>
  );
}

export function OrderCollectionAmount({
  order,
  field,
}: {
  order: SellerOrder;
  field: 'goods' | 'shipping';
}) {
  const t = useTranslations('Orders.collectionList');
  if (
    order.codAmount === undefined ||
    order.collectionMode === 'DIRECT' ||
    order.kind === 'WITHDRAWAL'
  ) {
    return <span aria-label={t('breakdownUnavailable')}>—</span>;
  }

  const goods = order.autoCod?.goodsDueVnd ?? order.codAmount;
  if (field === 'goods') {
    return <span className="whitespace-nowrap tabular-nums">{formatOrderMoney(goods)}</span>;
  }

  let shipping: string | null =
    order.shippingFeePayer === 'RECIPIENT' ? (order.customerShippingFee ?? '0') : '0';
  if (order.autoCod) {
    const { finalOrderCodVnd } = order.autoCod;
    shipping =
      finalOrderCodVnd === null ? null : (BigInt(finalOrderCodVnd) - BigInt(goods)).toString();
  }

  return shipping === null ? (
    <span className="whitespace-nowrap text-xs font-medium text-[var(--sc-warning-dark)]">
      {t('shippingPending')}
    </span>
  ) : (
    <span className="whitespace-nowrap tabular-nums">{formatOrderMoney(shipping)}</span>
  );
}

export function OrderCodCollection({
  cod,
  variant = 'table',
  align = 'left',
}: {
  cod: AutoCodView;
  variant?: 'table' | 'summary';
  align?: 'left' | 'right';
}) {
  const t = useTranslations('Orders.excelShipping');
  const tList = useTranslations('Orders.collectionList');
  const alignClass = align === 'right' ? 'items-end' : 'items-start';

  if (cod.finalOrderCodVnd !== null) {
    return (
      <span className={cn('inline-flex flex-col', alignClass)}>
        <span className="whitespace-nowrap">{formatOrderMoney(cod.finalOrderCodVnd)}</span>
      </span>
    );
  }
  const partial =
    cod.state === 'PARTIAL'
      ? t('partialSummary', {
          amount: formatOrderMoney(cod.fixedCodSubtotalVnd),
          count: cod.fixedParcelCount,
          total: cod.parcelCount ?? '—',
        })
      : null;
  if (variant === 'table') {
    return (
      <span className={cn('inline-flex flex-col gap-0.5', alignClass)}>
        <span className="whitespace-nowrap text-xs font-medium text-[var(--sc-warning-dark)]">
          {tList('totalPending')}
        </span>
        {partial && (
          <span className="text-xs font-medium text-[var(--sc-text-secondary)]">{partial}</span>
        )}
      </span>
    );
  }
  if (partial) {
    return (
      <span className={cn('inline-flex flex-col', alignClass)}>
        <span className="inline-flex items-center gap-1.5 text-lg leading-snug font-semibold text-[var(--sc-text-primary)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sc-info)]"
          />
          {partial}
        </span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex flex-col', alignClass)}>
      <span className="text-lg leading-snug font-bold text-[var(--sc-text-primary)]">
        {t('pendingTotal', { amount: formatOrderMoney(cod.goodsDueVnd) })}
      </span>
      <span className="mt-0.5 whitespace-nowrap text-xs font-medium text-[var(--sc-warning-dark)]">
        {t('pendingShipping')}
      </span>
    </span>
  );
}
