import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  purchaseTariffSchema,
  sellerTariffSchema,
  tariffServiceSchema,
  type purchaseInput,
  type sellerInput,
} from '../schemas/freightTariffSchema';

const pagination = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
});
const root = '/v1/platform/tariffs';
export const freightTariffApi = {
  async read(kind: 'purchase' | 'sell', id: string) {
    const r = await apiClient.get<ApiResponse<unknown>>(
      `${root}/${kind}/${encodeURIComponent(id)}`,
      { silent: true },
    );
    return kind === 'purchase'
      ? purchaseTariffSchema.parse(r.data)
      : sellerTariffSchema.parse(r.data);
  },
  async close(
    kind: 'purchase' | 'sell',
    row: { id: string; version: number; effectiveTo: string | null },
    end: string,
  ) {
    const r = await apiClient.post<ApiResponse<unknown>>(
      `${root}/${kind}/${encodeURIComponent(row.id)}/close`,
      { expectedVersion: row.version, expectedEffectiveTo: row.effectiveTo, effectiveTo: end },
      { silent: true },
    );
    return kind === 'purchase'
      ? purchaseTariffSchema.parse(r.data)
      : sellerTariffSchema.parse(r.data);
  },
  async services(signal?: AbortSignal) {
    const result = await apiClient.get<ApiResponse<unknown>>(`${root}/services`, {
      signal,
      silent: true,
    });
    return z.array(tariffServiceSchema).parse(result.data);
  },
  async purchase(cursor?: string, signal?: AbortSignal) {
    const r = await apiClient.get<ApiResponse<unknown>>(`${root}/purchase`, {
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return {
      items: z.array(purchaseTariffSchema).parse(r.data),
      pagination: pagination.parse(r.meta.pagination),
    };
  },
  async sell(cursor?: string, signal?: AbortSignal) {
    const r = await apiClient.get<ApiResponse<unknown>>(`${root}/sell`, {
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return {
      items: z.array(sellerTariffSchema).parse(r.data),
      pagination: pagination.parse(r.meta.pagination),
    };
  },
  async savePurchase(
    input: ReturnType<typeof purchaseInput>,
    existing?: { id: string; version: number },
  ) {
    const r = existing
      ? await apiClient.put<ApiResponse<unknown>>(
          `${root}/purchase/${encodeURIComponent(existing.id)}`,
          { ...input, expectedVersion: existing.version },
          { silent: true },
        )
      : await apiClient.post<ApiResponse<unknown>>(`${root}/purchase`, input, { silent: true });
    return purchaseTariffSchema.parse(r.data);
  },
  async saveSell(
    input: ReturnType<typeof sellerInput>,
    existing?: { id: string; version: number },
  ) {
    const r = existing
      ? await apiClient.put<ApiResponse<unknown>>(
          `${root}/sell/${encodeURIComponent(existing.id)}`,
          { ...input, expectedVersion: existing.version },
          { silent: true },
        )
      : await apiClient.post<ApiResponse<unknown>>(`${root}/sell`, input, { silent: true });
    return sellerTariffSchema.parse(r.data);
  },
  async publish(kind: 'purchase' | 'sell', row: { id: string; version: number }) {
    const r = await apiClient.post<ApiResponse<unknown>>(
      `${root}/${kind}/${encodeURIComponent(row.id)}/publish`,
      { expectedVersion: row.version },
      { silent: true },
    );
    return kind === 'purchase'
      ? purchaseTariffSchema.parse(r.data)
      : sellerTariffSchema.parse(r.data);
  },
};
