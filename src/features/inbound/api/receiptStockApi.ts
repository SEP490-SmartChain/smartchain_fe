import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const receiptStockInputSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: z.number().int().positive().max(2147483646),
    binId: z.string().uuid(),
    quarantineBinId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => v.binId !== v.quarantineBinId, { path: ['quarantineBinId'] });
export type ReceiptStockInput = z.infer<typeof receiptStockInputSchema>;
const resultBase = z
  .object({
    receivingRecordId: z.string().uuid(),
    receiptId: z.string().uuid(),
    recognizedQty: z.number().int().min(1).max(1000000),
    items: z
      .array(
        z
          .object({
            stockId: z.string().uuid(),
            binId: z.string().uuid(),
            quantity: z.number().int().positive().max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();
export const receiptStockResultSchema = resultBase.superRefine((v, c) => {
  if (
    v.items.reduce((sum, i) => sum + i.quantity, 0) !== v.recognizedQty ||
    new Set(v.items.map((i) => i.stockId)).size !== v.items.length ||
    new Set(v.items.map((i) => i.binId)).size !== v.items.length
  ) {
    c.addIssue({ code: 'custom', message: 'Invalid physical stock effects' });
  }
});
export const receiptStockStateSchema = resultBase
  .extend({
    recognizedQty: z.number().int().nonnegative().max(1000000),
    items: z
      .array(
        z
          .object({
            stockId: z.string().uuid(),
            binId: z.string().uuid(),
            quantity: z.number().int().positive().max(1000000),
          })
          .strict(),
      )
      .max(2),
    receiptVersion: z.number().int().positive(),
    receivedQty: z.number().int().positive().max(1000000),
    qcState: z.enum(['PENDING', 'REVIEW_REQUIRED', 'APPROVED']),
    acceptedQty: z.number().int().nonnegative(),
    quarantinedQty: z.number().int().nonnegative(),
    rejectedQty: z.number().int().nonnegative(),
    canPost: z.boolean(),
    moreBins: z.boolean(),
    bins: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            code: z.string().min(1),
            zoneType: z.enum(['RECEIVING', 'QUARANTINE']),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.items.reduce((sum, i) => sum + i.quantity, 0) !== v.recognizedQty ||
      new Set(v.items.map((i) => i.stockId)).size !== v.items.length ||
      new Set(v.items.map((i) => i.binId)).size !== v.items.length ||
      v.acceptedQty + v.quarantinedQty + v.rejectedQty > v.receivedQty ||
      (v.qcState === 'APPROVED' &&
        v.acceptedQty + v.quarantinedQty + v.rejectedQty !== v.receivedQty) ||
      v.recognizedQty > v.receivedQty - v.rejectedQty ||
      new Set(v.bins.map((b) => b.id)).size !== v.bins.length ||
      (v.canPost &&
        (v.qcState !== 'APPROVED' ||
          v.recognizedQty !== 0 ||
          v.acceptedQty + v.quarantinedQty === 0))
    ) {
      c.addIssue({ code: 'custom', message: 'Invalid reviewed quantity or posting state' });
    }
  });
export type ReceiptStockState = z.infer<typeof receiptStockStateSchema>;
const path = (w: string, a: string, r: string) =>
  `/v1/warehouses/${encodeURIComponent(w)}/asns/${encodeURIComponent(a)}/receiving/records/${encodeURIComponent(r)}/stock`;
export const receiptStockApi = {
  async get(
    w: string,
    a: string,
    r: string,
    receipt: string,
    signal?: AbortSignal,
    binSearch = '',
  ) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w, a, r)}${binSearch ? `?binSearch=${encodeURIComponent(binSearch)}` : ''}`,
      {
        silent: true,
        signal,
      },
    );
    const result = receiptStockStateSchema.parse(data);
    if (result.receivingRecordId !== r || result.receiptId !== receipt) {
      throw new Error('Stock evidence belongs to another receipt/record');
    }
    return result;
  },
  async post(
    w: string,
    a: string,
    r: string,
    receipt: string,
    quantity: number,
    input: ReceiptStockInput,
    signal?: AbortSignal,
  ) {
    const command = receiptStockInputSchema.parse(input);
    const { data } = await apiClient.post<ApiResponse<unknown>>(path(w, a, r), command, {
      silent: true,
      signal,
    });
    const result = receiptStockResultSchema.parse(data);
    if (
      result.receivingRecordId !== r ||
      result.receiptId !== receipt ||
      result.recognizedQty !== quantity ||
      result.items.some((i) => ![command.binId, command.quarantineBinId].includes(i.binId))
    ) {
      throw new Error('Stock effects do not match the submitted receiving record');
    }
    return result;
  },
};
