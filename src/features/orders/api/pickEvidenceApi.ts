import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { signedStorageUrl } from '@/lib/signedStorageUrl';
import { apiClient, type ApiResponse } from '@/services/apiClient';

const base = '/v1/warehouse-ops/pick-lines';
const key = z.string().min(1).max(500);
const types = ['image/png', 'image/jpeg', 'image/webp'] as const;
export async function uploadPickEvidence(
  warehouseId: string,
  lineId: string,
  file: File,
  signal: AbortSignal,
): Promise<string> {
  if (
    !(types as readonly string[]).includes(file.type) ||
    file.size < 12 ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error('Invalid evidence image');
  }
  const hash = sha256(new Uint8Array(await file.arrayBuffer()));
  if (signal.aborted) throw new Error('Upload cancelled');
  const digest = Array.from(hash, (v) => v.toString(16).padStart(2, '0')).join('');
  const route = `${base}/${encodeURIComponent(lineId)}/evidence`;
  const query = `?warehouseId=${encodeURIComponent(warehouseId)}`;
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `${route}/presign${query}`,
    { contentType: file.type, fileSizeBytes: file.size, sha256: digest },
    { signal, silent: true },
  );
  const upload = z
    .object({
      evidenceKey: key,
      upload: z
        .object({
          method: z.literal('PUT'),
          uploadUrl: z.string(),
          expiresInSeconds: z.number().int().positive().max(900),
          headers: z
            .object({ 'Content-Type': z.enum(types), 'x-amz-checksum-sha256': z.string() })
            .strict(),
        })
        .strict(),
    })
    .strict()
    .parse(data);
  if (
    upload.upload.headers['Content-Type'] !== file.type ||
    upload.upload.headers['x-amz-checksum-sha256'] !== btoa(String.fromCharCode(...hash))
  ) {
    throw new Error('Upload checksum mismatch');
  }
  await apiClient.uploadSignedImage(upload.upload.uploadUrl, file, upload.upload.headers, signal);
  const confirmed = await apiClient.post<ApiResponse<unknown>>(
    `${route}/confirm${query}`,
    { evidenceKey: upload.evidenceKey },
    { signal, silent: true },
  );
  const result = z
    .object({ evidenceKey: key, verified: z.literal(true) })
    .strict()
    .parse(confirmed.data);
  if (result.evidenceKey !== upload.evidenceKey) throw new Error('Evidence identity mismatch');
  return result.evidenceKey;
}
export async function downloadPickEvidence(
  warehouseId: string,
  lineId: string,
  evidenceKey: string,
  signal: AbortSignal,
) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `${base}/${encodeURIComponent(lineId)}/evidence/download?warehouseId=${encodeURIComponent(warehouseId)}`,
    { evidenceKey },
    { signal, silent: true },
  );
  const result = z
    .object({ downloadUrl: z.string(), expiresInSeconds: z.number().int().positive().max(300) })
    .strict()
    .parse(data);
  return signedStorageUrl(result.downloadUrl);
}
