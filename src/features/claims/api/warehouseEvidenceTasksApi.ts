import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { can, getEffectiveRoles } from '@/lib/accessPolicy';
import { getAuthScopeKey } from '@/lib/authScope';
import { signedStorageUrl } from '@/lib/signedStorageUrl';
import { apiClient, ApiError, type ApiResponse } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

const uuid = z.string().uuid();
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const taskSchema = z
  .object({
    claimId: uuid,
    fulfillmentOrderId: uuid,
    sequenceNo: z.number().int().positive(),
    incidentType: z.enum(['LOST', 'DAMAGED']),
    status: z.enum(['OPEN', 'INVESTIGATING']),
    version: z.number().int().positive(),
    canSubmitEvidence: z.boolean(),
  })
  .strict();
const taskPageSchema = z
  .object({ items: z.array(taskSchema).max(50), nextAfter: uuid.nullable() })
  .strict();
const presignSchema = z
  .object({
    id: uuid,
    method: z.literal('PUT'),
    uploadUrl: z.string().url(),
    expiresInSeconds: z.number().int().positive().max(900),
    headers: z
      .object({
        'Content-Type': z.enum(imageTypes),
        'x-amz-checksum-sha256': z.string().min(1),
      })
      .strict(),
  })
  .strict();
const confirmSchema = z
  .object({
    id: uuid,
    verifiedAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive(),
  })
  .strict();

const base = '/v1/claims/evidence-tasks';
const query = (warehouseId: string, after?: string) => {
  const params = new URLSearchParams({ warehouseId: uuid.parse(warehouseId) });
  if (after) params.set('after', uuid.parse(after));
  return `?${params.toString()}`;
};
const claimPath = (claimId: string) => `${base}/${encodeURIComponent(uuid.parse(claimId))}`;

function scopeGuard(warehouseId: string, capability: string, signal: AbortSignal) {
  const originalScope = getAuthScopeKey(useAuthStore.getState().user);
  const assertCurrent = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const user = useAuthStore.getState().user;
    if (!originalScope || getAuthScopeKey(user) !== originalScope) {
      throw new Error('CLAIM.SCOPE_CHANGED');
    }
    const roles = getEffectiveRoles(user?.roles ?? [], user?.actorScope);
    const assigned = user?.warehouseIds?.some(
      (assignment) => assignment.toLowerCase() === warehouseId.toLowerCase(),
    );
    if (!can(roles, capability) || !assigned) {
      throw new ApiError(
        'Warehouse evidence access is not available in this scope.',
        403,
        'AUTH.FORBIDDEN',
      );
    }
  };
  assertCurrent();
  return assertCurrent;
}

export function isSupportedWarehouseEvidenceImage(file: File): boolean {
  return (
    (imageTypes as readonly string[]).includes(file.type) && file.size >= 12 && file.size <= 5242880
  );
}

export interface WarehouseEvidenceTask {
  claimId: string;
  fulfillmentOrderId: string;
  sequenceNo: number;
  incidentType: 'LOST' | 'DAMAGED';
  status: 'OPEN' | 'INVESTIGATING';
  version: number;
  canSubmitEvidence: boolean;
}

export interface WarehouseEvidenceTaskPage {
  items: WarehouseEvidenceTask[];
  nextAfter: string | null;
}

export interface WarehouseEvidenceUploadInput {
  warehouseId: string;
  claimId: string;
  evidenceId: string;
  expectedVersion: number;
  file: File;
  signal: AbortSignal;
}

export interface WarehouseEvidenceConfirmResult {
  id: string;
  verifiedAt: string;
  version: number;
}

async function confirmEvidence(
  claimId: string,
  evidenceId: string,
  warehouseId: string,
  expectedVersion: number,
  signal: AbortSignal,
  assertScope: () => void,
): Promise<WarehouseEvidenceConfirmResult> {
  assertScope();
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `${claimPath(claimId)}/evidence/${encodeURIComponent(uuid.parse(evidenceId))}/confirm${query(warehouseId)}`,
    { expectedVersion },
    { signal, silent: true },
  );
  assertScope();
  const result = confirmSchema.parse(data);
  if (result.id !== evidenceId) throw new Error('Warehouse evidence identity mismatch');
  return result;
}

export const warehouseEvidenceTasksApi = {
  async listTasks(
    warehouseId: string,
    signal: AbortSignal,
    after?: string,
  ): Promise<WarehouseEvidenceTaskPage> {
    const assertScope = scopeGuard(warehouseId, 'claims.warehouseEvidence.view', signal);
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base}${query(warehouseId, after)}`,
      { signal, silent: true },
    );
    assertScope();
    return taskPageSchema.parse(data);
  },

  async uploadEvidence(
    input: WarehouseEvidenceUploadInput,
  ): Promise<WarehouseEvidenceConfirmResult> {
    const { warehouseId, claimId, evidenceId, expectedVersion, file, signal } = input;
    const assertScope = scopeGuard(warehouseId, 'claims.warehouseEvidence.submit', signal);
    const parsedClaimId = uuid.parse(claimId);
    const parsedEvidenceId = uuid.parse(evidenceId);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error('Invalid warehouse evidence version');
    }
    if (!isSupportedWarehouseEvidenceImage(file)) throw new Error('CLAIM.EVIDENCE_INVALID');

    const digest = sha256(new Uint8Array(await file.arrayBuffer()));
    assertScope();
    const checksumHex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const checksumBase64 = btoa(String.fromCharCode(...digest));
    let data: unknown;
    try {
      ({ data } = await apiClient.post<ApiResponse<unknown>>(
        `${claimPath(parsedClaimId)}/evidence/presign${query(warehouseId)}`,
        {
          expectedVersion,
          evidenceId: parsedEvidenceId,
          contentType: file.type,
          fileSizeBytes: file.size,
          sha256: checksumHex,
        },
        { signal, silent: true },
      ));
    } catch (error) {
      assertScope();
      if (error instanceof ApiError && error.code === 'CLAIM.EVIDENCE_FROZEN') {
        return confirmEvidence(
          parsedClaimId,
          parsedEvidenceId,
          warehouseId,
          expectedVersion,
          signal,
          assertScope,
        );
      }
      throw error;
    }

    assertScope();
    const presign = presignSchema.parse(data);
    if (
      presign.id !== parsedEvidenceId ||
      presign.headers['Content-Type'] !== file.type ||
      presign.headers['x-amz-checksum-sha256'] !== checksumBase64
    ) {
      throw new Error('Warehouse evidence upload metadata mismatch');
    }
    const uploadUrl = signedStorageUrl(presign.uploadUrl);
    assertScope();
    await apiClient.uploadSignedImage(uploadUrl, file, presign.headers, signal);
    assertScope();
    return confirmEvidence(
      parsedClaimId,
      parsedEvidenceId,
      warehouseId,
      expectedVersion,
      signal,
      assertScope,
    );
  },
};

export { taskPageSchema as warehouseEvidenceTaskPageSchema };
