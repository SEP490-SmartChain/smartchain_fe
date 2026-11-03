import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { inspectionValuesSchema, type InspectionInput } from '../schemas/receiptInspectionSchema';

export const inspectionSchema = inspectionValuesSchema
  .extend({
    id: z.string().uuid(),
    receivingRecordId: z.string().uuid(),
    inspectionVersion: z.number().int().positive(),
    receiptVersion: z.number().int().min(2),
    inspectedAt: z.string().datetime(),
    status: z.literal('PROPOSED'),
  })
  .strict();
export type ReceiptInspection = z.infer<typeof inspectionSchema>;
export const inspectionStateSchema = z
  .object({
    receivingRecordId: z.string().uuid(),
    receivedQty: z.number().int().min(1).max(1_000_000),
    receiptVersion: z.number().int().positive(),
    qcState: z.enum(['PENDING', 'REVIEW_REQUIRED', 'APPROVED']),
    lastDecision: z.enum(['APPROVE', 'RETURN']).nullable().optional(),
    items: z.array(inspectionSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.items.some(
        (row, index) =>
          row.receivingRecordId !== value.receivingRecordId ||
          row.receiptVersion > value.receiptVersion ||
          row.inspectionVersion !== index + 1 ||
          row.acceptedQty + row.quarantinedQty + row.rejectedQty !== value.receivedQty,
      ) ||
      new Set(value.items.map((row) => row.id)).size !== value.items.length ||
      (value.qcState === 'PENDING' && value.items.length > 0 && value.lastDecision !== 'RETURN')
    ) {
      context.addIssue({ code: 'custom', message: 'Inconsistent QC receipt history' });
    }
  });
export type InspectionState = z.infer<typeof inspectionStateSchema>;
const path = (warehouse: string, asn: string, record: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving/records/${encodeURIComponent(record)}/inspections`;
export const inspectionApi = {
  async get(warehouse: string, asn: string, record: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path(warehouse, asn, record), {
      silent: true,
      signal,
    });
    const result = inspectionStateSchema.parse(data);
    if (result.receivingRecordId !== record) {
      throw new Error('QC belongs to another receiving record');
    }
    return result;
  },
  async propose(
    warehouse: string,
    asn: string,
    record: string,
    input: InspectionInput,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      path(warehouse, asn, record),
      input,
      { silent: true, signal },
    );
    const result = inspectionSchema.parse(data);
    if (
      result.receivingRecordId !== record ||
      result.acceptedQty !== input.acceptedQty ||
      result.quarantinedQty !== input.quarantinedQty ||
      result.rejectedQty !== input.rejectedQty ||
      result.reasonCode !== input.reasonCode ||
      result.reason !== input.reason.trim() ||
      result.photoIds
        .map((id) => id.toLowerCase())
        .sort()
        .join() !==
        input.photoIds
          .map((id) => id.toLowerCase())
          .sort()
          .join()
    ) {
      throw new Error('QC proposal does not match the submitted inspection');
    }
    return result;
  },
};
