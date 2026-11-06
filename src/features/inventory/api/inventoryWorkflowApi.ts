import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
const countLine = z
  .object({
    id: z.uuid(),
    sku: z.string(),
    lotCode: z.string().optional(),
    binCode: z.string().optional(),
    observedQty: z.number().int().nullable(),
    reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    hasEvidence: z.boolean(),
    expectedQty: z.number().int().optional(),
    varianceQty: z.number().int().nullable().optional(),
    variancePercent: z.number().finite().nullable().optional(),
  })
  .strict();
export const countSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    status: z.enum(['PLANNED', 'COUNTING', 'REVIEW', 'APPROVED', 'POSTED']),
    reviewReason: z.string().nullable(),
    round: z.number().int().positive().optional(),
    createReason: z.string().nullable().optional(),
    countWindowStart: z.iso.datetime({ offset: true }).nullable().optional(),
    countWindowEnd: z.iso.datetime({ offset: true }).nullable().optional(),
    snapshotAt: z.iso.datetime({ offset: true }).optional(),
    assignedToPlatformUserId: z.uuid().optional(),
    lines: z.array(countLine),
  })
  .strict();
export const disposalSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'EXECUTED']),
    qty: z.number().int(),
    executedQty: z.number().int(),
    reason: z.string().nullable(),
    reviewReason: z.string().nullable(),
    authorizationMode: z.enum(['CONSENT', 'POLICY']),
    policyExceptionCode: z.string().nullable(),
    policyExpiresAt: z.string().nullable(),
    sku: z.string().optional(),
    binCode: z.string().optional(),
    lotCode: z.string(),
    hasEvidence: z.boolean(),
  })
  .strict();
export const putbackSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    status: z.enum(['OPEN', 'ASSIGNED', 'COMPLETED', 'CANCELLED']),
    qty: z.number().int(),
    binCode: z.string(),
    lotCode: z.string(),
    sku: z.string(),
  })
  .strict();
export type WorkflowCount = z.infer<typeof countSchema>;
export type WorkflowDisposal = z.infer<typeof disposalSchema>;
export type WorkflowPutback = z.infer<typeof putbackSchema>;
const result = z.object({ id: z.uuid(), version: z.number().int().positive(), status: z.string() });
const base = (wh: string) => `/v1/warehouses/${z.uuid().parse(wh)}/inventory-workflows`;
const putbackOptionsSchema = z.object({
  sources: z.array(
    z.object({ id: z.uuid(), sku: z.string(), lotCode: z.string(), qty: z.number().int() }),
  ),
  bins: z.array(
    z.object({ id: z.uuid(), code: z.string(), zoneType: z.enum(['STORAGE', 'QUARANTINE']) }),
  ),
  staff: z.array(z.object({ id: z.uuid(), fullName: z.string() })),
});
export type PutbackOptions = z.infer<typeof putbackOptionsSchema>;
export const inventoryWorkflowApi = {
  async putbackOptions(wh: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/putback-options`, {
      signal,
      silent: true,
    });
    return putbackOptionsSchema.parse(data);
  },
  async counts(wh: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/counts`, {
      params: cursor ? { cursor } : undefined,
      signal,
      silent: true,
    });
    return z.object({ items: z.array(countSchema), nextCursor: z.uuid().nullable() }).parse(data);
  },
  async disposals(wh: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/disposals`, {
      params: cursor ? { cursor } : undefined,
      signal,
      silent: true,
    });
    return z
      .object({ items: z.array(disposalSchema), nextCursor: z.uuid().nullable() })
      .parse(data);
  },
  async putbacks(wh: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(wh)}/putbacks`, {
      params: cursor ? { cursor } : undefined,
      signal,
      silent: true,
    });
    return z.object({ items: z.array(putbackSchema), nextCursor: z.uuid().nullable() }).parse(data);
  },
  async command(wh: string, path: string, input: unknown) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(`${base(wh)}/${path}`, input, {
      silent: true,
    });
    return result.parse(data);
  },
  async evidence(wh: string, path: string, file: File, uploadBase = base(wh)) {
    const revision = useAuthStore.getState().revision;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size < 12 ||
      file.size > 5242880
    ) {
      throw new Error('INVALID_EVIDENCE');
    }
    const bytes = await file.arrayBuffer();
    const digest = globalThis.crypto?.subtle
      ? await crypto.subtle.digest('SHA-256', bytes)
      : sha256(new Uint8Array(bytes));
    const evidence = {
      contentType: file.type,
      fileSizeBytes: file.size,
      sha256: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(''),
    };
    const { data } = await apiClient.post<ApiResponse<unknown>>(`${uploadBase}/${path}`, evidence, {
      silent: true,
    });
    const upload = z
      .object({
        method: z.literal('PUT'),
        uploadUrl: z.url(),
        expiresInSeconds: z.number(),
        headers: z.record(z.string(), z.string()),
      })
      .parse(data);
    if (useAuthStore.getState().revision !== revision) throw new Error('AUTH_SCOPE_CHANGED');
    await apiClient.uploadSignedImage(upload.uploadUrl, file, upload.headers);
    if (useAuthStore.getState().revision !== revision) throw new Error('AUTH_SCOPE_CHANGED');
    return evidence;
  },
  async download(wh: string, kind: 'counts' | 'disposals', id: string) {
    const revision = useAuthStore.getState().revision;
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base(wh)}/${kind}/evidence/${z.uuid().parse(id)}`,
      { silent: true },
    );
    if (useAuthStore.getState().revision !== revision) throw new Error('AUTH_SCOPE_CHANGED');
    return z.object({ downloadUrl: z.url(), expiresInSeconds: z.number() }).parse(data);
  },
};
