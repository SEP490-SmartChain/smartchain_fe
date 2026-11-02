import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { inventoryWorkflowApi } from './inventoryWorkflowApi';

const line = z
  .object({
    id: z.uuid(),
    sourceId: z.uuid(),
    lotId: z.uuid(),
    sku: z.string(),
    lotCode: z.string(),
    requestedQty: z.number().int(),
    receivedQty: z.number().int(),
    restockedQty: z.number().int(),
    quarantinedQty: z.number().int(),
    classification: z.enum(['PENDING', 'ACCEPTED', 'DAMAGED', 'UNKNOWN']),
    reviewed: z.boolean(),
    hasEvidence: z.boolean(),
    targetStockId: z.uuid().nullable(),
    reviewReason: z.string().nullable(),
  })
  .strict();
const header = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    fulfillmentOrderId: z.uuid(),
    kind: z.enum(['POST_DELIVERY', 'FAILED_DELIVERY']),
    status: z.string(),
    reason: z.string().nullable(),
    requestedAt: z.iso.datetime(),
    arrivedAt: z.iso.datetime().nullable(),
    inspectionDueAt: z.iso.datetime().nullable(),
    inspectionOverdue: z.boolean(),
    reverseBookingState: z.string().nullable(),
    reverseTrackingNumber: z.string().nullable(),
    reverseShipmentStatus: z.string().nullable(),
    warehouseNoticeStatus: z.string().nullable(),
    lines: z.array(line),
  })
  .strict();
const eligible = z
  .object({
    id: z.uuid(),
    fulfillmentOrderId: z.uuid(),
    sku: z.string(),
    lotCode: z.string(),
    remainingQty: z.number().int(),
  })
  .strict();
const result = z
  .object({ id: z.uuid(), version: z.number().int().positive(), status: z.string() })
  .strict();
const base = (wh: string) => `/v1/warehouses/${z.uuid().parse(wh)}/returns`;
export type ReturnRecord = z.infer<typeof header>;
export type ReturnLine = z.infer<typeof line>;
export type ReturnEligibleSource = z.infer<typeof eligible>;
export const returnWorkflowApi = {
  async list(wh: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(base(wh), {
      params: cursor ? { cursor } : undefined,
      signal,
      silent: true,
    });
    return z
      .object({ items: z.array(header), nextCursor: z.uuid().nullable() })
      .strict()
      .parse(data);
  },
  async eligible(wh: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/eligible`, {
      params: cursor ? { cursor } : undefined,
      signal,
      silent: true,
    });
    return z
      .object({ items: z.array(eligible), nextCursor: z.uuid().nullable() })
      .strict()
      .parse(data);
  },
  async bins(wh: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/bins`, {
      signal,
      silent: true,
    });
    return z
      .object({
        items: z.array(
          z
            .object({ id: z.uuid(), code: z.string(), zoneType: z.enum(['STORAGE', 'QUARANTINE']) })
            .strict(),
        ),
        truncated: z.boolean(),
      })
      .strict()
      .parse(data);
  },
  async command(wh: string, path: string, input: unknown) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base(wh)}${path ? `/${path}` : ''}`,
      input,
      { silent: true },
    );
    return result.parse(data);
  },
  evidence(wh: string, id: string, lineId: string, file: File) {
    // Reuse the checksum-bound private object upload, with an explicit endpoint override.
    return inventoryWorkflowApi.evidence(
      wh,
      `${z.uuid().parse(id)}/lines/${z.uuid().parse(lineId)}/evidence`,
      file,
      base(wh),
    );
  },
  async download(wh: string, id: string, lineId: string) {
    const revision = useAuthStore.getState().revision;
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base(wh)}/${z.uuid().parse(id)}/lines/${z.uuid().parse(lineId)}/evidence`,
      { silent: true },
    );
    if (useAuthStore.getState().revision !== revision) throw new Error('AUTH_SCOPE_CHANGED');
    return z.object({ downloadUrl: z.url(), expiresInSeconds: z.number() }).strict().parse(data);
  },
};
