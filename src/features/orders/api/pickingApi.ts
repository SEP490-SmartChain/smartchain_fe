import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const wave = z
  .object({
    id: z.uuid(),
    waveCode: z.string(),
    cutoffAt: z.string(),
    status: z.enum(['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXCEPTION']),
    assignedToPlatformUserId: z.uuid().nullable(),
    version: z.number().int(),
  })
  .strict();
export const pickLineSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    sku: z.string(),
    productName: z.string(),
    binCode: z.string(),
    lotCode: z.string(),
    pickedQty: z.number().int().nonnegative(),
    remainingQty: z.number().int().nonnegative(),
    shortage: z
      .object({
        id: z.uuid(),
        aggregateId: z.uuid(),
        evidenceRefs: z
          .object({
            observedQty: z.number(),
            remainingQty: z.number(),
            pickedQty: z.number(),
            reason: z.string(),
            evidenceKey: z.string(),
            spotCountId: z.uuid(),
            actorId: z.uuid(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const detail = z
  .object({
    id: z.uuid(),
    waveCode: z.string(),
    status: wave.shape.status,
    assigneeId: z.uuid().nullable(),
    lines: z.array(pickLineSchema).max(500),
    nextCursor: z.uuid().nullable().optional().default(null),
  })
  .strict();
export type PickLine = z.infer<typeof pickLineSchema>;
export type PickWave = z.infer<typeof wave>;
export type PickDetail = z.infer<typeof detail>;
const result = z
  .object({
    waveId: z.uuid().nullable().optional(),
    requestId: z.uuid().optional(),
    errorCode: z.string().nullable().optional(),
    lineId: z.uuid().optional(),
    confirmationId: z.uuid().optional(),
    status: z.string().optional(),
    version: z.number().int().optional(),
    pickedQty: z.number().int().optional(),
    remainingQty: z.number().int().optional(),
    shortageId: z.uuid().optional(),
    spotCountId: z.uuid().optional(),
    replacementLineIds: z.array(z.uuid()).optional(),
  })
  .strict();
export interface PickPending {
  path: string;
  payload: Record<string, unknown>;
}
const base = '/v1/warehouse-ops';
export const pickingApi = {
  async requestStatus(warehouseId: string, id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base}/wave-requests/${encodeURIComponent(id)}`,
      { params: { warehouseId }, signal, silent: true },
    );
    const parsed = result.parse(data);
    if (parsed.requestId !== id) throw new Error('Request identity mismatch');
    return parsed;
  },
  async warehouses(signal?: AbortSignal) {
    const items: { id: string; name: string; code: string }[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < 10; index++) {
      const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/warehouses', {
        signal,
        silent: true,
        params: { limit: '50', ...(cursor ? { cursor } : {}) },
      });
      items.push(
        ...z.array(z.object({ id: z.uuid(), name: z.string(), code: z.string() })).parse(data),
      );
      const page = z
        .object({ hasNext: z.boolean(), nextCursor: z.uuid().nullable() })
        .parse(meta.pagination);
      if (!page.hasNext) return items;
      if (!page.nextCursor || page.nextCursor === cursor) {
        throw new Error('Invalid warehouse cursor');
      }
      cursor = page.nextCursor;
    }
    throw new Error('Warehouse directory exceeds page limit');
  },
  async waves(warehouseId: string, cursor: string | null, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/waves`, {
      params: { warehouseId, ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return z
      .object({ items: z.array(wave), nextCursor: z.uuid().nullable() })
      .strict()
      .parse(data);
  },
  async detail(warehouseId: string, id: string, signal?: AbortSignal, cursor?: string | null) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base}/waves/${encodeURIComponent(id)}`,
      { params: { warehouseId, ...(cursor ? { cursor } : {}) }, signal, silent: true },
    );
    const parsed = detail.parse(data);
    if (parsed.id !== id) throw new Error('Wave identity mismatch');
    return parsed;
  },
  async staff(warehouseId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(warehouseId)}/putaway/staff`,
      { signal, silent: true },
    );
    return z.array(z.object({ id: z.uuid(), fullName: z.string() }).strict()).parse(data);
  },
  async execute(warehouseId: string, pending: PickPending, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base}/${pending.path}`,
      pending.payload,
      { params: { warehouseId }, signal, silent: true },
    );
    return result.parse(data);
  },
};
