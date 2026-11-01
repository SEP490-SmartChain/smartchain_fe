import { z } from 'zod';
import { apiClient, type ApiResponse } from '@/services/apiClient';
import { ORDER_STATUSES } from './ordersApi';

const candidate = z
  .object({
    id: z.uuid(),
    orderCode: z.string(),
    sellerName: z.string(),
    warehouses: z.array(z.string()),
    status: z.enum(ORDER_STATUSES),
    version: z.number().int().positive(),
    holdReason: z.string().nullable(),
  })
  .strict();
const page = z.object({ items: z.array(candidate), nextCursor: z.uuid().nullable() }).strict();
export type CancellationCandidate = z.infer<typeof candidate>;

export const operationsCancellationApi = {
  async list(search: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/orders/operations/cancellation-candidates',
      {
        params: { ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
        signal,
        silent: true,
      },
    );
    return page.parse(data);
  },
};
