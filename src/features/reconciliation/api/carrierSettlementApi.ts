import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  disputeDetailSchema,
  disputeSchema,
  type CarrierDispute,
  type CarrierDisputeDetail,
  type DisputeStatus,
} from '../schemas/settlementReviewSchema';

import type {
  SettlementBatch,
  SettlementCarrierCode,
  SettlementCompletion,
  SettlementPage,
  SettlementRecord,
} from '../types/carrierSettlement.types';

const money = z.string().regex(/^(0|-?[1-9]\d{0,19})$/);
const pagination = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
const batchSchema = z.object({
  id: z.string().uuid(),
  carrierCode: z.string(),
  fileName: z.string(),
  status: z.string(),
  totalRows: z.number().int().nonnegative(),
  processedRows: z.number().int().nonnegative(),
  matchedRows: z.number().int().nonnegative(),
  exceptionRows: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
const recordSchema = z.object({
  rowNumber: z.number().int().positive(),
  trackingNumber: z.string(),
  matchStatus: z.string(),
  discrepancies: z.array(z.string()),
  expectedFeeVnd: money,
  actualFeeVnd: money,
  expectedCodVnd: money,
  collectedCodVnd: money.nullable(),
  remittedCodVnd: money.nullable(),
});

/** SS-1288 / UC-137–141: ORCA Accountant carrier settlement batches. */
export const carrierSettlementApi = {
  async upload(
    carrierCode: SettlementCarrierCode,
    file: File,
    signal?: AbortSignal,
  ): Promise<{ batchId: string; duplicate: boolean; totalRows: number }> {
    const form = new FormData();
    form.append('carrierCode', carrierCode);
    form.append('file', file);
    const { data } = await apiClient.uploadForm<ApiResponse<unknown>>(
      '/v1/reconciliation/settlement-batches',
      form,
      { signal, silent: true },
    );
    return z
      .object({
        batchId: z.string().uuid(),
        duplicate: z.boolean(),
        totalRows: z.number().int().positive(),
      })
      .parse(data);
  },
  async list(
    before: string | null,
    signal?: AbortSignal,
  ): Promise<SettlementPage<SettlementBatch>> {
    const response = await apiClient.get<ApiResponse<unknown>>(
      '/v1/reconciliation/settlement-batches',
      {
        params: before ? { limit: '20', before } : { limit: '20' },
        signal,
        silent: true,
      },
    );
    return z
      .object({ items: z.array(batchSchema), pagination })
      .parse({ items: response.data, pagination: response.meta.pagination });
  },
  async exceptions(
    batchId: string,
    afterRow: number,
    signal?: AbortSignal,
  ): Promise<SettlementPage<SettlementRecord>> {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/records`,
      {
        params: { exceptionsOnly: 'true', afterRow: String(afterRow), limit: '50' },
        signal,
        silent: true,
      },
    );
    return z
      .object({ items: z.array(recordSchema), pagination })
      .parse({ items: response.data, pagination: response.meta.pagination });
  },
  async complete(batchId: string, signal?: AbortSignal): Promise<SettlementCompletion> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/complete`,
      {},
      { signal, silent: true },
    );
    return z
      .object({
        batchId: z.string().uuid(),
        postedCount: z.number().int().nonnegative(),
        skippedAlreadyCredited: z.number().int().nonnegative(),
        creditedVnd: money,
      })
      .parse(data);
  },
  /** UC-141: link an unmatched/ambiguous row to one shipment of the batch carrier. */
  async match(
    batchId: string,
    rowNumber: number,
    body: { trackingNumber: string; reason: string },
    signal?: AbortSignal,
  ): Promise<{ rowNumber: number; matchStatus: 'MANUALLY_MATCHED'; discrepancies: string[] }> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/records/${rowNumber}/match`,
      body,
      { signal, silent: true },
    );
    return z
      .object({
        rowNumber: z.number().int().positive(),
        matchStatus: z.literal('MANUALLY_MATCHED'),
        discrepancies: z.array(z.string()),
      })
      .parse(data);
  },
  /** UC-142: exceptions only by default; the server streams the workbook. */
  exportXlsx(batchId: string, exceptionsOnly: boolean, signal?: AbortSignal): Promise<Blob> {
    return apiClient.downloadXlsx(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/export`,
      {
        params: { exceptionsOnly: String(exceptionsOnly) },
        signal: signal ?? AbortSignal.timeout(300_000),
        silent: true,
      },
    );
  },
  /** UC-143 */
  async openDispute(
    body: { batchId: string; rowNumbers: number[]; externalTicketRef?: string; note?: string },
    signal?: AbortSignal,
  ): Promise<{ id: string; code: string; claimedAmountVnd: string; records: number }> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/reconciliation/carrier-disputes',
      body,
      { signal, silent: true },
    );
    return z
      .object({
        id: z.string().uuid(),
        code: z.string(),
        claimedAmountVnd: money,
        records: z.number().int().positive(),
      })
      .parse(data);
  },
  async disputes(
    filter: { status?: DisputeStatus; before?: string | null },
    signal?: AbortSignal,
  ): Promise<SettlementPage<CarrierDispute>> {
    const params: Record<string, string> = { limit: '20' };
    if (filter.status) params['status'] = filter.status;
    if (filter.before) params['before'] = filter.before;
    const response = await apiClient.get<ApiResponse<unknown>>(
      '/v1/reconciliation/carrier-disputes',
      { params, signal, silent: true },
    );
    return z
      .object({ items: z.array(disputeSchema), pagination })
      .parse({ items: response.data, pagination: response.meta.pagination });
  },
  async dispute(id: string, signal?: AbortSignal): Promise<CarrierDisputeDetail> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/reconciliation/carrier-disputes/${encodeURIComponent(id)}`,
      { signal, silent: true },
    );
    return disputeDetailSchema.parse(data);
  },
  async updateDispute(
    id: string,
    body: {
      expectedVersion: number;
      status?: DisputeStatus;
      externalTicketRef?: string;
      resolvedAmountVnd?: string;
      note?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ id: string; status: DisputeStatus; version: number }> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/reconciliation/carrier-disputes/${encodeURIComponent(id)}`,
      body,
      { signal, silent: true },
    );
    return z
      .object({
        id: z.string().uuid(),
        status: disputeSchema.shape.status,
        version: z.number().int().positive(),
      })
      .parse(data);
  },
};
