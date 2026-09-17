import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { tenantManagementApi } from '../api/tenantManagementApi';
import type {
  SystemDashboardOverview,
  TenantDetail,
  TenantListQuery,
  TenantSummary,
  UpdateTenantStatusPayload,
} from '../types/tenant.types';

export function useTenantManagement(initialQuery: TenantListQuery = {}) {
  const t = useTranslations('AdminTenants');
  const [query, setQuery] = useState<TenantListQuery>(initialQuery);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [overview, setOverview] = useState<SystemDashboardOverview | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await tenantManagementApi.getOverview();
      setOverview(data);
    } catch {
      setOverview(null);
    }
  }, []);

  const fetchTenants = useCallback(
    async (q: TenantListQuery = query) => {
      setIsLoading(true);
      setError(null);
      try {
        const [pageData] = await Promise.all([tenantManagementApi.list(q), fetchOverview()]);
        const items = Array.isArray(pageData)
          ? pageData
          : (pageData as unknown as { items?: TenantSummary[] })?.items ?? [];
        const pagination = (
          pageData as unknown as { pagination?: { hasNext?: boolean; nextCursor?: string | null } }
        )?.pagination;
        setTenants(items);
        setHasNextPage(Boolean(pagination?.hasNext));
        setNextCursor(pagination?.nextCursor ?? null);
      } catch (err) {
        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        setTenants([]);
        setHasNextPage(false);
        setNextCursor(null);
      } finally {
        setIsLoading(false);
      }
    },
    [query, fetchOverview],
  );

  useEffect(() => {
    fetchTenants(query);
  }, [query, fetchTenants]);

  const selectTenant = useCallback(async (idOrSlug: string) => {
    setIsLoadingDetail(true);
    try {
      const detail = await tenantManagementApi.getDetail(idOrSlug);
      setSelectedTenant(detail);
    } catch {
      toast.error('Không tìm thấy thông tin workspace');
      setSelectedTenant(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const updateStatus = useCallback(
    async (id: string, payload: UpdateTenantStatusPayload) => {
      setIsUpdatingStatus(true);
      try {
        const updated = await tenantManagementApi.updateStatus(id, payload);

        toast.success(
          payload.status === 'SUSPENDED'
            ? t('suspend_success', { name: updated.name })
            : t('activate_success', { name: updated.name }),
        );

        setTenants((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: updated.status } : t)),
        );
        if (selectedTenant?.id === id) {
          setSelectedTenant(updated);
        }
        await fetchOverview();
        return updated;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Không thể thay đổi trạng thái workspace',
        );
        throw err;
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [selectedTenant, fetchOverview, t],
  );

  return {
    query,
    setQuery,
    tenants,
    overview,
    selectedTenant,
    setSelectedTenant,
    selectTenant,
    updateStatus,
    isLoading,
    isLoadingDetail,
    isUpdatingStatus,
    error,
    hasNextPage,
    nextCursor,
    refetch: () => fetchTenants(query),
  };
}
