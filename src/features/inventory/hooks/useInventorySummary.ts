import { useCallback, useEffect, useState } from 'react';

import { inventoryStockApi } from '../api/inventoryStockApi';

import type { InventoryStockSummary } from '../types/inventoryStock.types';

export function useInventorySummary() {
  const [summary, setSummary] = useState<InventoryStockSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSummary(await inventoryStockApi.getSummary());
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { summary, error, isLoading, refetch: load };
}
