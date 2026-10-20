import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const money = z.string().regex(/^-?\d{1,20}$/);
export const invoiceSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  invoiceNo: z.string(),
  documentType: z.enum(['ONBOARDING', 'PLAN', 'SERVICE', 'ADJUSTMENT']),
  invoiceKind: z.string(),
  documentStatus: z.enum(['DRAFT', 'ISSUED']),
  periodKey: z.string(),
  issuedAt: z.string().nullable(),
  dueOn: z.string(),
  totalVnd: money,
  paidVnd: money,
  outstandingVnd: money,
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'EXPIRED', 'LEDGER']),
  paymentRequired: z.boolean(),
});
export const invoiceLineSchema = z.object({
  id: z.string().uuid(),
  lineNo: z.number().int().positive(),
  description: z.string(),
  quantity: z.string().regex(/^\d+(\.\d{1,6})?$/),
  unit: z.string(),
  unitPriceVnd: money,
  amountVnd: money,
  billableEventId: z.string().uuid().nullable(),
  ledgerEntryId: z.string().uuid().nullable(),
  feeType: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().uuid().nullable(),
  eventAt: z.string().nullable(),
  tariffVersionRef: z.string().uuid().nullable(),
});
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});
const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  reference: z.string(),
  amountVnd: money,
  dueOn: z.string(),
  method: z.literal('VERIFIED_BANK_TRANSFER'),
  verificationRequired: z.literal(true),
});
export type FeeInvoice = z.infer<typeof invoiceSchema>;
export type FeeInvoiceLine = z.infer<typeof invoiceLineSchema>;
export type InvoicePayment = z.infer<typeof paymentSchema>;
export interface InvoiceFilters {
  tenantId?: string;
  month?: string;
  documentType?: string;
  cursor?: string;
  limit?: number;
}
function query(filters: InvoiceFilters): string {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') values.set(key, String(value));
  }
  return values.size ? `?${values.toString()}` : '';
}
export const invoiceApi = {
  async list(filters: InvoiceFilters, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/v1/billing/invoices${query(filters)}`,
      { signal },
    );
    return {
      items: z.array(invoiceSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta?.pagination),
    };
  },
  async detail(id: string, tenantId?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/billing/invoices/${encodeURIComponent(id)}${query({ tenantId })}`,
      { signal },
    );
    return invoiceSchema.parse(data);
  },
  async lines(id: string, filters: InvoiceFilters, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/v1/billing/invoices/${encodeURIComponent(id)}/lines${query(filters)}`,
      { signal },
    );
    return {
      items: z.array(invoiceLineSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta?.pagination),
    };
  },
  pdf(id: string, tenantId?: string, signal?: AbortSignal) {
    return apiClient.downloadPdf(
      `/v1/billing/invoices/${encodeURIComponent(id)}/pdf${query({ tenantId })}`,
      { signal },
    );
  },
  async payment(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/billing/invoices/${encodeURIComponent(id)}/payment-instructions`,
      { signal },
    );
    return paymentSchema.parse(data);
  },
  async close(tenantId: string, month: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/billing/tenants/${encodeURIComponent(tenantId)}/periods/close`,
      { month },
      { signal },
    );
    return z.object({ invoiceIds: z.array(z.string().uuid()) }).parse(data);
  },
};
