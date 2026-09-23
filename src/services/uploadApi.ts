import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

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

  async uploadDirect(
    uploadUrl: string,
    file: File,
    headers: Readonly<Record<'Content-Type', string>>,
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  },

  async workspaceLogoUrl(objectKey: string) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/uploads/workspace-logo-url',
      { objectKey },
      { silent: true },
    );
    return downloadSchema.parse(data);
  },
};
