import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  SepayManualMatchResult,
  UnmatchedSepayPage,
} from '../types/sepayReconciliation.types';

const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const pageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      environment: z.string(),
      externalRef: z.string(),
      amountVnd: money,
      content: z.string().nullable(),
      code: z.string().nullable(),
      gateway: z.string().nullable(),
      transactionDate: z.string().nullable(),
      receivedAt: z.string().datetime(),
    }),
  ),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().datetime().nullable(),
  }),
});
const matchSchema = z.object({
  receiptId: z.string().uuid(),
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amountVnd: money,
  unallocatedVnd: money,
});

/** UC-127: ORCA Accountant review of verified SePay transfers that were not auto-matched. */
export const sepayReconciliationApi = {
  async unmatched(before: string | null, signal?: AbortSignal): Promise<UnmatchedSepayPage> {
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/commercial/sepay/unmatched', {
      params: before ? { limit: '20', before } : { limit: '20' },
      signal,
      silent: true,
    });
    return pageSchema.parse({ items: response.data, pagination: response.meta.pagination });
  },
  async match(
    notificationId: string,
    invoiceNo: string,
    signal?: AbortSignal,
  ): Promise<SepayManualMatchResult> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/sepay/unmatched/${encodeURIComponent(notificationId)}/match`,
      { invoiceNo },
      { signal, silent: true },
    );
    return matchSchema.parse(data);
  },
};
