import { useEffect, type Dispatch, type SetStateAction } from 'react';

import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/stores/authStore';

import { ordersApi, type SellerOrderDetail } from '../api/ordersApi';
import { orderScope, sellerOrderAccess } from '../lib/orderScope';

interface OrderDetailRefreshOptions {
  scope: string;
  owner: boolean;
  detail: SellerOrderDetail | null;
  active: boolean;
  realtimeConnected?: boolean;
  setDetail: Dispatch<SetStateAction<SellerOrderDetail | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export function useOrderDetailRefresh({
  scope,
  owner,
  detail,
  active,
  realtimeConnected = false,
  setDetail,
  setError,
}: OrderDetailRefreshOptions) {
  const t = useTranslations('Orders');
  const id = detail?.id;
  const status = detail?.status;
  const holdReason = detail?.holdReason;
  const autoCod = detail?.autoCod;
  const waitingForQuote =
    detail !== null &&
    autoCod !== undefined &&
    ['ALLOCATED', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED'].includes(status ?? '') &&
    (autoCod.state !== 'FINAL' ||
      detail.fulfillmentOrders.some(({ shipments }) =>
        shipments.some(
          ({ direction, active, bookingState }) =>
            direction === 'OUTBOUND' &&
            active &&
            ['INTENT', 'REQUESTED', 'UNKNOWN'].includes(bookingState),
        ),
      ));
  const waitingForIntake =
    !realtimeConnected &&
    (['RECEIVED', 'NORMALIZING', 'VALIDATED', 'ALLOCATING'].includes(status ?? '') ||
      holdReason === 'CANCEL_PENDING');
  const delay = waitingForIntake ? 3000 : waitingForQuote ? 15000 : null;
  useEffect(() => {
    if (!active || !id || delay === null) return;
    const refreshDelayMs = delay;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const current = () =>
      !controller.signal.aborted && orderScope() === scope && sellerOrderAccess().read;
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope || !sellerOrderAccess().read) controller.abort();
    });
    async function refresh() {
      if (!current() || !id) return;
      try {
        const response = await ordersApi.detail(id, owner, controller.signal);
        if (!current()) return;
        setDetail((previous) =>
          previous?.id === id && response.version >= previous.version ? response : previous,
        );
        timer = setTimeout(() => void refresh(), refreshDelayMs);
      } catch {
        if (current()) setError(t('response_error'));
      }
    }
    timer = setTimeout(() => void refresh(), refreshDelayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
      unsubscribe();
    };
  }, [active, delay, id, owner, scope, setDetail, setError, t]);
}
