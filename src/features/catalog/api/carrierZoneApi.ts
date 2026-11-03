import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  carrierZoneFormSchema,
  routeSchema,
  paginationSchema,
  type CarrierZone,
  type CarrierZoneForm,
} from '../schemas/carrierZoneSchema';

const base = '/v1/platform/carriers';

export const carrierZoneApi = {
  async list(carrierId: string, cursor?: string, signal?: AbortSignal) {
    const result = await apiClient.get<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(carrierId)}/zones`,
      { params: { limit: '50', ...(cursor ? { cursor } : {}) }, signal, silent: true },
    );
    return {
      items: z.array(routeSchema).parse(result.data),
      pagination: paginationSchema.parse(result.meta.pagination),
    };
  },
  async save(carrierId: string, values: CarrierZoneForm, current?: CarrierZone) {
    const input = carrierZoneFormSchema.parse(values);
    const path = `${base}/${encodeURIComponent(carrierId)}/zones`;
    const result = current
      ? await apiClient.patch<ApiResponse<unknown>>(
          `${path}/${encodeURIComponent(current.id)}`,
          { zone: input.zone, etaDays: input.etaDays, expectedUpdatedAt: current.updatedAt },
          { silent: true },
        )
      : await apiClient.post<ApiResponse<unknown>>(path, input, { silent: true });
    return routeSchema.parse(result.data);
  },
};
