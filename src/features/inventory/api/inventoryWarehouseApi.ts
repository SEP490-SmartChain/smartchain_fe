import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

// Inventory only consumes identifiers/labels from the platform warehouse projection.
// Platform warehouses have tenantId=null; legacy seller warehouse DTOs are incompatible.
const optionSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const pageSchema = z.object({
  items: z.array(optionSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});
export type InventoryWarehouseOption = z.infer<typeof optionSchema>;

export async function listInventoryWarehouses(cursor?: string) {
  const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/warehouses', {
    params: { limit: '50', ...(cursor ? { cursor } : {}) },
    silent: true,
  });
  return pageSchema.parse({ items: data, pagination: meta.pagination });
}
