import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { asnSchema } from './asnApi';

import type { ReceiptCountInput } from '../schemas/receiptCountSchema';
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

export const receiptCountSchema = z
  .object({
    id: z.string().uuid(),
    receiptId: z.string().uuid(),
    inboundLineId: z.string().uuid(),
    receivedQty: z.number().int().min(0).max(1_000_000),
    receiptVersion: z.number().int().min(2),
    countedAt: z.string().datetime(),
    lots: z
      .array(
        z
          .object({
            recordId: z.string().uuid(),
            lotId: z.string().uuid(),
            lotCode: z.string().min(1),
            receivedQty: z.number().int().positive(),
            quarantinedQty: z.number().int().nonnegative(),
            qcState: z.enum(['PENDING', 'REVIEW_REQUIRED', 'APPROVED']),
            manufacturedOn: z.iso.date().nullable(),
            expiresOn: z.iso.date().nullable(),
            lotStatus: z.enum([
              'SELLABLE',
              'NEAR_EXPIRY',
              'QUARANTINE',
              'NEAR_EXPIRY_LOCKED',
              'EXPIRED',
              'RECALLED',
            ]),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.lots.reduce((sum, lot) => sum + lot.receivedQty, 0) !== value.receivedQty ||
      value.lots.some((lot) => lot.quarantinedQty > lot.receivedQty)
    ) {
      context.addIssue({ code: 'custom', message: 'Inconsistent physical count' });
    }
  });
export const receivingStateSchema = z
  .object({
    receiptId: z.string().uuid(),
    version: z.number().int().positive(),
    status: z.enum(['RECEIVING', 'COMPLETED', 'CANCELLED']),
    asnId: z.string().uuid(),
    asnCode: z.string(),
    asnStatus: asnSchema.shape.status,
    lines: z.array(
      z
        .object({
          id: z.string().uuid(),
          lineNo: z.number().int().positive(),
          sku: z.string(),
          productName: z.string(),
          trackExpiry: z.boolean(),
          shelfLifeDays: z.number().int().positive().nullable(),
          minInboundShelfLifePct: z.number().min(0).max(100),
          count: receiptCountSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.lines.some(
        (line) =>
          line.count &&
          (line.count.inboundLineId !== line.id ||
            line.count.receiptId !== value.receiptId ||
            line.count.receiptVersion > value.version),
      )
    ) {
      context.addIssue({ code: 'custom', message: 'Count belongs to another receipt or line' });
    }
  });
export type ReceivingState = z.infer<typeof receivingStateSchema>;

export const receivingApi = {
  async receipt(warehouseId: string, asnId: string, signal?: AbortSignal): Promise<ReceivingState> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns/${encodeURIComponent(asnId)}/receiving`,
      { signal, silent: true },
    );
    const result = receivingStateSchema.parse(data);
    if (result.asnId !== asnId) throw new Error('Receipt belongs to another ASN');
    return result;
  },
  async recordCount(warehouseId: string, asnId: string, input: ReceiptCountInput) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns/${encodeURIComponent(asnId)}/receiving/counts`,
      input,
      { silent: true },
    );
    const result = receiptCountSchema.parse(data);
    if (result.inboundLineId !== input.inboundLineId || result.receivedQty !== input.receivedQty) {
      throw new Error('Count does not match the submitted line');
    }
    return result;
  },
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
