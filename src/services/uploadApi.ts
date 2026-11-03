import { z } from 'zod';

import { apiClient, type ApiResponse } from './apiClient';

const presignSchema = z.object({
  method: z.literal('PUT'),
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  headers: z.object({ 'Content-Type': z.string().min(1) }),
});

const downloadSchema = z.object({
  downloadUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});

export interface PresignUploadInput {
  purpose: 'AVATAR' | 'RECONCILIATION' | 'WORKSPACE_LOGO';
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface PresignUploadResult {
  method: 'PUT';
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
  headers: Record<string, string>;
}

export interface AvatarDownloadResult {
  downloadUrl: string;
  expiresInSeconds: number;
}

export class UploadStorageConnectionError extends Error {
  constructor() {
    super('Unable to connect to the signed upload URL.');
    this.name = 'UploadStorageConnectionError';
  }
}

export function avatarObjectKey(reference?: string | null): string | null {
  if (!reference) return null;
  if (reference.startsWith('tenants/') || reference.startsWith('platform/users/')) {
    return reference;
  }

  try {
    const pathname = new URL(reference).pathname;
    const objectPathIndex = pathname.search(/\/(?:tenants\/|platform\/users\/)/);
    return objectPathIndex >= 0 ? pathname.slice(objectPathIndex + 1) : null;
  } catch {
    return null;
  }
}

export const uploadApi = {
  async presignWorkspaceLogo(file: File) {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/uploads/presign', {
      purpose: 'WORKSPACE_LOGO',
      fileName: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
    });
    return presignSchema.parse(data);
  },

  async workspaceLogoUrl(objectKey: string) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/uploads/workspace-logo-url',
      { objectKey },
      { silent: true },
    );
    return downloadSchema.parse(data);
  },

  async presign(input: PresignUploadInput): Promise<PresignUploadResult> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/uploads/presign', input, {
      silent: true,
    });
    return presignSchema.parse(data);
  },

  async uploadDirect(
    uploadUrl: string,
    file: File,
    headers?: Record<string, string>,
  ): Promise<void> {
    try {
      await apiClient.uploadSignedImage(uploadUrl, file, {
        'Content-Type': file.type,
        ...headers,
      });
    } catch (error) {
      if (error instanceof TypeError) throw new UploadStorageConnectionError();
      throw error;
    }
  },

  async avatarDownloadUrl(objectKey: string): Promise<AvatarDownloadResult> {
    const { data } = await apiClient.post<ApiResponse<AvatarDownloadResult>>(
      '/v1/uploads/avatar-url',
      { objectKey },
      { silent: true },
    );
    return data;
  },
};
