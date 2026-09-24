import { useCallback, useEffect, useRef, useState } from 'react';

import { inventoryStockApi } from '../api/inventoryStockApi';

import type { InventoryStockFilters, InventoryStockLevel } from '../types/inventoryStock.types';

export function useInventoryStocks(filters: InventoryStockFilters) {
  const [stockLevels, setStockLevels] = useState<InventoryStockLevel[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const loadPage = useCallback(
    async (cursor?: string, shouldAppend = false) => {
      const revision = ++requestRevision.current;
      if (shouldAppend) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);
      try {
        const page = await inventoryStockApi.list(filters, cursor);
        if (revision !== requestRevision.current) return;
        setStockLevels((current) => (shouldAppend ? [...current, ...page.items] : page.items));
        setNextCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (revision === requestRevision.current) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      } finally {
        if (revision === requestRevision.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  return {
    stockLevels,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(nextCursor ?? undefined, true),
  };
}
