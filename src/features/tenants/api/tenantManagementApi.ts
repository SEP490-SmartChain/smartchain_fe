import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  SystemDashboardOverview,
  TenantDetail,
  TenantListPage,
  TenantListQuery,
  UpdateTenantStatusPayload,
} from '../types/tenant.types';

export const tenantManagementApi = {
  async getOverview(): Promise<SystemDashboardOverview> {
    const { data } = await apiClient.get<ApiResponse<SystemDashboardOverview>>(
      '/v1/platform/dashboard/overview',
      { silent: true },
    );
    return data;
  },

  async list(query: TenantListQuery): Promise<TenantListPage> {
    const params: Record<string, string> = {};
    if (query.search?.trim()) params.search = query.search.trim();
    if (query.status) params.status = query.status;
    if (query.cursor) params.cursor = query.cursor;
    if (query.limit) params.limit = String(query.limit);
    if (query.registeredFrom) params.registeredFrom = query.registeredFrom;
    if (query.registeredTo) params.registeredTo = query.registeredTo;

    const { data } = await apiClient.get<ApiResponse<TenantListPage>>('/v1/platform/tenants', {
      params,
      silent: true,
    });
    return data;
  },

  async getDetail(idOrSlug: string): Promise<TenantDetail> {
    const { data } = await apiClient.get<ApiResponse<TenantDetail>>(
      `/v1/platform/tenants/${encodeURIComponent(idOrSlug)}`,
      { silent: true },
    );
    return data;
  },

  async updateStatus(id: string, payload: UpdateTenantStatusPayload): Promise<TenantDetail> {
    const { data } = await apiClient.patch<ApiResponse<TenantDetail>>(
      `/v1/platform/tenants/${encodeURIComponent(id)}/status`,
      payload,
    );
    return data;
  },
};
