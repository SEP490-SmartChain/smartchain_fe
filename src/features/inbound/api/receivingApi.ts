import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { asnSchema } from './asnApi';

import type { AsnPage, AsnStatus } from '../types/asn.types';

const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});
const directorySchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string() })),
  pagination: paginationSchema,
});
export const arrivalSchema = z.object({
  asnId: z.string().uuid(),
  asnCode: z.string(),
  warehouseId: z.string().uuid(),
  receiptId: z.string().uuid(),
  arrivedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type AsnArrival = z.infer<typeof arrivalSchema>;
export type ReceivingWarehouse = z.infer<typeof directorySchema>['items'][number];

export const receivingApi = {
  async warehouses(signal?: AbortSignal): Promise<ReceivingWarehouse[]> {
    const result: ReceivingWarehouse[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let pageNo = 0; pageNo < 10; pageNo++) {
      const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/warehouses', {
        params: { limit: '50', ...(cursor ? { cursor } : {}) },
        signal,
        silent: true,
      });
      const page = directorySchema.parse({ items: data, pagination: meta.pagination });
      result.push(...page.items);
      if (!page.pagination.hasNext) return result;
      cursor = page.pagination.nextCursor;
      if (!cursor || seen.has(cursor)) throw new Error('Invalid warehouse pagination');
      seen.add(cursor);
    }
    throw new Error('Warehouse directory exceeds supported page limit');
  },
  async list(
    warehouseId: string,
    search = '',
    status?: AsnStatus,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AsnPage> {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns`,
      {
        params: {
          limit: '20',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(status ? { status } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal,
        silent: true,
      },
    );
    return z
      .object({ items: z.array(asnSchema), pagination: paginationSchema })
      .parse({ items: data, pagination: meta.pagination }) as AsnPage;
  },
  async checkIn(warehouseId: string, id: string, version: number): Promise<AsnArrival> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns/${encodeURIComponent(id)}/arrival`,
      { version },
      { silent: true },
    );
    return arrivalSchema.parse(data);
  },
};
