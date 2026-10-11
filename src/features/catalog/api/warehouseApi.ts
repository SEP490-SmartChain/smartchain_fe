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
  async calendar(id: string, at?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/calendar`,
      { params: at ? { at } : undefined, signal, silent: true },
    );
    return calendarSchema.parse(data);
  },
  async updateCalendar(
    id: string,
    payload: { workingDays: number[]; closedDates: string[]; expectedVersion: number },
  ) {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/calendar`,
      payload,
      { silent: true },
    );
    return calendarSchema.parse(data);
  },
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

  async setStatus(id: string, payload: SetWarehouseStatusPayload): Promise<Warehouse> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(id)}/status`,
      payload,
      { silent: true },
    );
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

const calendarSchema = z.object({
  warehouseId: z.string().uuid(),
  version: z.number().int().positive(),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
  timeZone: z.literal('Asia/Ho_Chi_Minh'),
  operatingStartMinute: z.number().int().min(0).max(1439),
  operatingEndMinute: z.number().int().min(1).max(1440),
  cutoffMinute: z.number().int().min(0).max(1439),
  dailyCapacity: z.number().int().positive(),
  checkedAt: z.string().datetime(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localMinute: z.number().int().min(0).max(1439),
  intakeEligible: z.boolean(),
  allocationEligible: z.boolean(),
  sameDayHandoverEligible: z.boolean(),
  capacityUsed: z.number().int().nonnegative(),
  capacityRemaining: z.number().int().nonnegative(),
  reasons: z.array(
    z.enum([
      'INACTIVE',
      'CLOSED_DAY',
      'OUTSIDE_HOURS',
      'DOWNTIME',
      'CAPACITY_REACHED',
      'AFTER_CUTOFF',
    ]),
  ),
});
export type WarehouseCalendar = z.infer<typeof calendarSchema>;
