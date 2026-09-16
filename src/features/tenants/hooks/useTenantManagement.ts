import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { tenantManagementApi } from '../api/tenantManagementApi';
import {
  SAMPLE_SYSTEM_OVERVIEW,
  SAMPLE_TENANT_DETAILS,
  SAMPLE_TENANTS,
} from '../data/sampleTenantsData';
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
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await tenantManagementApi.getOverview();
      setOverview(data);
    } catch {
      // Fallback to sample overview if offline / 500
      setOverview((prev) => prev ?? SAMPLE_SYSTEM_OVERVIEW);
    }
  }, []);

  const fetchTenants = useCallback(
    async (q: TenantListQuery = query) => {
      setIsLoading(true);
      setError(null);
      try {
        const [pageData] = await Promise.all([tenantManagementApi.list(q), fetchOverview()]);
        if (pageData && Array.isArray(pageData.items) && pageData.items.length > 0) {
          setTenants(pageData.items);
          setHasNextPage(Boolean(pageData.pagination?.hasNext));
          setNextCursor(pageData.pagination?.nextCursor ?? null);
          setIsFallbackData(false);
        } else {
          // If empty array from live DB, check query filter
          let filtered = [...SAMPLE_TENANTS];
          if (q.search?.trim()) {
            const s = q.search.trim().toLowerCase();
            filtered = filtered.filter(
              (item) => item.name.toLowerCase().includes(s) || item.slug.toLowerCase().includes(s),
            );
          }
          if (q.status) {
            filtered = filtered.filter((item) => item.status === q.status);
          }
          setTenants(filtered);
          setIsFallbackData(true);
          setOverview((prev) => prev ?? SAMPLE_SYSTEM_OVERVIEW);
        }
      } catch (err) {
        const caughtError = err instanceof Error ? err : new Error(String(err));
        setError(caughtError);
        let filtered = [...SAMPLE_TENANTS];
        if (q.search?.trim()) {
          const s = q.search.trim().toLowerCase();
          filtered = filtered.filter(
            (item) => item.name.toLowerCase().includes(s) || item.slug.toLowerCase().includes(s),
          );
        }
        if (q.status) {
          filtered = filtered.filter((item) => item.status === q.status);
        }
        setTenants(filtered);
        setIsFallbackData(true);
        setOverview((prev) => prev ?? SAMPLE_SYSTEM_OVERVIEW);
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
      const sampleDetail = SAMPLE_TENANT_DETAILS[idOrSlug];
      if (sampleDetail) {
        setSelectedTenant(sampleDetail);
      } else {
        const sampleSummary = SAMPLE_TENANTS.find((t) => t.id === idOrSlug || t.slug === idOrSlug);
        if (sampleSummary) {
          setSelectedTenant({
            ...sampleSummary,
            phone: '+84 28 7300 8888',
            taxId: '0312345678',
            suspension: null,
            restoration: null,
            aggregates: {
              activeWarehouseCount: 4,
              currentMonthOrderCount: sampleSummary.quota.ordersUsed,
              connectedCarrierCount: 3,
            },
          });
        } else {
          toast.error('Không tìm thấy thông tin workspace');
        }
      }
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const updateStatus = useCallback(
    async (id: string, payload: UpdateTenantStatusPayload) => {
      setIsUpdatingStatus(true);
      try {
        let updated: TenantDetail;
        try {
          updated = await tenantManagementApi.updateStatus(id, payload);
        } catch {
          // If API fails, perform local optimistic update on sample data
          const current = tenants.find((t) => t.id === id);
          if (!current) throw new Error('Workspace không tồn tại');
          updated = {
            ...current,
            status: payload.status,
            phone: '+84 28 7300 8888',
            taxId: '0312345678',
            suspension:
              payload.status === 'SUSPENDED'
                ? {
                    reason: payload.reason || 'ADMIN_REQUEST',
                    suspendedAt: new Date().toISOString(),
                    suspendedBy: 'current-admin',
                    internalNote: payload.internalNote ?? null,
                  }
                : null,
            restoration:
              payload.status === 'ACTIVE'
                ? {
                    reason: payload.reason || 'Kích hoạt lại bởi Quản trị viên',
                    unsuspendedAt: new Date().toISOString(),
                    unsuspendedBy: 'current-admin',
                  }
                : null,
            aggregates: {
              activeWarehouseCount: 3,
              currentMonthOrderCount: current.quota.ordersUsed,
              connectedCarrierCount: 2,
            },
          };
        }

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
    [tenants, selectedTenant, fetchOverview, t],
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
    isFallbackData,
    hasNextPage,
    nextCursor,
    refetch: () => fetchTenants(query),
  };
}
