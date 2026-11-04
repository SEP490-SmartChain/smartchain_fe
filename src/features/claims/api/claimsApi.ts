import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { getAuthScopeKey } from '@/lib/authScope';
import { signedStorageUrl } from '@/lib/signedStorageUrl';
import { apiClient, ApiError, type ApiResponse } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

function evidenceScopeGuard(signal: AbortSignal) {
  const original = getAuthScopeKey(useAuthStore.getState().user);
  return () => {
    if (signal.aborted || !original || getAuthScopeKey(useAuthStore.getState().user) !== original) {
      throw new Error('CLAIM.SCOPE_CHANGED');
    }
  };
}

const uuid = z.string().uuid();
const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const timestamp = z.string().datetime({ offset: true });
export const claimStatusSchema = z.enum([
  'OPEN',
  'INVESTIGATING',
  'APPROVED',
  'REJECTED',
  'CREDITED',
]);
export const responsibilitySchema = z.enum(['ORCA_WAREHOUSE', 'CARRIER', 'SELLER']);
const creditState = z.enum(['NOT_APPROVED', 'PENDING', 'POSTED', 'NOT_DUE']);
export const claimCommandSchema = z
  .object({
    id: uuid,
    version: z.number().int().positive(),
    status: claimStatusSchema,
    approvedAmountVnd: money.nullable(),
    creditState,
  })
  .strict();
export const claimEvidenceSchema = z
  .object({
    id: uuid,
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    fileSizeBytes: z.number().int().min(12).max(5242880),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    verifiedAt: timestamp.nullable(),
    createdAt: timestamp,
    canConfirm: z.boolean(),
  })
  .strict();
export const claimSchema = claimCommandSchema
  .extend({
    tenantId: uuid,
    warehouseId: uuid,
    warehouseName: z.string(),
    fulfillmentOrderId: uuid,
    fulfillmentItemId: uuid.nullable(),
    orderReference: z.string(),
    sequenceNo: z.number().int().positive(),
    sku: z.string().nullable(),
    productName: z.string().nullable(),
    returnOrderId: uuid.nullable(),
    incidentType: z.enum(['LOST', 'DAMAGED']).nullable(),
    description: z.string().nullable(),
    responsibility: responsibilitySchema.nullable(),
    affectedQty: z.number().int().positive(),
    declaredCostVnd: money,
    declaredCostSource: z.enum(['ORDER_SNAPSHOT', 'SELLER_DECLARED', 'OPS_DECLARED']).nullable(),
    contractId: uuid.nullable(),
    contractCapVnd: money,
    maximumCreditVnd: money,
    investigationNote: z.string().nullable(),
    investigationCompletedAt: timestamp.nullable(),
    decisionNote: z.string().nullable(),
    carrierDisputeId: uuid.nullable(),
    carrierDisputeStatus: z.string().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    canAddEvidence: z.boolean(),
    canInvestigate: z.boolean(),
    canDecide: z.boolean(),
    evidence: z.array(claimEvidenceSchema).max(10),
    history: z
      .array(
        z
          .object({
            operationId: uuid,
            kind: z.enum(['OPEN', 'INVESTIGATE', 'APPROVE', 'REJECT']),
            actorScope: z.enum(['TENANT', 'PLATFORM']),
            note: z.string(),
            createdAt: timestamp,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export const claimSourceSchema = z
  .object({
    fulfillmentItemId: uuid,
    fulfillmentOrderId: uuid,
    tenantId: uuid,
    warehouseId: uuid,
    orderReference: z.string(),
    sequenceNo: z.number().int().positive(),
    sku: z.string().nullable(),
    productName: z.string().nullable(),
    parcelQty: z.number().int().positive(),
    remainingQty: z.number().int().nonnegative(),
    declaredCostVnd: money.nullable(),
  })
  .strict();
export type Claim = z.infer<typeof claimSchema>;
export type ClaimSource = z.infer<typeof claimSourceSchema>;
export type ClaimCommandResult = z.infer<typeof claimCommandSchema>;
export interface ClaimCreateInput {
  fulfillmentItemId: string;
  affectedQty: number;
  incidentType: 'LOST' | 'DAMAGED';
  note: string;
  declaredCostVnd?: string;
  returnOrderId?: string;
}
export interface ClaimInvestigationInput {
  expectedVersion: number;
  responsibility: z.infer<typeof responsibilitySchema>;
  complete: boolean;
  note: string;
}
export interface ClaimDecisionInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  note: string;
}
export interface ClaimScope {
  warehouseId?: string;
}
function query(scope: ClaimScope, params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  if (scope.warehouseId) q.set('warehouseId', scope.warehouseId);
  for (const [key, value] of Object.entries(params)) if (value) q.set(key, value);
  return q.size ? `?${q.toString()}` : '';
}
const pageSchema = z
  .object({ items: z.array(claimSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
const sourcePageSchema = z
  .object({ items: z.array(claimSourceSchema).max(50), nextCursor: uuid.nullable() })
  .strict();
const base = '/v1/claims';
const item = (id: string) => `${base}/${encodeURIComponent(uuid.parse(id))}`;
export const claimsApi = {
  async warehouses(signal: AbortSignal) {
    const items: Array<{ id: string; name: string }> = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const response = await apiClient.get<ApiResponse<unknown>>('/v1/warehouses', {
        params: { limit: '50', ...(cursor ? { cursor } : {}) },
        signal,
        silent: true,
      });
      items.push(...z.array(z.object({ id: uuid, name: z.string() })).parse(response.data));
      cursor = response.meta.pagination?.nextCursor ?? undefined;
      if (!cursor) break;
    }
    return items;
  },
  async list(scope: ClaimScope, signal: AbortSignal, after?: string, status?: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base}${query(scope, { after, status })}`,
      { signal, silent: true },
    );
    return pageSchema.parse(data);
  },
  async sources(scope: ClaimScope, signal: AbortSignal, search?: string, after?: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base}/options${query(scope, { search, after })}`,
      { signal, silent: true },
    );
    return sourcePageSchema.parse(data);
  },
  async get(id: string, scope: ClaimScope, signal: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${item(id)}${query(scope)}`, {
      signal,
      silent: true,
    });
    const result = claimSchema.parse(data);
    if (result.id !== id) throw new Error('Claim identity mismatch');
    return result;
  },
  async create(
    input: ClaimCreateInput & { operationId: string },
    scope: ClaimScope,
    signal: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(`${base}${query(scope)}`, input, {
      signal,
      silent: true,
    });
    const result = claimCommandSchema.parse(data);
    if (result.id !== input.operationId) throw new Error('Claim identity mismatch');
    return result;
  },
  async investigate(
    id: string,
    input: ClaimInvestigationInput & { operationId: string },
    scope: ClaimScope,
    signal: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${item(id)}/investigation${query(scope)}`,
      input,
      { signal, silent: true },
    );
    const result = claimCommandSchema.parse(data);
    if (result.id !== id) throw new Error('Claim identity mismatch');
    return result;
  },
  async decide(
    id: string,
    input: ClaimDecisionInput & { operationId: string },
    scope: ClaimScope,
    signal: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${item(id)}/decision${query(scope)}`,
      input,
      { signal, silent: true },
    );
    const result = claimCommandSchema.parse(data);
    if (result.id !== id) throw new Error('Claim identity mismatch');
    return result;
  },
  async upload(
    id: string,
    version: number,
    file: File,
    evidenceId: string,
    scope: ClaimScope,
    signal: AbortSignal,
  ) {
    const assertScope = evidenceScopeGuard(signal);
    assertScope();
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size < 12 ||
      file.size > 5242880
    ) {
      throw new Error('CLAIM.EVIDENCE_INVALID');
    }
    const digest = sha256(new Uint8Array(await file.arrayBuffer()));
    assertScope();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const checksum = Array.from(digest, (v) => v.toString(16).padStart(2, '0')).join('');
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${item(id)}/evidence/presign${query(scope)}`,
      {
        expectedVersion: version,
        evidenceId,
        contentType: file.type,
        fileSizeBytes: file.size,
        sha256: checksum,
      },
      { signal, silent: true },
    );
    const signed = z
      .object({
        id: uuid,
        method: z.literal('PUT'),
        uploadUrl: z.string(),
        expiresInSeconds: z.number().int().positive().max(900),
        headers: z
          .object({
            'Content-Type': z.enum(['image/jpeg', 'image/png', 'image/webp']),
            'x-amz-checksum-sha256': z.string(),
          })
          .strict(),
      })
      .strict()
      .parse(data);
    if (
      signed.id !== evidenceId ||
      signed.headers['Content-Type'] !== file.type ||
      signed.headers['x-amz-checksum-sha256'] !== btoa(String.fromCharCode(...digest))
    ) {
      throw new Error('CLAIM.EVIDENCE_INVALID');
    }
    assertScope();
    await apiClient.uploadSignedImage(
      signedStorageUrl(signed.uploadUrl),
      file,
      signed.headers,
      signal,
    );
    assertScope();
    return this.confirm(id, evidenceId, version, scope, signal);
  },
  async confirm(
    id: string,
    evidenceId: string,
    version: number,
    scope: ClaimScope,
    signal: AbortSignal,
  ) {
    const assertScope = evidenceScopeGuard(signal);
    assertScope();
    let data: unknown;
    try {
      ({ data } = await apiClient.post<ApiResponse<unknown>>(
        `${item(id)}/evidence/${encodeURIComponent(uuid.parse(evidenceId))}/confirm${query(scope)}`,
        { expectedVersion: version },
        { signal, silent: true },
      ));
    } catch (error) {
      assertScope();
      if (error instanceof ApiError && error.status < 500) throw error;
      let current: Claim;
      try {
        current = await this.get(id, scope, signal);
      } catch (lookupError) {
        assertScope();
        if (lookupError instanceof ApiError && [401, 403, 404].includes(lookupError.status)) {
          throw lookupError;
        }
        throw error;
      }
      assertScope();
      const confirmed = current.evidence.find(
        (photo) => photo.id === evidenceId && photo.verifiedAt,
      );
      if (confirmed?.verifiedAt) return { id: evidenceId, verifiedAt: confirmed.verifiedAt };
      throw error;
    }
    assertScope();
    const result = z.object({ id: uuid, verifiedAt: timestamp }).strict().parse(data);
    if (result.id !== evidenceId) throw new Error('Evidence identity mismatch');
    return result;
  },
  async download(id: string, evidenceId: string, scope: ClaimScope, signal: AbortSignal) {
    const assertScope = evidenceScopeGuard(signal);
    assertScope();
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${item(id)}/evidence/${encodeURIComponent(uuid.parse(evidenceId))}/download${query(scope)}`,
      { signal, silent: true },
    );
    const result = z
      .object({ downloadUrl: z.string(), expiresInSeconds: z.number().int().positive().max(300) })
      .strict()
      .parse(data);
    assertScope();
    return signedStorageUrl(result.downloadUrl);
  },
  async cancel(id: string, evidenceId: string, scope: ClaimScope, signal: AbortSignal) {
    const { data } = await apiClient.delete<ApiResponse<unknown>>(
      `${item(id)}/evidence/${encodeURIComponent(uuid.parse(evidenceId))}${query(scope)}`,
      { signal, silent: true },
    );
    const result = z
      .object({ id: uuid, cancelled: z.literal(true) })
      .strict()
      .parse(data);
    if (result.id !== evidenceId) throw new Error('Evidence identity mismatch');
    return result;
  },
};
