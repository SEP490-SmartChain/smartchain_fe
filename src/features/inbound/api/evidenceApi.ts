import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { signedStorageUrl } from '@/lib/signedStorageUrl';
import { apiClient, type ApiResponse } from '@/services/apiClient';

const privateUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    );
  });
export const evidenceSchema = z
  .object({
    id: z.string().uuid(),
    receivingRecordId: z.string().uuid().nullable(),
    receiptId: z.string().uuid().optional(),
    note: z.string().max(1000).optional(),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']),
    fileSizeBytes: z
      .number()
      .int()
      .min(12)
      .max(50 * 1024 * 1024),
    createdAt: z.string().datetime(),
    verifiedAt: z.string().datetime().nullable(),
    canDelete: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fileSizeBytes <= (value.contentType.startsWith('video/') ? 50 : 5) * 1024 * 1024,
  )
  .refine((value) => value.receivingRecordId !== null || Boolean(value.receiptId))
  .refine(
    (value) => !value.verifiedAt || Date.parse(value.verifiedAt) >= Date.parse(value.createdAt),
  );
export type ReceiptEvidence = z.infer<typeof evidenceSchema>;
const signedSchema = z
  .object({
    method: z.literal('PUT'),
    uploadUrl: privateUrl,
    expiresInSeconds: z.number().int().min(1).max(900),
    headers: z
      .object({
        'Content-Type': z.enum([
          'image/png',
          'image/jpeg',
          'image/webp',
          'video/mp4',
          'video/webm',
        ]),
        'x-amz-checksum-sha256': z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
      })
      .strict(),
  })
  .strict();
const intentSchema = z
  .object({ evidence: evidenceSchema, upload: signedSchema.nullable() })
  .strict();
export interface EvidenceIntentInput {
  operationKey: string;
  note?: string;
  expectedRound?: number;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm';
  fileSizeBytes: number;
  sha256: string;
}
const path = (warehouse: string, asn: string, record: string | null) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving${record === null ? '' : `/records/${encodeURIComponent(record)}`}/evidence`;
function sameRecord(photo: ReceiptEvidence, record: string | null) {
  if (
    photo.receivingRecordId !== record ||
    (record !== null && photo.contentType.startsWith('video/'))
  ) {
    throw new Error('Image belongs to another receiving record');
  }
  return photo;
}
export async function imageIntent(file: File, operationKey: string): Promise<EvidenceIntentInput> {
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) ||
    file.size < 12 ||
    file.size > (file.type.startsWith('video/') ? 50 : 5) * 1024 * 1024
  ) {
    throw new Error('Invalid receipt image');
  }
  const contentType = z
    .enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
    .parse(file.type);
  const bytes = await file.arrayBuffer();
  // WebCrypto is unavailable on LAN HTTP origins; use the same SHA-256 with a vetted implementation.
  const hash = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    : sha256(new Uint8Array(bytes));
  return {
    operationKey,
    contentType,
    fileSizeBytes: file.size,
    sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}
export const evidenceApi = {
  async list(warehouse: string, asn: string, record: string | null, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path(warehouse, asn, record), {
      silent: true,
      signal,
    });
    const result = z
      .object({ items: z.array(evidenceSchema).max(10) })
      .strict()
      .parse(data);
    if (new Set(result.items.map((photo) => photo.id)).size !== result.items.length) {
      throw new Error('Duplicate receipt image identity');
    }
    return result.items.map((photo) => sameRecord(photo, record));
  },
  async presign(
    warehouse: string,
    asn: string,
    record: string | null,
    input: EvidenceIntentInput,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouse, asn, record)}/presign`,
      input,
      { silent: true, signal },
    );
    const result = intentSchema.parse(data);
    sameRecord(result.evidence, record);
    if (
      result.evidence.contentType !== input.contentType ||
      (record === null && (result.evidence.note ?? '') !== (input.note?.trim() ?? '')) ||
      result.evidence.fileSizeBytes !== input.fileSizeBytes ||
      (result.upload === null && !result.evidence.verifiedAt) ||
      (result.upload !== null && result.evidence.verifiedAt !== null) ||
      (result.upload &&
        (result.upload.headers['Content-Type'] !== input.contentType ||
          result.upload.headers['x-amz-checksum-sha256'] !==
            btoa(
              String.fromCharCode(
                ...input.sha256.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
              ),
            )))
    ) {
      throw new Error('Image upload intent does not match the selected file');
    }
    return result;
  },
  async confirm(
    warehouse: string,
    asn: string,
    record: string | null,
    id: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouse, asn, record)}/${encodeURIComponent(id)}/confirm`,
      {},
      { silent: true, signal },
    );
    const result = sameRecord(evidenceSchema.parse(data), record);
    if (result.id !== id || !result.verifiedAt) throw new Error('Image confirmation is incomplete');
    return result;
  },
  async download(
    warehouse: string,
    asn: string,
    record: string | null,
    id: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(warehouse, asn, record)}/${encodeURIComponent(id)}/download`,
      { silent: true, signal },
    );
    const result = z
      .object({
        id: z.string().uuid(),
        downloadUrl: privateUrl,
        expiresInSeconds: z.number().int().min(1).max(300),
      })
      .strict()
      .parse(data);
    if (result.id !== id) throw new Error('Image download belongs to another photo');
    return { ...result, downloadUrl: signedStorageUrl(result.downloadUrl) };
  },
  async remove(
    warehouse: string,
    asn: string,
    record: string | null,
    id: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.delete<ApiResponse<unknown>>(
      `${path(warehouse, asn, record)}/${encodeURIComponent(id)}`,
      { silent: true, signal },
    );
    const result = z
      .object({ id: z.string().uuid(), deletedAt: z.string().datetime() })
      .strict()
      .parse(data);
    if (result.id !== id) throw new Error('Deleted evidence belongs to another photo');
    return result;
  },
};
