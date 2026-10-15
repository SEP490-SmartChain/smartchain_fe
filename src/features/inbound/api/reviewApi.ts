import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { inspectionFormSchema, inspectionValuesSchema } from '../schemas/receiptInspectionSchema';

const ids = (max: number) =>
  z
    .array(z.string().uuid())
    .max(max)
    .refine((items) => new Set(items.map((id) => id.toLowerCase())).size === items.length);
export const reviewValuesSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((value) =>
      [...value].every(
        (c) =>
          c.charCodeAt(0) !== 127 &&
          (c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
      ),
    ),
});
export const reviewInputSchema = reviewValuesSchema
  .extend({
    operationKey: z.string().uuid(),
    expectedVersion: z.number().int().min(1).max(2147483646),
    inspectionIds: ids(5000),
    discrepancyIds: ids(5100),
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export const reviewSchema = reviewValuesSchema
  .extend({
    id: z.string().uuid(),
    receiptId: z.string().uuid(),
    receiptVersion: z.number().int().min(2),
    inspectionIds: ids(5000),
    discrepancyIds: ids(5100),
    reviewedAt: z.string().datetime(),
    notificationState: z.literal('PENDING'),
  })
  .strict();
const recordSchema = z
  .object({
    receivingRecordId: z.string().uuid(),
    lotCode: z.string().min(1),
    receivedQty: z.number().int().min(1).max(1000000),
    qcState: z.enum(['PENDING', 'REVIEW_REQUIRED', 'APPROVED']),
    inspection: inspectionValuesSchema.extend({ id: z.string().uuid() }).strict().nullable(),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      r.inspection &&
      !inspectionFormSchema(r.receivedQty, false).safeParse(r.inspection).success
    ) {
      c.addIssue({ code: 'custom', message: 'Review QC must partition its physical lot' });
    }
  });
export const reviewStateSchema = z
  .object({
    receiptId: z.string().uuid(),
    receiptVersion: z.number().int().positive(),
    asnId: z.string().uuid(),
    asnStatus: z.enum(['ARRIVED', 'RECEIVING', 'DISCREPANCY', 'READY_FOR_PUTAWAY', 'COMPLETED']),
    status: z.enum(['RECEIVING', 'APPROVED', 'COMPLETED', 'CANCELLED']),
    ready: z.boolean(),
    canApprove: z.boolean(),
    unreportedDiscrepancies: z.number().int().nonnegative().max(5100),
    blockers: z
      .array(
        z
          .object({
            code: z.enum([
              'RECEIPT_NOT_OPEN',
              'COUNT_REQUIRED',
              'INSPECTION_REQUIRED',
              'DISCREPANCY_REPORT_REQUIRED',
            ]),
            inboundLineId: z.string().uuid().nullable(),
            receivingRecordId: z.string().uuid().nullable(),
          })
          .strict(),
      )
      .max(10101)
      .optional(),
    inspectionIds: ids(5000),
    discrepancyIds: ids(5100),
    records: z.array(recordSchema).max(5000),
    items: z.array(reviewSchema).max(1000),
  })
  .strict()
  .superRefine((v, c) => {
    const sameIds = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
    if (
      new Set(v.records.map((r) => r.receivingRecordId)).size !== v.records.length ||
      new Set(v.items.map((r) => r.id)).size !== v.items.length ||
      v.items.some((r) => r.receiptId !== v.receiptId || r.receiptVersion > v.receiptVersion) ||
      !sameIds(
        v.inspectionIds,
        v.records.flatMap((r) => (r.inspection ? [r.inspection.id] : [])),
      ) ||
      (v.ready &&
        (v.status !== 'RECEIVING' ||
          !['RECEIVING', 'DISCREPANCY'].includes(v.asnStatus) ||
          v.records.some((r) => r.qcState !== 'REVIEW_REQUIRED' || !r.inspection))) ||
      v.canApprove !== (v.ready && v.unreportedDiscrepancies === 0) ||
      v.blockers?.some(
        (b) =>
          b.receivingRecordId !== null &&
          !v.records.some((r) => r.receivingRecordId === b.receivingRecordId),
      ) ||
      (v.canApprove && v.blockers?.length !== undefined && v.blockers.length > 0)
    ) {
      c.addIssue({ code: 'custom', message: 'Inconsistent Manager review state' });
    }
  });
export type ReviewState = z.infer<typeof reviewStateSchema>;
const path = (warehouse: string, asn: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving/reviews`;
export const reviewApi = {
  async get(warehouse: string, asn: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path(warehouse, asn), {
      silent: true,
      signal,
    });
    const state = reviewStateSchema.parse(data);
    if (state.asnId !== asn) throw new Error('Review belongs to another ASN');
    return state;
  },
  async decide(
    warehouse: string,
    asn: string,
    receipt: string,
    input: ReviewInput,
    signal?: AbortSignal,
  ) {
    const command = reviewInputSchema.parse(input);
    const { data } = await apiClient.post<ApiResponse<unknown>>(path(warehouse, asn), command, {
      silent: true,
      signal,
    });
    const result = reviewSchema.parse(data);
    if (
      result.receiptId !== receipt ||
      result.decision !== command.decision ||
      result.reason !== command.reason ||
      result.receiptVersion !== command.expectedVersion + 1 ||
      [...result.inspectionIds].sort().join() !== [...command.inspectionIds].sort().join() ||
      [...result.discrepancyIds].sort().join() !== [...command.discrepancyIds].sort().join()
    ) {
      throw new Error('Review does not match the submitted decision');
    }
    return result;
  },
};
