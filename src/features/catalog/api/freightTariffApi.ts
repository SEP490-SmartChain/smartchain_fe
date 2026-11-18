import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { tariffServiceSchema } from '../schemas/freightTariffSchema';

const root = '/v1/platform/tariffs';

/**
 * Freight prices come from carrier API quotes; manual purchase and seller rate cards are
 * read-only history on the backend, so the UI only reads the carrier service list.
 */
export const freightTariffApi = {
  async services(signal?: AbortSignal) {
    const result = await apiClient.get<ApiResponse<unknown>>(`${root}/services`, {
      signal,
      silent: true,
    });
    return z.array(tariffServiceSchema).parse(result.data);
  },
};
