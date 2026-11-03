import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const base = '/v1/platform/carrier-accounts';
export const accountSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  carrierId: z.string().uuid(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  maskedPreview: z.string(),
  pickupMapping: z.record(z.string(), z.string()),
  status: z.enum(['UNVERIFIED', 'CONNECTED', 'FAILED', 'REVOKED']),
  lastHealthAt: z.string().nullable(),
  updatedAt: z.string(),
  orcaCarrier: z.object({ code: z.string(), name: z.string() }),
});
const pageSchema = z.object({
  items: z.array(accountSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
const warehousesSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string() })),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type CarrierAccount = z.infer<typeof accountSchema>;
export type AccountCredentials = { apiToken: string; shopId?: string; partnerCode?: string };
export type CreateAccount = {
  warehouseId: string;
  carrierId: string;
  credentials: AccountCredentials;
  pickupMapping: Record<string, string>;
};
export type AccountFilters = {
  warehouseId?: string;
  carrierId?: string;
  environment?: string;
  cursor?: string;
};

export const carrierAccountApi = {
  async list(filters: AccountFilters, signal?: AbortSignal) {
    const params: Record<string, string> = { limit: '20' };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    const response = await apiClient.get<ApiResponse<unknown>>(base, {
      params,
      signal,
      silent: true,
    });
    return pageSchema.parse({
      items: response.data,
      nextCursor: response.meta.pagination?.nextCursor,
      hasMore: response.meta.pagination?.hasNext,
    });
  },
  async warehouses(signal?: AbortSignal) {
    const items: z.infer<typeof warehousesSchema>['items'] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const params: Record<string, string> = { limit: '50', ...(cursor ? { cursor } : {}) };
      const response = await apiClient.get<ApiResponse<unknown>>(`${base}/warehouses`, {
        params,
        signal,
        silent: true,
      });
      const page = warehousesSchema.parse({
        items: response.data,
        nextCursor: response.meta.pagination?.nextCursor,
        hasMore: response.meta.pagination?.hasNext,
      });
      items.push(...page.items);
      cursor = page.hasMore ? page.nextCursor : null;
      if (cursor && seen.has(cursor)) throw new Error('Invalid warehouse pagination');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  },
  async create(input: CreateAccount) {
    const response = await apiClient.post<ApiResponse<unknown>>(base, input, { silent: true });
    return accountSchema.parse(response.data);
  },
  async update(
    id: string,
    input: { credentials?: AccountCredentials; pickupMapping: Record<string, string> },
  ) {
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(id)}`,
      input,
      { silent: true },
    );
    return accountSchema.parse(response.data);
  },
  async test(id: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(id)}/test`,
      {},
      { silent: true },
    );
    return z
      .object({ status: z.enum(['CONNECTED', 'FAILED']), latencyMs: z.number() })
      .parse(response.data);
  },
  async revoke(id: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/${encodeURIComponent(id)}/revoke`,
      {},
      { silent: true },
    );
    return accountSchema.parse(response.data);
  },
};
