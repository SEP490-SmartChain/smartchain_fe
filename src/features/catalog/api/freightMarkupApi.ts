import { apiClient, type ApiResponse } from '@/services/apiClient';

import { freightMarkupSchema, type FreightMarkup } from '../schemas/freightMarkupSchema';

const path = '/v1/platform/tariffs/freight-markup';

export const freightMarkupApi = {
  async read(signal?: AbortSignal): Promise<FreightMarkup> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path, { signal, silent: true });
    return freightMarkupSchema.parse(data);
  },
  async save(
    input: { markupVnd: string; expectedVersion: number },
    signal?: AbortSignal,
  ): Promise<FreightMarkup> {
    const { data } = await apiClient.put<ApiResponse<unknown>>(path, input, {
      signal,
      silent: true,
    });
    return freightMarkupSchema.parse(data);
  },
};
