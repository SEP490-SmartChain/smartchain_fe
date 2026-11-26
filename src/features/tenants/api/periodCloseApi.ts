import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const root = '/v1/billing';

const uuid = z.string().uuid();

const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNo: z.string(),
  documentType: z.string(),
  documentStatus: z.string(),
  periodKey: z.string(),
  totalVnd: z.string(),
  outstandingVnd: z.string(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'EXPIRED', 'LEDGER']),
});

const sellerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});

const previewSchema = z.object({
  month: z.string(),
  alreadyClosed: z.boolean(),
  billableEventCount: z.number(),
  billableTotalVnd: z.string(),
  adjustmentCount: z.number(),
  adjustmentTotalVnd: z.string(),
  hasMore: z.boolean(),
});

export type PeriodInvoice = z.infer<typeof invoiceSchema>;
export type PeriodPreview = z.infer<typeof previewSchema>;
export type PeriodSeller = z.infer<typeof sellerSchema>;

export const periodCloseApi = {
  /** Active sellers for the accountant's seller picker. */
  async sellers(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/sellers`, {
      signal,
      silent: true,
    });
    return z.array(sellerSchema).parse(response.data);
  },
  /** Read-only preview of what closing one seller month would issue. */
  async preview(tenantId: string, month: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${root}/tenants/${encodeURIComponent(uuid.parse(tenantId))}/periods/${encodeURIComponent(month)}/preview`,
      { signal, silent: true },
    );
    return previewSchema.parse(response.data);
  },
  /** Accountant closes one completed month for one seller. Replays return the same invoices. */
  async close(tenantId: string, month: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${root}/tenants/${encodeURIComponent(uuid.parse(tenantId))}/periods/close`,
      { month },
      { silent: true },
    );
    return z.object({ invoiceIds: z.array(z.string().uuid()) }).parse(response.data);
  },
  /** Invoice PDF, rendered on demand for the seller the accountant selected. */
  pdf(invoiceId: string, tenantId: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ tenantId: uuid.parse(tenantId) });
    return apiClient.downloadPdf(
      `${root}/invoices/${encodeURIComponent(uuid.parse(invoiceId))}/pdf?${params}`,
      { signal },
    );
  },
  /** Invoices of one seller, optionally limited to one month. */
  async invoices(tenantId: string, month: string | null, signal?: AbortSignal) {
    const params = new URLSearchParams({ tenantId: uuid.parse(tenantId) });
    if (month) params.set('month', month);
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/invoices?${params}`, {
      signal,
      silent: true,
    });
    return z.array(invoiceSchema).parse(response.data);
  },
};
