import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const assignmentSchema = z.object({
  warehouseIds: z
    .array(z.string().uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const platformStaffSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  warehouseIds: z.array(z.string().uuid()),
});
export type PlatformStaff = z.infer<typeof platformStaffSchema>;
const optionSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
export type StaffWarehouseOption = z.infer<typeof optionSchema>;
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});

export const platformStaffApi = {
  async list(cursor?: string, signal?: AbortSignal) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/admin/staff', {
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined,
      silent: true,
    });
    return {
      items: z.array(platformStaffSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async warehouseOptions(cursor?: string, signal?: AbortSignal) {
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/admin/staff/warehouse-options',
      {
        params: { limit: '50', ...(cursor ? { cursor } : {}) },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined,
        silent: true,
      },
    );
    return {
      items: z.array(optionSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async replace(userId: string, input: z.infer<typeof assignmentSchema>, signal?: AbortSignal) {
    const id = z.string().uuid().parse(userId);
    const { data } = await apiClient.put<ApiResponse<unknown>>(
      `/v1/admin/staff/${encodeURIComponent(id)}/warehouses`,
      assignmentSchema.parse(input),
      {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : undefined,
        silent: true,
      },
    );
    return platformStaffSchema.parse(data);
  },
};
