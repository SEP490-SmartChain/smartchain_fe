import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountPage,
  StaffAccountStatus,
  StaffRole,
} from '../types/staffAccount.types';

const staffAccountSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  roles: z.array(z.enum(['TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'])),
  lastSessionAt: z.string().datetime().nullable(),
  status: z.enum(['ACTIVE', 'LOCKED']),
});
const staffAccountPageSchema = z.object({
  items: z.array(staffAccountSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export const staffAccountApi = {
  async list(filters: StaffAccountFilters, cursor?: string): Promise<StaffAccountPage> {
    const params: Record<string, string> = { limit: '100' };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/iam/users', {
      params,
      silent: true,
    });
    return staffAccountPageSchema.parse(data);
  },

  async changeStatus(userId: string, status: StaffAccountStatus): Promise<StaffAccount> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/iam/users/${encodeURIComponent(userId)}/status`,
      { status },
    );
    return staffAccountSchema.parse(data);
  },

  async updateRoles(userId: string, roles: StaffRole[]): Promise<StaffAccount> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/iam/users/${encodeURIComponent(userId)}/roles`,
      { roles },
    );
    return staffAccountSchema.parse(data);
  },
};
