import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';
const whole = z.number().int().positive().max(2147483646),
  scan = z
    .string()
    .min(1)
    .max(128)
    .refine((v) => v.trim() === v),
  state = z.enum(['SELLABLE', 'QUARANTINE']);
export const relocationInputSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: whole,
    toBinId: z.string().uuid(),
    fromBinScan: scan,
    toBinScan: scan,
    skuScan: scan,
    lotScan: scan,
    qty: whole,
    reason: z
      .string()
      .min(3)
      .max(500)
      .refine((v) => v.trim() === v),
  })
  .strict();
export type RelocationInput = z.infer<typeof relocationInputSchema>;
export const relocationPositionSchema = z
  .object({
    id: z.string().uuid(),
    version: whole,
    sku: scan,
    productName: z.string().min(1),
    lotCode: scan,
    fromBinId: z.string().uuid(),
    fromBinCode: scan,
    stockState: state,
    availableQty: whole,
  })
  .strict();
export type RelocationPosition = z.infer<typeof relocationPositionSchema>;
const positionsSchema = z
  .object({
    items: z.array(relocationPositionSchema).max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.id)).size === v.items.length &&
      (!v.nextCursor || (v.items.length === 100 && v.nextCursor === v.items.at(-1)?.id)),
  );
const binsSchema = z
  .object({
    bins: z.array(z.object({ id: z.string().uuid(), code: scan }).strict()).max(500),
    moreBins: z.boolean(),
  })
  .strict()
  .refine((v) => new Set(v.bins.map((i) => i.id)).size === v.bins.length);
const resultSchema = z
  .object({
    id: z.string().uuid(),
    sourceStockId: z.string().uuid(),
    toBinId: z.string().uuid(),
    qty: whole,
    stockState: state,
    sourceVersion: whole,
  })
  .strict();
const path = (w: string) => `/v1/warehouses/${encodeURIComponent(w)}/putaway/relocation`;
export const relocationApi = {
  async positions(w: string, cursor: string | null, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { silent: true, signal },
    );
    return positionsSchema.parse(data);
  },
  async bins(w: string, source: string, search: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w)}/${encodeURIComponent(source)}/bins${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      { silent: true, signal },
    );
    const result = binsSchema.parse(data);
    return result;
  },
  async post(w: string, source: RelocationPosition, input: RelocationInput, signal?: AbortSignal) {
    const command = relocationInputSchema.parse(input);
    if (command.qty > source.availableQty || command.toBinId === source.fromBinId) {
      throw new Error('Choose a different destination and only unreserved quantity');
    }
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(w)}/${encodeURIComponent(source.id)}`,
      command,
      { silent: true, signal },
    );
    const result = resultSchema.parse(data);
    if (
      result.sourceStockId !== source.id ||
      result.toBinId !== command.toBinId ||
      result.qty !== command.qty ||
      result.stockState !== source.stockState ||
      result.sourceVersion !== command.expectedVersion + 1
    ) {
      throw new Error('Relocation proof differs from the attempted movement');
    }
    return result;
  },
};
