import { z } from 'zod';
import { apiClient, type ApiResponse } from '@/services/apiClient';
const cancellation = z
  .object({
    id: z.uuid(),
    status: z.enum(['NOT_REQUESTED', 'PENDING', 'EXCEPTION', 'CANCELLED']),
    code: z.string().nullable(),
  })
  .strict();
export type Cancellation = z.infer<typeof cancellation>;
export const orderCancellationApi = {
  async cancel(
    id: string,
    input: { operationId: string; expectedVersion: number; reason: string },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(`/v1/orders/${id}/cancel`, input, {
      signal,
      silent: true,
    });
    return cancellation.parse(data);
  },
  async cancellation(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`/v1/orders/${id}/cancellation`, {
      signal,
      silent: true,
    });
    return cancellation.parse(data);
  },
};
