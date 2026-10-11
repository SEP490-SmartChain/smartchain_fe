import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  Warehouse,
  WarehouseFilters,
  WarehousePage,
  CreateWarehousePayload,
  SetWarehouseStatusPayload,
} from '../types/warehouse';

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']),
  timeZone: z.string(),
  cutoffMinute: z.number().int().min(0).max(1439),
  operatingStartMinute: z.number().int().min(0).max(1439),
  operatingEndMinute: z.number().int().min(1).max(1440),
  version: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  address: z.string(),
  provinceCode: z.string(),
  districtCode: z.string().nullable(),
  wardCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  dailyCapacity: z.number(),
  priority: z.number(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const warehousePageSchema = z.object({
  items: z.array(warehouseSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export const warehouseApi = {
  async list(filters: WarehouseFilters, cursor?: string): Promise<WarehousePage> {
    const params: Record<string, string> = { limit: '50' };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.status) params.status = filters.status;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/warehouses', {
      params,
      silent: true,
    });
    return warehousePageSchema.parse({ items: data, pagination: meta.pagination });
  },

  async create(payload: CreateWarehousePayload): Promise<Warehouse> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/warehouses', payload);
    return warehouseSchema.parse(data);
  },

  async setStatus(id: string, payload: SetWarehouseStatusPayload): Promise<Warehouse> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/status`,
      payload,
      { silent: true },
    );
    return warehouseSchema.parse(data);
  },
};
