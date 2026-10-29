import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { orderPolicyApi } from '../api/orderPolicyApi';

import type { SellerOrderDetail } from '../api/ordersApi';
export function OrderPolicyActions({
  order,
  onChanged,
}: {
  order: SellerOrderDetail;
  onChanged: () => void;
}) {
  const t = useTranslations('OrderPolicy'),
    { can } = useAccess(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    running = useRef(false),
    abort = useRef(new AbortController());
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  if (
    !can('orders.policy.manage') ||
    order.status !== 'ON_HOLD' ||
    order.holdReason !== 'HOLD_RISKY_COD'
  ) {
    return null;
  }
  async function confirm() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await orderPolicyApi.transition(
        order.id,
        'confirm-hold',
        order.version,
        abort.current.signal,
      );
      if (!abort.current.signal.aborted) onChanged();
    } catch {
      if (!abort.current.signal.aborted) setError(t('writeError'));
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
      aria-label={t('actions')}
    >
      <h4 className="font-semibold">{t('actions')}</h4>
      {error && <Alert variant="error">{error}</Alert>}
      <Button disabled={busy} onClick={() => void confirm()}>
        {t('confirmHold')}
      </Button>
      <Button variant="outline" disabled={busy} onClick={onChanged}>
        {t('reload')}
      </Button>
    </section>
  );
}
