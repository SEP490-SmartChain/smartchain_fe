import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  CarrierDetail,
  CarrierListPage,
  CarrierListQuery,
} from '../types/carrierCatalog.types';

const carrierSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  isActive: z.boolean(),
  endpointsCount: z.number().int().nonnegative(),
  servicesCount: z.number().int().nonnegative(),
  connectedTenantsCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const carrierCatalogApi = {
  async list(query: CarrierListQuery): Promise<CarrierListPage> {
    const params: Record<string, string> = {};
    if (query.search?.trim()) params.search = query.search.trim();
    if (typeof query.isActive === 'boolean') params.isActive = String(query.isActive);
    if (query.cursor) params.cursor = query.cursor;
    if (query.limit) params.limit = String(query.limit);

    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/platform/carriers', {
      params,
      silent: true,
    });
    return {
      items: z.array(carrierSummarySchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },

  async getDetail(id: string): Promise<CarrierDetail> {
    const { data } = await apiClient.get<ApiResponse<CarrierDetail>>(
      `/v1/platform/carriers/${encodeURIComponent(id)}`,
      { silent: true },
    );
    return data;
  },
};
