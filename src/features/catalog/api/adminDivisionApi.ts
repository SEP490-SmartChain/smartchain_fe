import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const divisionSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  type: z.enum(['PROVINCE', 'DISTRICT', 'WARD']),
  parentCode: z.string().nullable(),
});
const pageSchema = z.object({
  items: z.array(divisionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type AdminDivision = z.infer<typeof divisionSchema>;

const base = '/v1/admin-divisions';

/** Loads every page so the dropdown never silently shows only the first 500 entries. */
async function loadAll(path: string, signal?: AbortSignal): Promise<AdminDivision[]> {
  const items: AdminDivision[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const params: Record<string, string> = { limit: '500', ...(cursor ? { cursor } : {}) };
    const response = await apiClient.get<ApiResponse<unknown>>(path, {
      params,
      signal,
      silent: true,
    });
    const page = pageSchema.parse({
      items: response.data,
      nextCursor: response.meta.pagination?.nextCursor ?? null,
      hasMore: response.meta.pagination?.hasNext ?? false,
    });
    items.push(...page.items);
    cursor = page.hasMore ? page.nextCursor : null;
    if (cursor && seen.has(cursor)) throw new Error('Invalid administrative pagination');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

export const adminDivisionApi = {
  provinces: (signal?: AbortSignal) => loadAll(`${base}/provinces`, signal),
  wards: (provinceCode: string, signal?: AbortSignal) =>
    loadAll(`${base}/provinces/${encodeURIComponent(provinceCode)}/wards`, signal),
};
