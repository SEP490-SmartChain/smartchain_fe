import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { carrierSettlementApi } from '../api/carrierSettlementApi';

import type { SettlementBatch } from '../types/carrierSettlement.types';

/** Accountant's settlement batches; an identity/scope change discards data and pending reads. */
export function useSettlementBatches() {
  const authRevision = useAuthStore((state) => state.revision);
  const [batches, setBatches] = useState<SettlementBatch[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const loadPage = useCallback(async (cursor: string | null, shouldAppend: boolean) => {
    const revision = ++requestRevision.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (shouldAppend) setIsLoadingMore(true);
    else setIsLoading(true);
    setError(null);
    try {
      const page = await carrierSettlementApi.list(cursor, abort.signal);
      if (revision !== requestRevision.current) return;
      setBatches((current) => (shouldAppend ? [...current, ...page.items] : page.items));
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
    setBatches([]);
    setNextCursor(null);
    void loadPage(null, false);
    return () => {
      requestRevision.current += 1;
      controller.current?.abort();
    };
  }, [authRevision, loadPage]);

  return {
    batches,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(null, false),
    loadMore: () => loadPage(nextCursor, true),
  };
}
