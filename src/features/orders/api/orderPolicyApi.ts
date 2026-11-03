import { z } from 'zod';
import { apiClient, type ApiResponse } from '@/services/apiClient';
import { orderPolicyFormSchema } from '../schemas/orderPolicySchema';

const policy = orderPolicyFormSchema.extend({ version: z.number().int().positive() }).strict();
const transition = z
  .object({ id: z.uuid(), status: z.string(), version: z.number().int().positive() })
  .strict();
export type OrderPolicy = z.infer<typeof policy>;
export const orderPolicyApi = {
  async policy(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/orders/policy', {
      signal,
      silent: true,
    });
    return policy.parse(data);
  },
  async savePolicy(
    input: z.infer<typeof orderPolicyFormSchema> & { expectedVersion: number },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.put<ApiResponse<unknown>>('/v1/orders/policy', input, {
      signal,
      silent: true,
    });
    return policy.parse(data);
  },
  async transition(
    id: string,
    action: 'confirm-hold',
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
};
