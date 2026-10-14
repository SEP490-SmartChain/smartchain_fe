import { z } from 'zod';

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
    receivingRecordId: z.string().uuid(),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    fileSizeBytes: z
      .number()
      .int()
      .min(12)
      .max(5 * 1024 * 1024),
    createdAt: z.string().datetime(),
    verifiedAt: z.string().datetime().nullable(),
  })
  .strict()
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
        'Content-Type': z.enum(['image/png', 'image/jpeg', 'image/webp']),
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
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileSizeBytes: number;
  sha256: string;
}
const path = (warehouse: string, asn: string, record: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving/records/${encodeURIComponent(record)}/evidence`;
function sameRecord(photo: ReceiptEvidence, record: string) {
  if (photo.receivingRecordId !== record) {
    throw new Error('Image belongs to another receiving record');
  }
  return photo;
}
export async function imageIntent(file: File, operationKey: string): Promise<EvidenceIntentInput> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size < 12 ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error('Invalid receipt image');
  }
  const contentType = z.enum(['image/png', 'image/jpeg', 'image/webp']).parse(file.type);
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return {
    operationKey,
    contentType,
    fileSizeBytes: file.size,
    sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}
export const evidenceApi = {
  async list(warehouse: string, asn: string, record: string, signal?: AbortSignal) {
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
    record: string,
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
  async confirm(warehouse: string, asn: string, record: string, id: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouse, asn, record)}/${encodeURIComponent(id)}/confirm`,
      {},
      { silent: true, signal },
    );
    const result = sameRecord(evidenceSchema.parse(data), record);
    if (result.id !== id || !result.verifiedAt) throw new Error('Image confirmation is incomplete');
    return result;
  },
  async download(warehouse: string, asn: string, record: string, id: string, signal?: AbortSignal) {
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
    return result;
  },
};
