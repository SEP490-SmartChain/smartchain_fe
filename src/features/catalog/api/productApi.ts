import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  Product,
  ProductFilters,
  ProductPage,
  UpdateProductInput,
} from '../types/product.types';

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
  updatedAt: z.string().datetime(),
});
const productListSchema = z.array(productSchema);
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const productApi = {
  async list(filters: ProductFilters, cursor?: string): Promise<ProductPage> {
    const params: Record<string, string> = { limit: '100' };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.isActive) params.isActive = filters.isActive;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/catalog/products', {
      params,
      silent: true,
    });
    return {
      items: productListSchema.parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/catalog/products/${encodeURIComponent(id)}`,
      input,
      { silent: true },
    );
    return productSchema.parse(data);
  },
};
