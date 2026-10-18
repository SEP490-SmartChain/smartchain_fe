import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  serviceTariffSchema,
  type ServiceTariff,
  type ServiceTariffForm,
} from '../schemas/serviceTariffSchema';

const base = '/v1/commercial/service-tariffs';
const pageSchema = z.object({
  limit: z.number().int().positive().max(100),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});

export const serviceTariffApi = {
  async list(cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(base, {
      signal,
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
    });
    return {
      items: z.array(serviceTariffSchema).parse(response.data),
      pagination: pageSchema.parse(response.meta.pagination),
    };
  },
  async save(input: ServiceTariffForm, row?: ServiceTariff, signal?: AbortSignal) {
    const data = {
      ...input,
      effectiveTo: input.effectiveTo || null,
      ...(row ? { expectedUpdatedAt: row.updatedAt } : {}),
    };
    const response = row
      ? await apiClient.put<ApiResponse<unknown>>(`${base}/${encodeURIComponent(row.id)}`, data, {
          signal,
        })
      : await apiClient.post<ApiResponse<unknown>>(base, data, { signal });
    return serviceTariffSchema.parse(response.data);
  },
  async publish(row: ServiceTariff, reason: string, signal?: AbortSignal) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(row.id)}/publish`,
      { expectedUpdatedAt: row.updatedAt, reason },
      { signal },
    );
    return serviceTariffSchema.parse(response.data);
  },
  async close(row: ServiceTariff, effectiveTo: string, reason: string, signal?: AbortSignal) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(row.id)}/close`,
      { expectedUpdatedAt: row.updatedAt, effectiveTo, reason },
      { signal },
    );
    return serviceTariffSchema.parse(response.data);
  },
};
