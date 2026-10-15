import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const discrepancyTypes = ['SHORT', 'OVER', 'DAMAGED', 'SHORT_SHELF_LIFE', 'OTHER'] as const;
const typeSchema = z.enum(discrepancyTypes);
const photoIds = z
  .array(z.string().uuid())
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length);
export const discrepancyInputSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: z.number().int().min(1).max(2147483646),
    inboundLineId: z.string().uuid(),
    receivingRecordId: z.string().uuid().optional(),
    discrepancyType: typeSchema,
    reason: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine((text) =>
        [...text].every(
          (c) =>
            c.charCodeAt(0) !== 127 &&
            (c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
        ),
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ['SHORT', 'OVER'].includes(value.discrepancyType)
        ? value.receivingRecordId !== undefined
        : !value.receivingRecordId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Select the corresponding physical line or lot',
      });
    }
  });
export type DiscrepancyInput = z.infer<typeof discrepancyInputSchema>;
export const discrepancySchema = z
  .object({
    id: z.string().uuid(),
    inboundLineId: z.string().uuid(),
    receivingRecordId: z.string().uuid().nullable(),
    discrepancyType: typeSchema,
    qty: z.number().int().positive().max(1_000_000),
    reason: z.string().trim().min(1).max(1000),
    photoIds,
    receiptVersion: z.number().int().min(2),
    status: z.enum(['OPEN', 'APPROVED', 'REJECTED']),
    reportedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ['SHORT', 'OVER'].includes(value.discrepancyType)
        ? value.receivingRecordId !== null || value.photoIds.length > 0
        : !value.receivingRecordId ||
          (value.discrepancyType === 'DAMAGED' && !value.photoIds.length)
    ) {
      context.addIssue({ code: 'custom', message: 'Discrepancy provenance is invalid' });
    }
  });
const exceptionSchema = z
  .object({
    lotCode: z.string().min(1),
    receivingRecordId: z.string().uuid(),
    discrepancyType: z.enum(['DAMAGED', 'SHORT_SHELF_LIFE', 'OTHER']),
    qty: z.number().int().positive().max(1_000_000),
    reason: z.string().min(1).max(1000),
    photoIds,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.discrepancyType === 'DAMAGED' && !value.photoIds.length) {
      context.addIssue({ code: 'custom', message: 'Damage requires confirmed photos' });
    }
  });
export const discrepancyStateSchema = z
  .object({
    receiptId: z.string().uuid(),
    receiptVersion: z.number().int().positive(),
    asnId: z.string().uuid(),
    asnStatus: z.enum(['ARRIVED', 'RECEIVING', 'DISCREPANCY', 'READY_FOR_PUTAWAY', 'COMPLETED']),
    ready: z.boolean(),
    lines: z
      .array(
        z
          .object({
            inboundLineId: z.string().uuid(),
            lineNo: z.number().int().positive(),
            declaredQty: z.null(),
            variance: z
              .object({
                discrepancyType: z.enum(['SHORT', 'OVER']),
                qty: z.number().int().positive().max(1_000_000),
              })
              .strict()
              .nullable(),
            receivedQty: z.number().int().nonnegative().max(1_000_000).nullable(),
            exceptions: z.array(exceptionSchema).max(50),
          })
          .strict(),
      )
      .max(100),
    items: z.array(discrepancySchema).max(5100),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.lines.map((l) => l.inboundLineId)).size !== value.lines.length ||
      new Set(value.lines.map((l) => l.lineNo)).size !== value.lines.length ||
      new Set(value.items.map((i) => i.id)).size !== value.items.length ||
      value.lines.some(
        (l) =>
          (value.ready ? l.receivedQty === null : l.variance !== null) ||
          l.exceptions.reduce((sum, q) => sum + q.qty, 0) > (l.receivedQty ?? 0) ||
          new Set(l.exceptions.map((q) => q.receivingRecordId)).size !== l.exceptions.length,
      ) ||
      value.items.some(
        (i) =>
          i.receiptVersion > value.receiptVersion ||
          !value.lines.some((l) => l.inboundLineId === i.inboundLineId),
      )
    ) {
      context.addIssue({ code: 'custom', message: 'Inconsistent physical discrepancy state' });
    }
  });
export type DiscrepancyState = z.infer<typeof discrepancyStateSchema>;
const path = (warehouse: string, asn: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving/discrepancies`;
export const discrepancyApi = {
  async get(warehouse: string, asn: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path(warehouse, asn), {
      silent: true,
      signal,
    });
    const result = discrepancyStateSchema.parse(data);
    if (result.asnId !== asn) throw new Error('Discrepancy state belongs to another ASN');
    return result;
  },
  async report(warehouse: string, asn: string, input: DiscrepancyInput, signal?: AbortSignal) {
    const command = discrepancyInputSchema.parse(input);
    const { data } = await apiClient.post<ApiResponse<unknown>>(path(warehouse, asn), command, {
      silent: true,
      signal,
    });
    const result = discrepancySchema.parse(data);
    if (
      result.inboundLineId !== command.inboundLineId ||
      result.receivingRecordId !== (command.receivingRecordId ?? null) ||
      result.discrepancyType !== command.discrepancyType ||
      result.reason !== command.reason ||
      result.receiptVersion !== command.expectedVersion + 1
    ) {
      throw new Error('Discrepancy response does not match the submitted report');
    }
    return result;
  },
};
