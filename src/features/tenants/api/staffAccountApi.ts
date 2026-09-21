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
  phone: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'LOCKED', 'PENDING']),
});
const staffAccountListSchema = z.array(staffAccountSchema);
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const staffAccountApi = {
  async create(data: { email: string; fullName: string; roleCode: string }): Promise<StaffAccount> {
    const { data: responseData } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/iam/users',
      data,
    );
    return staffAccountSchema.parse(responseData);
  },

  async list(filters: StaffAccountFilters, cursor?: string): Promise<StaffAccountPage> {
    const params: Record<string, string> = { limit: '100' };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/iam/users', {
      params,
      silent: true,
    });
    return {
      items: staffAccountListSchema.parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
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

  async updateProfile(
    userId: string,
    data: { fullName?: string; phone?: string | null; avatarUrl?: string | null },
  ): Promise<StaffAccount> {
    const { data: responseData } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/iam/users/${encodeURIComponent(userId)}`,
      data,
    );
    return staffAccountSchema.parse(responseData);
  },
};
