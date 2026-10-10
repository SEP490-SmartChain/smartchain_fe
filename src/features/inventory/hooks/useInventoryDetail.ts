import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import {
  inventoryDetailApi,
  type InventoryDetailFilters,
  type InventoryMovement,
  type InventoryPosition,
} from '../api/inventoryDetailApi';

export function useInventoryDetail(
  kind: 'positions' | 'ledger',
  filters: InventoryDetailFilters,
  enabled = true,
) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const scopeKey = JSON.stringify([
    user?.userId,
    user?.actorScope,
    user?.tenantId,
    user?.roles,
    token,
  ]);
  const [state, setState] = useState<{
    key: string;
    items: (InventoryPosition | InventoryMovement)[];
    next: string | null;
  }>({ key: '', items: [], next: null });
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const revision = useRef(0);
  const key = JSON.stringify([scopeKey, kind, filters]);
  const load = useCallback(
    async (cursor?: string) => {
      const current = ++revision.current;
      setIsLoading(true);
      setError(null);
      if (!cursor) setState({ key, items: [], next: null });
      try {
        const page = await inventoryDetailApi[kind](filters, cursor);
        if (current !== revision.current) return;
        setState((previous) => ({
          key,
          items: cursor && previous.key === key ? [...previous.items, ...page.items] : page.items,
          next: page.pagination.nextCursor,
        }));
      } catch (failure) {
        if (current === revision.current) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      } finally {
        if (current === revision.current) setIsLoading(false);
      }
    },
    [key, kind, filters],
  );
  const invalidate = useCallback(() => {
    revision.current++;
  }, []);
  useEffect(() => {
    if (enabled) void load();
    return invalidate;
  }, [load, invalidate, enabled]);
  const visible = state.key === key;
  return {
    items: visible && enabled ? state.items : [],
    error: visible && enabled ? error : null,
    isLoading: enabled && (isLoading || !visible),
    hasNext: visible && enabled && state.next !== null,
    refetch: () => load(),
    loadMore: () => load(state.next ?? undefined),
  };
}
