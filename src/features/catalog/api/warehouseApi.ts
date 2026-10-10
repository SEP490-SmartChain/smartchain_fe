import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  Warehouse,
  WarehouseFilters,
  WarehousePage,
  CreateWarehousePayload,
  WarehouseStatus,
} from '../types/warehouse';

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']),
  timeZone: z.string(),
  cutoffMinute: z.number().int(),
  operatingStartMinute: z.number().int(),
  operatingEndMinute: z.number().int(),
  tenantId: z.string().uuid().nullable(),
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
  async outstanding(id: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/outstanding`,
      { silent: true },
    );
    return outstandingSchema.parse(data);
  },
  async downtime(id: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/downtime`,
      { silent: true },
    );
    return z.array(downtimeSchema).max(100).parse(data);
  },
  async schedule(
    id: string,
    payload: {
      startAt: string;
      endAt: string;
      reason: string;
      operationKey: string;
      expectedVersion: number;
    },
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/downtime`,
      payload,
      { silent: true },
    );
    return downtimeSchema.parse(data);
  },
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

  async setStatus(
    id: string,
    status: WarehouseStatus,
    reason: string,
    expectedVersion: number,
  ): Promise<Warehouse> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/status`,
      { status, reason, expectedVersion },
      { silent: true },
    );
    return warehouseSchema.parse(data);
  },

  async update(
    id: string,
    payload: Partial<Omit<CreateWarehousePayload, 'code' | 'region'>> & { expectedVersion: number },
  ): Promise<Warehouse> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}`,
      payload,
      { silent: true },
    );
    return warehouseSchema.parse(data);
  },

  async create(payload: CreateWarehousePayload): Promise<Warehouse> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/warehouses', payload);
    return warehouseSchema.parse(data);
  },
};

const outstandingSchema = z.object({
  stockUnits: z.number().int().nonnegative(),
  openTasks: z.number().int().nonnegative(),
  openWaves: z.number().int().nonnegative(),
});
const downtimeSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string(),
  operationKey: z.string().uuid().nullable(),
});
export type Downtime = z.infer<typeof downtimeSchema>;
export type WarehouseOutstanding = z.infer<typeof outstandingSchema>;
