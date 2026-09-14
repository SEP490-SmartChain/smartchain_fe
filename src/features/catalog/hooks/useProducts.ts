import { useCallback, useEffect, useRef, useState } from 'react';

import { productApi } from '../api/productApi';

import type { Product, ProductFilters } from '../types/product.types';

export function useProducts(filters: ProductFilters) {
  const [products, setProducts] = useState<Product[]>([]);
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
        const page = await productApi.list(filters, cursor);
        if (revision !== requestRevision.current) return;
        setProducts((current) => (shouldAppend ? [...current, ...page.items] : page.items));
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
    products,
    error,
    isLoading,
    isLoadingMore,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(nextCursor ?? undefined, true),
  };
}
