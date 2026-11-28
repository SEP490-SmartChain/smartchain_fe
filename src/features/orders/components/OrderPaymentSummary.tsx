import { useTranslations } from 'next-intl';

import { OrderCodCollection } from './OrderCodCollection';
import { orderCollectionTotal, type SellerOrder } from '../api/ordersApi';
import { formatOrderMoney } from '../lib/orderPresentation';

interface OrderPaymentSummaryProps {
  payment: Pick<
    SellerOrder,
    | 'codAmount'
    | 'customerShippingFee'
    | 'shippingFeePayer'
    | 'totalAmount'
    | 'paymentBreakdown'
    | 'collectionMode'
    | 'excelShipPolicy'
    | 'autoCod'
  >;
  isSnapshot?: boolean;
}
export function OrderPaymentSummary({ payment, isSnapshot = false }: OrderPaymentSummaryProps) {
  const t = useTranslations('Orders');
  if (payment.codAmount === undefined || payment.totalAmount === undefined) return null;
  const shipping =
    payment.shippingFeePayer === 'RECIPIENT' ? (payment.customerShippingFee ?? '0') : '0';
  const total = orderCollectionTotal({
    codAmount: payment.codAmount,
    customerShippingFee: shipping,
    shippingFeePayer: payment.shippingFeePayer ?? 'SENDER',
  });
  const p = payment.paymentBreakdown;
  const direct = payment.collectionMode === 'DIRECT';
  const autoCod = payment.autoCod;
  const policy = payment.excelShipPolicy;
  const row = (label: string, amount: string) => (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--sc-text-secondary)]">{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{formatOrderMoney(amount)}</dd>
    </div>
  );
  return (
    <section
      aria-label={t('paymentOverview')}
      className="min-w-0 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/65 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.03em] text-[var(--sc-text-secondary)]">
        {t('collectionShort')}
      </p>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-[var(--sc-text-primary)]">
        {autoCod ? <OrderCodCollection cod={autoCod} variant="summary" /> : formatOrderMoney(total)}
      </div>
      {policy && (
        <p className="mt-2.5 inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
          {t(`excelShipping.policy.${policy.mode}`)}
        </p>
      )}
      {isSnapshot && (
        <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
          {t(autoCod ? 'excelShipping.collectionHint' : 'intakeSnapshot')}
        </p>
      )}
      {(autoCod || total !== '0') && !direct && (
        <dl className="mt-3 space-y-2 text-sm">
          {row(t('goodsDueShort'), payment.codAmount)}
          {!autoCod && row(t('shippingDueShort'), shipping)}
        </dl>
      )}
      {!autoCod && total === '0' && <p className="mt-3 text-sm">{t('noCollection')}</p>}
      {!direct && (
        <details className="mt-4 border-t border-[var(--sc-border-default)] pt-3 text-sm">
          <summary className="rounded font-medium focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
            {t('paymentDetails')}
          </summary>
          <dl className="mt-3 space-y-2">
            {row(t('goods_total'), payment.totalAmount)}
            {p && (
              <>
                {BigInt(p.discountAmount) > BigInt(0) && row(t('discountShort'), p.discountAmount)}
                {BigInt(p.discountAmount) > BigInt(0) &&
                  row(
                    t('net_goods'),
                    (BigInt(payment.totalAmount) - BigInt(p.discountAmount)).toString(),
                  )}
                {row(t('goodsPaidShort'), p.goodsPaidAmount)}
                {payment.shippingFeePayer === 'RECIPIENT' && p.shippingChargeAmount !== null && (
                  <>
                    {row(t('shippingChargeShort'), p.shippingChargeAmount)}
                    {!policy && row(t('shippingPaidShort'), p.shippingPaidAmount)}
                  </>
                )}
              </>
            )}
          </dl>
          <p className="mt-3 text-xs text-[var(--sc-text-secondary)]">
            {p ? t('declared_payment_hint') : t('legacy_payment_hint')}
          </p>
        </details>
      )}
      {direct && (
        <details className="mt-3 text-sm">
          <summary className="rounded font-medium focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
            {t('collectionExplanation')}
          </summary>
          <p className="mt-2 text-[var(--sc-text-secondary)]">{t('directCollectionSnapshot')}</p>
          <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">{t('freightSeparateHint')}</p>
        </details>
      )}
    </section>
  );
}
