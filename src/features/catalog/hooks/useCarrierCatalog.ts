import { useCallback, useEffect, useState } from 'react';

import { toast } from 'sonner';

import { carrierCatalogApi } from '../api/carrierCatalogApi';
import { SAMPLE_CARRIER_DETAILS, SAMPLE_CARRIERS } from '../data/sampleCarriersData';
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
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchCarriers = useCallback(
    async (q: CarrierListQuery = query) => {
      setIsLoading(true);
      setError(null);
      try {
        const pageData = await carrierCatalogApi.list(q);
        if (pageData && Array.isArray(pageData.items) && pageData.items.length > 0) {
          setCarriers(pageData.items);
          setHasNextPage(Boolean(pageData.pagination?.hasNext));
          setNextCursor(pageData.pagination?.nextCursor ?? null);
          setIsFallbackData(false);
        } else {
          // Graceful fallback to sample carriers
          let filtered = [...SAMPLE_CARRIERS];
          if (q.search?.trim()) {
            const s = q.search.trim().toLowerCase();
            filtered = filtered.filter(
              (c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s),
            );
          }
          if (q.isActive !== undefined) {
            filtered = filtered.filter((c) => c.isActive === q.isActive);
          }
          setCarriers(filtered);
          setIsFallbackData(true);
        }
      } catch (err) {
        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        let filtered = [...SAMPLE_CARRIERS];
        if (q.search?.trim()) {
          const s = q.search.trim().toLowerCase();
          filtered = filtered.filter(
            (c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s),
          );
        }
        if (q.isActive !== undefined) {
          filtered = filtered.filter((c) => c.isActive === q.isActive);
        }
        setCarriers(filtered);
        setIsFallbackData(true);
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
      const sampleDetail = SAMPLE_CARRIER_DETAILS[id];
      if (sampleDetail) {
        setSelectedCarrier(sampleDetail);
      } else {
        const sampleSummary = SAMPLE_CARRIERS.find((c) => c.id === id || c.code === id);
        if (sampleSummary) {
          setSelectedCarrier({
            ...sampleSummary,
            endpoints: [
              {
                id: `ep-${sampleSummary.id}-prod`,
                carrierId: sampleSummary.id,
                environment: 'PRODUCTION',
                baseUrl: `https://api.${sampleSummary.code.toLowerCase()}.vn/v1`,
                apiVersion: 'v1.2',
                isActive: true,
                createdAt: sampleSummary.createdAt,
                updatedAt: sampleSummary.updatedAt,
              },
            ],
            services: [
              {
                id: `srv-${sampleSummary.id}-std`,
                carrierId: sampleSummary.id,
                code: `${sampleSummary.code}_STANDARD`,
                name: 'Dịch vụ Tiêu chuẩn Bưu chính',
                transportMode: 'ROAD',
                volumetricDivisor: 5000,
                maxWeightG: 30000,
                maxLengthCm: 150,
                maxWidthCm: 100,
                maxHeightCm: 100,
                maxDimensionSumCm: 250,
                isActive: true,
                createdAt: sampleSummary.createdAt,
                updatedAt: sampleSummary.updatedAt,
              },
            ],
          });
        } else {
          toast.error('Không thể tải chi tiết hãng vận chuyển');
        }
      }
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
    isFallbackData,
    hasNextPage,
    nextCursor,
    refetch: () => fetchCarriers(query),
  };
}
