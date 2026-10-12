import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const planSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  versionNo: z.number().int().positive(),
  monthlyFeeVnd: money,
  salesOrderAllowance: z.number().int().nonnegative(),
  warehouseAllowance: z.number().int().positive(),
  storageAllowanceM3: z.string(),
  agreementId: z.string().uuid().nullable(),
  agreementVersionRef: z.string().nullable(),
});
export const signingSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  status: z.enum([
    'PREPARING',
    'IN_PROGRESS',
    'COMPLETED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED',
    'UNKNOWN',
    'FAILED',
  ]),
  errorCode: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  hasEvidence: z.boolean(),
});
const contractSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contractKind: z.string(),
  status: z.string(),
  agreementVersionRef: z.string(),
  planVersionId: z.string().uuid(),
  depositRequiredVnd: money,
  creditLimitVnd: money,
  effectiveFrom: z.string(),
  version: z.number().int().positive(),
  acceptedAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
});
const contractsSchema = z.object({
  currentContractId: z.string().uuid().nullable(),
  contracts: z.array(contractSchema),
  signingRequests: z.array(signingSchema),
  serviceStatus: z.string(),
  serviceVersion: z.number().int().nonnegative(),
});
const invoicesSchema = z.object({
  invoices: z.array(
    z.object({
      id: z.string().uuid(),
      contractId: z.string().uuid(),
      invoiceNo: z.string(),
      documentType: z.string(),
      documentStatus: z.string(),
      paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'EXPIRED']),
      totalVnd: money,
      paidVnd: money,
      dueOn: z.string(),
      obligations: z.array(
        z.object({
          id: z.string().uuid(),
          purpose: z.string(),
          amountDueVnd: money,
          paidVnd: money,
          status: z.string(),
        }),
      ),
    }),
  ),
});
const catalogSchema = z.object({ plans: z.array(planSchema), signingConfigured: z.boolean() });

export type CommercialPlan = z.infer<typeof planSchema>;
export type SigningRequest = z.infer<typeof signingSchema>;
export type SellerCommercialState = z.infer<typeof contractsSchema>;
export type OnboardingInvoice = z.infer<typeof invoicesSchema>['invoices'][number];

const tariffSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  versionNo: z.number().int().positive(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
});
const termsSchema = z.object({
  plans: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      code: z.string(),
      versionNo: z.number().int().positive(),
      monthlyFeeVnd: money,
    }),
  ),
  serviceTariffs: z.array(tariffSchema),
  freightTariffs: z.array(tariffSchema),
});
export type PublishedCommercialTerms = z.infer<typeof termsSchema>;
const quotaSchema = z.object({
  tenantId: z.string().uuid(),
  serviceStatus: z.string(),
  plan: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      code: z.string(),
      versionNo: z.number().int().positive(),
      monthlyFeeVnd: money,
      warehouseAllowance: z.number().int().positive(),
      salesOrderAllowance: z.number().int().nonnegative(),
      storageAllowanceM3: z.string(),
    })
    .nullable(),
  usage: z
    .object({
      periodFrom: z.string(),
      periodToExclusive: z.string(),
      salesOrdersCreated: z.number().int().nonnegative(),
      occupiedWarehouses: z.number().int().nonnegative(),
      knownStockVolumeM3: z.string(),
      storageUsageComplete: z.boolean(),
    })
    .nullable(),
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      planVersionId: z.string().uuid(),
      status: z.string(),
      effectiveOn: z.string(),
    }),
  ),
});
export type CommercialQuota = z.infer<typeof quotaSchema>;
export interface PlanVersionInput {
  expectedVersionNo: number;
  code: 'BASIC' | 'STANDARD' | 'ENTERPRISE';
  name: string;
  monthlyFeeVnd: string;
  salesOrderAllowance: number;
  warehouseAllowance: number;
  storageAllowanceM3: string;
  includedServices: string[];
  effectiveFrom: string;
}
export interface AgreementInput {
  planVersionId: string;
  serviceTariffVersionId: string;
  freightTariffVersionId: string;
  versionRef: string;
  signerRole: string;
  templateId?: string;
  compositionMode: 'EXISTING_FIELDS' | 'ORCA_REFERENCE_16_V1';
  depositRequiredVnd: string;
  creditLimitVnd: string;
  claimCapVnd: string;
}

/** A signing URL is a short-lived credential. Never put it in localStorage, logs or a shared cache. */
export function validatedSigningUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['signnow.com', 'app.signnow.com', 'app-eval.signnow.com'].includes(url.hostname) ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password
  ) {
    throw new Error('Invalid signing URL');
  }
  return url.href;
}

const downloadSchema = z.object({
  downloadUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive().max(300),
});
export const commercialApi = {
  async finalizeClosure(
    tenantId: string,
    expectedVersion: number,
    reason: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/finalize-closure`,
      { expectedVersion, reason },
      { signal, silent: true },
    );
    return z.object({ contractId: z.string().uuid(), status: z.string() }).parse(data);
  },
  async serviceStatus(
    tenantId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    expectedVersion: number,
    reason: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/service-status`,
      { status, expectedVersion, reason },
      { signal, silent: true },
    );
    return z
      .object({ serviceStatus: z.string(), serviceVersion: z.number().int().positive() })
      .parse(data);
  },
  async reconcile(tenantId: string, id: string, documentId: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/signing-requests/${encodeURIComponent(id)}/reconcile`,
      { documentId },
      { signal, silent: true },
    );
    return z.object({ queued: z.boolean() }).parse(data);
  },
  async preview(agreementId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/commercial/agreements/${encodeURIComponent(agreementId)}/preview`,
      { signal, silent: true },
    );
    return downloadSchema.parse(data);
  },
  async originalPdf(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/commercial/signing-requests/${encodeURIComponent(id)}/original-pdf`,
      { signal, silent: true },
    );
    return downloadSchema.parse(data);
  },
  async contractPdf(tenantId: string, id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/contracts/${encodeURIComponent(id)}/signed-pdf`,
      { signal, silent: true },
    );
    return downloadSchema.parse(data);
  },
  async quotas(tenantId?: string, signal?: AbortSignal) {
    const path = tenantId
      ? `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/quotas`
      : '/v1/commercial/quotas';
    const { data } = await apiClient.get<ApiResponse<unknown>>(path, { signal, silent: true });
    return quotaSchema.parse(data);
  },
  async requestPlanChange(
    planVersionId: string,
    expectedVersion: number,
    operationKey: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/plan-changes',
      { planVersionId, expectedVersion, operationKey },
      { signal, silent: true },
    );
    return z
      .object({ id: z.string().uuid(), status: z.string(), effectiveOn: z.string() })
      .parse(data);
  },
  async schedulePlanChange(tenantId: string, id: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/plan-changes/${encodeURIComponent(id)}/schedule`,
      {},
      { signal, silent: true },
    );
    return z
      .object({ id: z.string().uuid(), status: z.string(), effectiveOn: z.string() })
      .parse(data);
  },
  async requestClosure(expectedVersion: number, reason: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/closure-requests',
      { expectedVersion, reason },
      { signal, silent: true },
    );
    return z.object({ contractId: z.string().uuid(), status: z.string() }).parse(data);
  },
  async publishedTerms(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/commercial/published-terms', {
      signal,
      silent: true,
    });
    return termsSchema.parse(data);
  },
  async createPlan(input: PlanVersionInput, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/plan-versions',
      input,
      { signal, silent: true },
    );
    return z.object({ id: z.string().uuid() }).parse(data);
  },
  async publishAgreement(input: AgreementInput, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/agreements',
      input,
      { signal, silent: true },
    );
    return z.object({ id: z.string().uuid(), versionRef: z.string() }).parse(data);
  },
  async plans(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/commercial/plans', {
      signal,
      silent: true,
    });
    return catalogSchema.parse(data);
  },
  async contracts(tenantId?: string, signal?: AbortSignal) {
    const path = tenantId
      ? `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/contracts`
      : '/v1/commercial/contracts';
    const { data } = await apiClient.get<ApiResponse<unknown>>(path, { signal, silent: true });
    return contractsSchema.parse(data);
  },
  async start(
    agreementId: string,
    agreementVersionRef: string,
    operationKey: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/signing-requests',
      { agreementId, agreementVersionRef, operationKey },
      { signal, silent: true },
    );
    return signingSchema.parse(data);
  },
  async session(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/signing-requests/${encodeURIComponent(id)}/session`,
      {},
      { signal, silent: true },
    );
    const parsed = z
      .object({ signingUrl: z.string(), expiresInSeconds: z.number().int().positive().max(900) })
      .parse(data);
    return { ...parsed, signingUrl: validatedSigningUrl(parsed.signingUrl) };
  },
  async invoices(signal?: AbortSignal, tenantId?: string) {
    const path = tenantId
      ? `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/invoices`
      : '/v1/commercial/invoices';
    const { data } = await apiClient.get<ApiResponse<unknown>>(path, {
      signal,
      silent: true,
    });
    return invoicesSchema.parse(data).invoices;
  },
  async financialSellers(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/commercial/financial-sellers', {
      signal,
      silent: true,
    });
    return z
      .object({ sellers: z.array(z.object({ id: z.string().uuid(), name: z.string() })) })
      .parse(data).sellers;
  },
  async createCustom(
    tenantId: string,
    input: {
      planVersionId: string;
      serviceTariffVersionId: string;
      freightTariffVersionId: string;
      agreementVersionRef: string;
      effectiveFrom: string;
      depositRequiredVnd: string;
      creditLimitVnd: string;
      claimCapVnd: string;
    },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/custom-contracts`,
      input,
      { signal, silent: true },
    );
    return contractSchema.parse(data);
  },
  async signedCustom(
    tenantId: string,
    contractId: string,
    file: File,
    expectedVersion: number,
    signal?: AbortSignal,
  ) {
    const form = new FormData();
    form.append('file', file);
    form.append('expectedVersion', String(expectedVersion));
    const { data } = await apiClient.uploadForm<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/contracts/${encodeURIComponent(contractId)}/signed-evidence`,
      form,
      { signal, silent: true },
    );
    return z.object({ version: z.number().int().positive() }).parse(data);
  },
  async confirmCustom(
    tenantId: string,
    contractId: string,
    expectedVersion: number,
    reason: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/contracts/${encodeURIComponent(contractId)}/confirm`,
      { expectedVersion, reason },
      { signal, silent: true },
    );
    return contractSchema.parse(data);
  },
  async bankEvidence(tenantId: string, invoiceId: string, file: File, signal?: AbortSignal) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.uploadForm<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/invoices/${encodeURIComponent(invoiceId)}/bank-evidence`,
      form,
      { signal, silent: true },
    );
    return z
      .object({ evidenceKey: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(data);
  },
  async postBank(
    tenantId: string,
    invoiceId: string,
    input: {
      operationKey: string;
      bankReference: string;
      amountVnd: string;
      receivedAt: string;
      evidenceKey: string;
    },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/invoices/${encodeURIComponent(invoiceId)}/bank-receipts`,
      input,
      { signal, silent: true },
    );
    return z
      .object({
        receiptId: z.string().uuid(),
        unallocatedVnd: money,
        serviceActivated: z.boolean(),
      })
      .parse(data);
  },
  async inquiries(tenantId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/commercial/tenants/${encodeURIComponent(tenantId)}/custom-inquiries`,
      { signal, silent: true },
    );
    return z
      .object({
        inquiries: z.array(
          z.object({
            operationKey: z.string().uuid(),
            message: z.string(),
            submittedAt: z.string().datetime(),
          }),
        ),
      })
      .parse(data).inquiries;
  },
  async inquire(message: string, operationKey: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/commercial/custom-inquiries',
      { message, operationKey },
      { signal, silent: true },
    );
    return z.object({ operationKey: z.string(), submittedAt: z.string().datetime() }).parse(data);
  },
  async evidence(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/commercial/signing-requests/${encodeURIComponent(id)}/signed-pdf`,
      { signal, silent: true },
    );
    return z
      .object({
        downloadUrl: z.string().url(),
        expiresInSeconds: z.number().int().positive().max(300),
      })
      .parse(data);
  },
};
