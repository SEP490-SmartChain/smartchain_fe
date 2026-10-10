import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const quantity = z.number().int().nonnegative();
const positionSchema = z
  .object({
    id: z.guid(),
    sku: z.string(),
    productName: z.string(),
    warehouseCode: z.string(),
    lotCode: z.string().nullable(),
    binCode: z.string().nullable(),
    expiresOn: z.iso.date().nullable(),
    lotStatus: z.string().nullable(),
    stockState: z.enum(['RECEIVING', 'SELLABLE', 'QUARANTINE']),
    positionKind: z.string(),
    onHandQty: quantity,
    reservedQty: quantity,
    availableQty: quantity,
    eligibilityReason: z.enum([
      'ELIGIBLE',
      'UNMAPPED',
      'BLOCKED',
      'INACTIVE',
      'SHELF_LIFE',
      'NOT_STORAGE',
    ]),
  })
  .strict();
const movementSchema = z
  .object({
    id: z.guid(),
    sku: z.string(),
    warehouseCode: z.string(),
    lotCode: z.string().nullable(),
    binCode: z.string().nullable(),
    type: z.string(),
    onHandDelta: z.number().int(),
    reservedDelta: z.number().int(),
    onHandAfter: quantity,
    reservedAfter: quantity,
    refType: z.string(),
    refId: z.guid(),
    actorReference: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export type InventoryPosition = z.infer<typeof positionSchema>;
export type InventoryMovement = z.infer<typeof movementSchema>;
export interface InventoryDetailFilters {
  warehouseId?: string;
  lotStatus?: string;
  search: string;
  lotCode: string;
  binCode: string;
  expiresBefore: string;
  expiresAfter: string;
  movementType: string;
  from: string;
  to: string;
}
function paramsFor(filters: InventoryDetailFilters, cursor?: string): Record<string, string> {
  const params: Record<string, string> = { limit: '50' };
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' && value.trim()) params[key] = value.trim();
  }
  if (cursor) params.cursor = cursor;
  return params;
}
export const inventoryDetailApi = {
  async positions(filters: InventoryDetailFilters, cursor?: string) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/inventory/positions', {
      params: paramsFor(filters, cursor),
      silent: true,
    });
    return {
      items: z.array(positionSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async ledger(filters: InventoryDetailFilters, cursor?: string) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/inventory/ledger', {
      params: paramsFor(filters, cursor),
      silent: true,
    });
    return {
      items: z.array(movementSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
};
