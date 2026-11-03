import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const nearExpirySchema = z
  .object({
    id: z.guid(),
    lotId: z.guid(),
    warehouseId: z.guid(),
    warehouseCode: z.string(),
    sku: z.string(),
    productName: z.string(),
    lotCode: z.string(),
    binCode: z.string(),
    expiresOn: z.iso.date().nullable(),
    remainingDays: z.number().int().nullable(),
    lotStatus: z.string(),
    onHandQty: z.number().int().nonnegative(),
    reservedQty: z.number().int().nonnegative(),
    availableQty: z.number().int().nonnegative(),
    minOutboundDays: z.number().int().nonnegative(),
    warningDays: z.number().int().nonnegative(),
    isBlocked: z.boolean(),
    stockVersion: z.number().int().positive(),
    lotVersion: z.number().int().positive(),
  })
  .strict();
export type NearExpiryPosition = z.infer<typeof nearExpirySchema>;
const pagination = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.guid().nullable(),
});
export const inventoryExpiryApi = {
  async list(
    filters: { warehouseId: string; search: string },
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/lots/near-expiry', {
      params: {
        limit: '50',
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(cursor ? { cursor } : {}),
      },
      silent: true,
      signal,
    });
    return {
      items: z.array(nearExpirySchema).parse(data),
      pagination: pagination.parse(meta.pagination),
    };
  },
};
