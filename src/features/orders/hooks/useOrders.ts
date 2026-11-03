import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { ordersApi, type OrderFilters, type SellerOrder } from '../api/ordersApi';
import { orderScope, sellerOrderAccess } from '../lib/orderScope';

export function useOrders(scope: string, filters: OrderFilters, owner: boolean) {
  const [items, setItems] = useState<SellerOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const request = useRef<{ controller: AbortController; revision: number } | null>(null);
  const load = useCallback(
    async (next?: string) => {
      if (orderScope() !== scope || !sellerOrderAccess().read) return;
      request.current?.controller.abort();
      const revision = (request.current?.revision ?? 0) + 1;
      const controller = new AbortController();
      request.current = { controller, revision };
      setLoading(true);
      setError(null);
      if (!next) {
        setItems([]);
        setCursor(null);
      }
      const current = () =>
        !controller.signal.aborted &&
        orderScope() === scope &&
        request.current?.revision === revision;
      try {
        const page = await ordersApi.list(filters, owner, controller.signal, next);
        if (current()) {
          setItems((previous) => (next ? [...previous, ...page.items] : page.items));
          setCursor(page.pagination.nextCursor);
        }
      } catch (failure) {
        if (current()) setError(failure);
      } finally {
        if (current()) setLoading(false);
      }
    },
    [filters, owner, scope],
  );
  useEffect(() => {
    void load();
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) request.current?.controller.abort();
    });
    return () => {
      unsubscribe();
      request.current?.controller.abort();
    };
  }, [load, scope]);
  return {
    items,
    loading,
    error,
    hasNext: cursor !== null,
    reload: () => load(),
    loadMore: () => load(cursor ?? undefined),
  };
}
