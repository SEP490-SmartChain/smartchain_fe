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
  setDetail: Dispatch<SetStateAction<SellerOrderDetail | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export function useOrderDetailRefresh({
  scope,
  owner,
  detail,
  active,
  setDetail,
  setError,
}: OrderDetailRefreshOptions) {
  const t = useTranslations('Orders');
  const id = detail?.id;
  const status = detail?.status;
  const holdReason = detail?.holdReason;
  useEffect(() => {
    if (
      !active ||
      !id ||
      !(
        ['RECEIVED', 'NORMALIZING', 'VALIDATED', 'ALLOCATING'].includes(status ?? '') ||
        holdReason === 'CANCEL_PENDING'
      )
    ) {
      return;
    }
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
        timer = setTimeout(() => void refresh(), 3000);
      } catch {
        if (current()) setError(t('response_error'));
      }
    }
    timer = setTimeout(() => void refresh(), 3000);
    return () => {
      clearTimeout(timer);
      controller.abort();
      unsubscribe();
    };
  }, [active, holdReason, id, owner, scope, setDetail, setError, status, t]);
}
