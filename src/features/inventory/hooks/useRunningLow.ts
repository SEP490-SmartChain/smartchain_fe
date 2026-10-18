import { useCallback, useEffect, useState } from 'react';

import { inventoryStockApi } from '../api/inventoryStockApi';

import type { RunningLowItem } from '../types/inventoryStock.types';

export function useRunningLow() {
  const [items, setItems] = useState<RunningLowItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await inventoryStockApi.getRunningLow();
      setItems(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, error, isLoading, refetch: load };
}
