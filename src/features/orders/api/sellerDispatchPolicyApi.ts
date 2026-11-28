import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const sellerDispatchPolicyFormSchema = z.strictObject({ autoConfirm: z.boolean() });
const policySchema = sellerDispatchPolicyFormSchema.extend({
  version: z.number().int().positive(),
});
export type SellerDispatchPolicy = z.infer<typeof policySchema>;

const path = '/v1/orders/policy/dispatch';

export const sellerDispatchPolicyApi = {
  async read(signal?: AbortSignal): Promise<SellerDispatchPolicy> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path, { signal, silent: true });
    return policySchema.parse(data);
  },
  async save(
    input: z.infer<typeof sellerDispatchPolicyFormSchema> & { expectedVersion: number },
    signal?: AbortSignal,
  ): Promise<SellerDispatchPolicy> {
    const { data } = await apiClient.put<ApiResponse<unknown>>(path, input, {
      signal,
      silent: true,
    });
    return policySchema.parse(data);
  },
};
