import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  SystemDashboardOverview,
  TenantDetail,
  TenantListPage,
  TenantListQuery,
  UpdateTenantStatusPayload,
} from '../types/tenant.types';

const tenantSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  adminEmail: z.string().nullable(),
  subscription: z.object({
    planCode: z.string().nullable(),
    status: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }),
  quota: z.object({
    ordersUsed: z.number().nonnegative(),
    ordersTotal: z.number().nonnegative(),
    apiCallsUsed: z.number().nonnegative(),
    apiCallsTotal: z.number().nonnegative(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

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

    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/platform/tenants', {
      params,
      silent: true,
    });
    return {
      items: z.array(tenantSummarySchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
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
