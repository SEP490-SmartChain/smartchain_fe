import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { sepayReconciliationApi } from './sepayReconciliationApi';
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
  dueForWeek: z.string().date().optional(),
  reconDeadlineAt: z.string().datetime().optional(),
  isLate: z.boolean().optional(),
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
  async codAging(after: string | null, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      '/v1/reconciliation/settlement-batches/cod-aging',
      { params: after ? { after, limit: '50' } : { limit: '50' }, signal, silent: true },
    );
    return z
      .object({
        items: z.array(
          z.object({
            carrierCode: z.string(),
            tenantId: z.string().uuid(),
            shipmentCount: z.number().int().positive(),
            codVnd: money,
            oldestDeliveredAt: z.string().datetime(),
          }),
        ),
        pagination,
      })
      .parse({ items: response.data, pagination: response.meta.pagination });
  },
  /** Seller names the Accountant may see, to label report rows instead of internal ids. */
  async sellerNames(signal?: AbortSignal): Promise<Map<string, string>> {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/commercial/financial-sellers', {
      signal,
      silent: true,
    });
    const sellers = z
      .object({ sellers: z.array(z.object({ id: z.string().uuid(), name: z.string() })) })
      .parse(data).sellers;
    return new Map(sellers.map((seller) => [seller.id, seller.name]));
  },
  async remittances(batchId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/remittances`,
      { signal, silent: true },
    );
    return z
      .array(
        z.object({
          id: z.string().uuid(),
          bankReference: z.string(),
          amountVnd: money,
          receivedAt: z.string().datetime(),
          evidenceRef: z.string(),
        }),
      )
      .parse(data);
  },
  async linkRemittance(
    batchId: string,
    body:
      | { bankReference: string; amountVnd: string; receivedAt: string; evidenceRef: string }
      | { notificationId: string },
    signal?: AbortSignal,
  ) {
    const action = 'notificationId' in body ? 'sepay-remittances' : 'remittances';
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/reconciliation/settlement-batches/${encodeURIComponent(batchId)}/${action}`,
      body,
      { signal, silent: true },
    );
    return z.object({ id: z.string().uuid(), isReplay: z.boolean() }).parse(data);
  },
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
      codResolutions?: { rowNumber: number; amountVnd: string }[];
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

/** A SePay outage must not hide bank evidence already linked to the batch. */
export async function loadRemittanceSources(batchId: string, signal?: AbortSignal) {
  const [receipts, sepay] = await Promise.allSettled([
    carrierSettlementApi.remittances(batchId, signal),
    sepayReconciliationApi.unmatched(null, signal),
  ]);
  return { receipts, sepay };
}
