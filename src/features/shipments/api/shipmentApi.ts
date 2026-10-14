import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { shipmentSchema, paginationSchema, breakerSchema } from '../schemas/shipmentSchema';

export const shipmentApi = {
  async list(cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/shipments', {
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return {
      items: z.array(shipmentSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta.pagination),
    };
  },
  async detail(id: string, signal?: AbortSignal) {
    return shipmentSchema.parse(
      (
        await apiClient.get<ApiResponse<unknown>>(`/v1/shipments/${encodeURIComponent(id)}`, {
          signal,
          silent: true,
        })
      ).data,
    );
  },
  label(id: string, signal?: AbortSignal) {
    return apiClient.downloadPdf(`/v1/shipments/${encodeURIComponent(id)}/label`, {
      signal,
      silent: true,
    });
  },
  async breakers(signal?: AbortSignal) {
    return z.array(breakerSchema).parse(
      (
        await apiClient.get<ApiResponse<unknown>>('/v1/platform/integrations/carrier-breakers', {
          signal,
          silent: true,
        })
      ).data,
    );
  },
};
