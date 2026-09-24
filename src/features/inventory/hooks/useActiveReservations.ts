import { useCallback, useEffect, useRef, useState } from 'react';

import { toClientDeadlineMs } from '@/lib/reservationTtl';

import { inventoryReservationApi } from '../api/inventoryReservationApi';

import type { ActiveReservationRow } from '../types/inventoryReservation.types';

export function useActiveReservations() {
  const [reservations, setReservations] = useState<ActiveReservationRow[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const loadPage = useCallback(async (cursor?: string, shouldAppend = false) => {
    const revision = ++requestRevision.current;
    if (shouldAppend) setIsLoadingMore(true);
    else setIsLoading(true);
    setError(null);
    try {
      const page = await inventoryReservationApi.list({}, cursor);
      if (revision !== requestRevision.current) return;
      const receivedAtMs = Date.now();
      const rows = page.items.map((item) => ({
        ...item,
        deadlineMs: toClientDeadlineMs(item.ttlRemainingSeconds, receivedAtMs),
      }));
      setReservations((current) => (shouldAppend ? [...current, ...rows] : rows));
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
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  return {
    reservations,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(nextCursor ?? undefined, true),
  };
}
