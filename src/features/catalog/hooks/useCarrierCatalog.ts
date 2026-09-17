import { useCallback, useEffect, useState } from 'react';

import { toast } from 'sonner';

import { carrierCatalogApi } from '../api/carrierCatalogApi';
import type {
  CarrierDetail,
  CarrierListQuery,
  CarrierSummary,
} from '../types/carrierCatalog.types';

export function useCarrierCatalog(initialQuery: CarrierListQuery = {}) {
  const [query, setQuery] = useState<CarrierListQuery>(initialQuery);
  const [carriers, setCarriers] = useState<CarrierSummary[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchCarriers = useCallback(
    async (q: CarrierListQuery = query) => {
      setIsLoading(true);
      setError(null);
      try {
        const pageData = await carrierCatalogApi.list(q);
        const items = Array.isArray(pageData)
          ? pageData
          : (pageData as unknown as { items?: CarrierSummary[] })?.items ?? [];
        const pagination = (
          pageData as unknown as { pagination?: { hasNext?: boolean; nextCursor?: string | null } }
        )?.pagination;
        setCarriers(items);
        setHasNextPage(Boolean(pagination?.hasNext));
        setNextCursor(pagination?.nextCursor ?? null);
      } catch (err) {
        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        setCarriers([]);
        setHasNextPage(false);
        setNextCursor(null);
      } finally {
        setIsLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    fetchCarriers(query);
  }, [query, fetchCarriers]);

  const selectCarrier = useCallback(async (id: string) => {
    setIsLoadingDetail(true);
    try {
      const detail = await carrierCatalogApi.getDetail(id);
      setSelectedCarrier(detail);
    } catch {
      toast.error('Không thể tải chi tiết hãng vận chuyển');
      setSelectedCarrier(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  return {
    query,
    setQuery,
    carriers,
    selectedCarrier,
    setSelectedCarrier,
    selectCarrier,
    isLoading,
    isLoadingDetail,
    error,
    hasNextPage,
    nextCursor,
    refetch: () => fetchCarriers(query),
  };
}
