import { useCallback, useEffect, useRef, useState } from 'react';

import { inventoryStockApi } from '../api/inventoryStockApi';

import type { InventoryStockFilters, InventoryStockLevel } from '../types/inventoryStock.types';

export function useInventoryStocks(filters: InventoryStockFilters) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState<{
    key: string;
    items: InventoryStockLevel[];
    error: Error | null;
    loading: boolean;
    loadingMore: boolean;
    cursor: string | null;
  }>({ key: '', items: [], error: null, loading: true, loadingMore: false, cursor: null });
  const requestRevision = useRef(0);
  const loadPage = useCallback(
    async (cursor?: string) => {
      const revision = ++requestRevision.current;
      setState((old) => ({
        key,
        items: cursor && old.key === key ? old.items : [],
        error: null,
        loading: !cursor,
        loadingMore: Boolean(cursor),
        cursor: cursor ?? null,
      }));
      try {
        const page = await inventoryStockApi.list(filters, cursor);
        if (revision !== requestRevision.current) return;
        setState((old) => ({
          key,
          items: cursor && old.key === key ? [...old.items, ...page.items] : page.items,
          cursor: page.pagination.nextCursor,
          error: null,
          loading: false,
          loadingMore: false,
        }));
      } catch (failure) {
        if (revision === requestRevision.current) {
          setState((old) => ({
            ...old,
            error: failure instanceof Error ? failure : new Error(String(failure)),
            loading: false,
            loadingMore: false,
          }));
        }
      }
    },
    [filters, key],
  );
  const invalidate = useCallback(() => {
    requestRevision.current++;
  }, []);
  useEffect(() => {
    void loadPage();
    return invalidate;
  }, [loadPage, invalidate]);
  const visible = state.key === key;
  return {
    stockLevels: visible ? state.items : [],
    error: visible ? state.error : null,
    isLoading: !visible || state.loading,
    isLoadingMore: visible && state.loadingMore,
    hasNextPage: visible && state.cursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(state.cursor ?? undefined),
  };
}
