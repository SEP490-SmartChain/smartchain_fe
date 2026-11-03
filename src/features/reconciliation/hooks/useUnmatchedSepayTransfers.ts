import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { sepayReconciliationApi } from '../api/sepayReconciliationApi';

import type { UnmatchedSepayTransfer } from '../types/sepayReconciliation.types';

/** Pages the Accountant's UNMATCHED SePay queue; an identity/scope change discards data and pending reads. */
export function useUnmatchedSepayTransfers() {
  const authRevision = useAuthStore((state) => state.revision);
  const [transfers, setTransfers] = useState<UnmatchedSepayTransfer[]>([]);
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
      const page = await sepayReconciliationApi.unmatched(cursor, abort.signal);
      if (revision !== requestRevision.current) return;
      setTransfers((current) => (shouldAppend ? [...current, ...page.items] : page.items));
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
    setTransfers([]);
    setNextCursor(null);
    void loadPage(null, false);
    return () => {
      requestRevision.current += 1;
      controller.current?.abort();
    };
  }, [authRevision, loadPage]);

  return {
    transfers,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(null, false),
    loadMore: () => loadPage(nextCursor, true),
  };
}
