import { useCallback, useEffect, useState } from 'react';

import { inventoryReservationApi } from '../api/inventoryReservationApi';

import type { ReservationSummary } from '../types/inventoryReservation.types';

export function useReservationSummary() {
  const [summary, setSummary] = useState<ReservationSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSummary(await inventoryReservationApi.getSummary());
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
