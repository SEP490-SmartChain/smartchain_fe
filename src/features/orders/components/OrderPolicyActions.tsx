import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { orderPolicyApi } from '../api/orderPolicyApi';
import { formatOrderMoney } from '../lib/orderPresentation';

import type { SellerOrderDetail } from '../api/ordersApi';

export function OrderPolicyActions({
  order,
  onChanged,
}: {
  order: SellerOrderDetail;
  onChanged: () => void;
}) {
  const t = useTranslations('OrderPolicy');
  const { can } = useAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  const orderHold = order.status === 'ON_HOLD' && order.holdReason === 'HOLD_RISKY_COD';
  const parcelHolds = order.fulfillmentOrders.flatMap(({ sequenceNo, autoCod }) =>
    autoCod?.approvalShipmentId && autoCod.finalCodVnd !== null
      ? [{ sequenceNo, shipmentId: autoCod.approvalShipmentId, amount: autoCod.finalCodVnd }]
      : [],
  );
  if (!can('orders.policy.manage') || (!orderHold && !parcelHolds.length)) return null;

  async function confirm(shipmentId?: string) {
    if (running.current) return;
    const signal = abort.current.signal;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await orderPolicyApi.transition(order.id, 'confirm-hold', order.version, signal, shipmentId);
      if (!signal.aborted) onChanged();
    } catch {
      if (!signal.aborted) setError(t('writeError'));
    } finally {
      running.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="space-y-2.5 rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/45 p-4"
      aria-label={t(orderHold ? 'actions' : 'parcelActions')}
    >
      <h4 className="text-sm font-semibold text-[var(--sc-warning-dark)]">
        {t(orderHold ? 'actions' : 'parcelActions')}
      </h4>
      {!orderHold && (
        <p className="text-xs leading-relaxed text-[var(--sc-text-secondary)]">
          {t('parcelActionsHint')}
        </p>
      )}
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onChanged}>
            {t('reload')}
          </Button>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {orderHold ? (
          <Button disabled={busy} onClick={() => void confirm()}>
            {t('confirmHold')}
          </Button>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {parcelHolds.map(({ sequenceNo, shipmentId, amount }) => (
              <li key={shipmentId}>
                <Button size="sm" disabled={busy} onClick={() => void confirm(shipmentId)}>
                  {t('confirmParcelHold', { number: sequenceNo, cod: formatOrderMoney(amount) })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
