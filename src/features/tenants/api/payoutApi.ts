import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  closeoutSummarySchema,
  closeoutOffsetSchema,
  closeoutRefundSchema,
  ledgerEntrySchema,
  payoutCommandSchema,
  payoutLineSchema,
  payoutStatementSchema,
  payoutSummarySchema,
} from '../schemas/payoutSchema';

const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});
const mutationSchema = z.object({
  statementId: z.string().uuid(),
  status: payoutStatementSchema.shape.status,
  version: z.number().int().positive(),
  disputeId: z.string().uuid().optional(),
  transferId: z.string().uuid().optional(),
});
interface Filters {
  tenantId?: string;
  cursor?: string;
  accountKind?: 'OPERATING' | 'DEPOSIT';
}
function query(filters: Filters): string {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) values.set(key, value);
  return values.size ? `?${values}` : '';
}
const root = '/v1/billing';
const statementPath = (id: string) =>
  `${root}/statements/${encodeURIComponent(z.string().uuid().parse(id))}`;
export const payoutApi = {
  async closeout(tenantId?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      root + '/closeout' + query({ tenantId }),
      { signal, silent: true },
    );
    return closeoutSummarySchema.parse(data);
  },
  async settle(
    action: 'offsets' | 'refunds',
    payload: Record<string, unknown>,
    tenantId?: string,
    signal?: AbortSignal,
  ) {
    (action === 'offsets' ? closeoutOffsetSchema : closeoutRefundSchema).parse(payload);
    z.object({
      operationKey: z.string().uuid(),
      contractId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
    }).parse(payload);
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      root + '/closeout/' + action + query({ tenantId }),
      payload,
      { signal, silent: true },
    );
    return z
      .object({
        contractId: z.string().uuid(),
        status: z.enum(['OFFSET_RECORDED', 'REFUNDED']),
        operatingBalanceVnd: z.string().regex(/^-?\d+$/),
        depositBalanceVnd: z.string().regex(/^-?\d+$/),
        entryIds: z.array(z.string().uuid()),
        transferId: z.string().uuid().optional(),
      })
      .parse(data);
  },
  async closeoutEvidence(file: File, tenantId?: string, signal?: AbortSignal) {
    const form = new FormData();
    form.set('file', file);
    const { data } = await apiClient.uploadForm<ApiResponse<unknown>>(
      root + '/closeout/evidence' + query({ tenantId }),
      form,
      { signal, silent: true },
    );
    return z
      .object({ evidenceKey: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(data);
  },
  async summary(tenantId?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${root}/ledger/summary${query({ tenantId })}`,
      { signal, silent: true },
    );
    return payoutSummarySchema.parse(data);
  },
  async ledger(filters: Filters, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/ledger${query(filters)}`, {
      signal,
      silent: true,
    });
    return {
      items: z.array(ledgerEntrySchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta?.pagination),
    };
  },
  async list(filters: Omit<Filters, 'accountKind'>, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${root}/statements${query(filters)}`,
      { signal, silent: true },
    );
    return {
      items: z.array(payoutStatementSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta?.pagination),
    };
  },
  async detail(id: string, tenantId?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${statementPath(id)}${query({ tenantId })}`,
      { signal, silent: true },
    );
    return payoutStatementSchema.parse(data);
  },
  async lines(id: string, filters: Omit<Filters, 'accountKind'>, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${statementPath(id)}/lines${query(filters)}`,
      { signal, silent: true },
    );
    return {
      items: z.array(payoutLineSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta?.pagination),
    };
  },
  async command(
    id: string,
    action: 'send' | 'confirm' | 'approve' | 'transfers' | 'dispute' | 'resolve',
    payload: Record<string, unknown>,
    tenantId?: string,
    resourceId?: string,
    signal?: AbortSignal,
  ) {
    payoutCommandSchema.parse(payload);
    const resource = resourceId
      ? encodeURIComponent(z.string().uuid().parse(resourceId))
      : undefined;
    if ((action === 'dispute' || action === 'resolve') && !resource) {
      throw new Error('Statement line or dispute reference required.');
    }
    const suffix =
      action === 'dispute'
        ? `lines/${resource}/disputes`
        : action === 'resolve'
          ? `disputes/${resource}/resolve`
          : action;
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${statementPath(id)}/${suffix}${query({ tenantId })}`,
      payload,
      { signal, silent: true },
    );
    return mutationSchema.parse(data);
  },
  async upload(id: string, file: File, tenantId?: string, signal?: AbortSignal) {
    const form = new FormData();
    form.set('file', file);
    const { data } = await apiClient.uploadForm<ApiResponse<unknown>>(
      `${statementPath(id)}/transfer-evidence${query({ tenantId })}`,
      form,
      { signal, silent: true },
    );
    return z
      .object({ evidenceKey: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(data);
  },
};
