import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

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
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/reconciliation/settlement-batches',
      {
        params: before ? { limit: '20', before } : { limit: '20' },
        signal,
        silent: true,
      },
    );
    return z.object({ items: z.array(batchSchema), pagination }).parse(data);
  },
  async exceptions(
    batchId: string,
    afterRow: number,
    signal?: AbortSignal,
  ): Promise<SettlementPage<SettlementRecord>> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/records`,
      {
        params: { exceptionsOnly: 'true', afterRow: String(afterRow), limit: '50' },
        signal,
        silent: true,
      },
    );
    return z.object({ items: z.array(recordSchema), pagination }).parse(data);
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
};
