import { z } from 'zod';
import { apiClient, type ApiResponse } from '@/services/apiClient';
import { type orderCorrectionSchema } from '../schemas/orderLifecycleSchema';
const transition = z
  .object({ id: z.uuid(), status: z.string(), version: z.number().int().positive() })
  .strict();
export const orderLifecycleApi = {
  async transition(
    id: string,
    action: 'redispatch',
    expectedVersion: number,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/orders/${id}/${action}`,
      { expectedVersion },
      { signal, silent: true },
    );
    return transition.parse(data);
  },
  async correct(
    id: string,
    input: z.infer<typeof orderCorrectionSchema> & { expectedVersion: number },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/orders/${id}/correction`,
      input,
      { signal, silent: true },
    );
    return transition.parse(data);
  },
};
