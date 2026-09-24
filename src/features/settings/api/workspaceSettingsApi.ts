import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const workspaceSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(3).max(150),
  logoKey: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export interface UpdateWorkspaceSettingsInput {
  name?: string;
  logoKey?: string | null;
}

export const workspaceSettingsApi = {
  async get(): Promise<WorkspaceSettings> {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/iam/workspace', {
      silent: true,
    });
    return workspaceSettingsSchema.parse(data);
  },

  async update(input: UpdateWorkspaceSettingsInput): Promise<WorkspaceSettings> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>('/v1/iam/workspace', input, {
      silent: true,
    });
    return workspaceSettingsSchema.parse(data);
  },
};
