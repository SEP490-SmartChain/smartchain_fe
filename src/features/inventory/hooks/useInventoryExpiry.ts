import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { inventoryExpiryApi, type NearExpiryPosition } from '../api/inventoryExpiryApi';

export function useInventoryExpiry(
  filters: { warehouseId: string; search: string },
  enabled: boolean,
) {
  const user = useAuthStore((s) => s.user),
    token = useAuthStore((s) => s.accessToken),
    scopeRevision = useAuthStore((s) => s.revision);
  const key = JSON.stringify([
    user?.userId,
    user?.actorScope,
    user?.tenantId,
    user?.roles,
    token,
    scopeRevision,
    filters,
  ]);
  const revision = useRef(0);
  const [state, setState] = useState<{
    key: string;
    items: NearExpiryPosition[];
    cursor: string | null;
    loading: boolean;
    loadingMore: boolean;
    error: Error | null;
  }>({ key: '', items: [], cursor: null, loading: true, loadingMore: false, error: null });
  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      const request = ++revision.current;
      setState((old) => ({
        key,
        items: cursor && old.key === key ? old.items : [],
        cursor: cursor ?? null,
        loading: !cursor,
        loadingMore: Boolean(cursor),
        error: null,
      }));
      try {
        const page = await inventoryExpiryApi.list(filters, cursor, signal);
        if (request !== revision.current) return;
        setState((old) => ({
          key,
          items: cursor && old.key === key ? [...old.items, ...page.items] : page.items,
          cursor: page.pagination.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (e) {
        if (!signal?.aborted && request === revision.current) {
          setState((old) => ({
            key,
            items: cursor && old.key === key ? old.items : [],
            cursor: cursor ?? null,
            loading: false,
            loadingMore: false,
            error: e instanceof Error ? e : new Error(String(e)),
          }));
        }
      }
    },
    [filters, key],
  );
  const invalidate = useCallback(() => {
    revision.current++;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) void load(undefined, controller.signal);
    return () => {
      controller.abort();
      invalidate();
    };
  }, [load, enabled, invalidate]);
  const visible = enabled && state.key === key;
  return {
    items: visible ? state.items : [],
    error: visible ? state.error : null,
    isLoading: enabled && (!visible || state.loading),
    isLoadingMore: visible && state.loadingMore,
    hasNext: visible && Boolean(state.cursor),
    refetch: () => load(),
    loadMore: () => load(state.cursor ?? undefined),
  };
}
