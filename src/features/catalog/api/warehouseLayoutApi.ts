import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const zoneSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  code: z.string(),
  zoneType: z.enum(['RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE']),
  isActive: z.boolean(),
  updatedAt: z.string().datetime(),
});
export const binSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  zoneId: z.string().uuid(),
  code: z.string(),
  barcode: z.string().regex(/^[\x20-\x7e]{1,100}$/),
  maxWeightG: z.string(),
  maxVolumeM3: z.string(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});
const pagination = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export type Zone = z.infer<typeof zoneSchema>;
export type Bin = z.infer<typeof binSchema>;
const path = (warehouseId: string) => `/v1/warehouses/${encodeURIComponent(warehouseId)}`;
export const warehouseLayoutApi = {
  async zones(warehouseId: string, cursor?: string) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(`${path(warehouseId)}/zones`, {
      params: { limit: '100', ...(cursor ? { cursor } : {}) },
      silent: true,
    });
    return z
      .object({ items: z.array(zoneSchema), pagination })
      .parse({ items: data, pagination: meta.pagination });
  },
  async bins(warehouseId: string, zoneId: string, cursor?: string, search?: string) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(`${path(warehouseId)}/bins`, {
      params: {
        limit: '100',
        zoneId,
        ...(cursor ? { cursor } : {}),
        ...(search?.trim() ? { search: search.trim() } : {}),
      },
      silent: true,
    });
    return z
      .object({ items: z.array(binSchema), pagination })
      .parse({ items: data, pagination: meta.pagination });
  },
  async createZone(warehouseId: string, input: Pick<Zone, 'code' | 'zoneType' | 'isActive'>) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouseId)}/zones`,
      input,
      { silent: true },
    );
    return zoneSchema.parse(data);
  },
  async updateZone(warehouseId: string, zone: Zone, input: Pick<Zone, 'zoneType' | 'isActive'>) {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `${path(warehouseId)}/zones/${encodeURIComponent(zone.id)}`,
      { ...input, expectedUpdatedAt: zone.updatedAt },
      { silent: true },
    );
    return zoneSchema.parse(data);
  },
  async createBin(
    warehouseId: string,
    input: { zoneId: string; code: string; maxWeightG: string; maxVolumeM3: string },
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouseId)}/bins`,
      input,
      { silent: true },
    );
    return binSchema.parse(data);
  },
  async bulkBins(
    warehouseId: string,
    input: {
      zoneId: string;
      maxWeightG: string;
      maxVolumeM3: string;
      aisleStart: number;
      aisleCount: number;
      rackStart: number;
      rackCount: number;
      levelStart: number;
      levelCount: number;
    },
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouseId)}/bins/bulk`,
      input,
      { silent: true },
    );
    return z.array(binSchema).parse(data);
  },
  async updateBin(
    warehouseId: string,
    bin: Bin,
    input: Pick<Bin, 'maxWeightG' | 'maxVolumeM3' | 'isActive'>,
  ) {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `${path(warehouseId)}/bins/${encodeURIComponent(bin.id)}`,
      { ...input, expectedVersion: bin.version },
      { silent: true },
    );
    return binSchema.parse(data);
  },
};
