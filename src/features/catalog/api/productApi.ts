import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type { ProductFilters, ProductPage } from '../types/product.types';

const productSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  weightG: z.number().int(),
  lengthCm: z.string(),
  widthCm: z.string(),
  heightCm: z.string(),
  declaredValue: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
const productPageSchema = z.object({
  items: z.array(productSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export const productApi = {
  async list(filters: ProductFilters, cursor?: string): Promise<ProductPage> {
    const params: Record<string, string> = { limit: '100' };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.isActive) params.isActive = filters.isActive;
    if (cursor) params.cursor = cursor;
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/catalog/products', {
      params,
      silent: true,
    });
    return productPageSchema.parse(data);
  },
};
