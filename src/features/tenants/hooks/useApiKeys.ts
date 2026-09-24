import { useCallback, useEffect, useRef, useState } from 'react';

import { apiKeyApi } from '../api/apiKeyApi';

import type { ApiKey } from '../types/apiKey.types';

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
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
      const page = await apiKeyApi.list(cursor);
      if (revision !== requestRevision.current) return;
      setApiKeys((current) => (shouldAppend ? [...current, ...page.items] : page.items));
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
    apiKeys,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(nextCursor ?? undefined, true),
  };
}
