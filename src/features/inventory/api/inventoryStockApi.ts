import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  InventoryStockFilters,
  InventoryStockPage,
  InventoryStockSummary,
} from '../types/inventoryStock.types';

const quantitySchema = z.number().int().nonnegative();
const inventoryStockLevelSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  productName: z.string(),
  warehouseId: z.string().uuid(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  onHandQty: quantitySchema,
  reservedQty: quantitySchema,
  availableQty: quantitySchema,
  lastSyncedAt: z.string().datetime(),
});
const inventoryStockListSchema = z.array(inventoryStockLevelSchema);
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
const inventoryStockSummarySchema = z.object({
  totalSkus: quantitySchema,
  availableUnits: quantitySchema,
});

export const inventoryStockApi = {
  async list(filters: InventoryStockFilters, cursor?: string): Promise<InventoryStockPage> {
    const params: Record<string, string> = { limit: '100' };
    const search = filters.search.trim();
    if (search) params.search = search;
    if (filters.warehouseId) params.warehouseId = filters.warehouseId;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/inventory/stocks', {
      params,
      silent: true,
    });
    return {
      items: inventoryStockListSchema.parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },

  async getSummary(): Promise<InventoryStockSummary> {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/inventory/stocks/summary', {
      silent: true,
    });
    return inventoryStockSummarySchema.parse(data);
  },
};
