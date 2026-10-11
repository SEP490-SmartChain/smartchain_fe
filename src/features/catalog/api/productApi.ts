import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  Product,
  ProductFilters,
  ProductPage,
  UpdateProductInput,
  CreateProductInput,
  ProductConfigurationInput,
} from '../types/product.types';

const productSchema = z.object({
  barcode: z.string().nullable().optional(),
  declaredCostVnd: z
    .string()
    .regex(/^[0-9]{1,20}$/)
    .nullable()
    .optional(),
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
  trackLot: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  shelfLifeDays: z.number().int().positive().nullable().optional(),
  minInboundShelfLifePct: z.string().optional(),
  minOutboundDays: z.number().int().nonnegative().optional(),
  nearExpiryDays: z.number().int().nonnegative().optional(),
});
const productListSchema = z.array(productSchema);
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

const outstandingSchema = z.object({
  stockUnits: z.number().int().nonnegative(),
  openOrders: z.number().int().nonnegative(),
});

export const productApi = {
  async outstanding(id: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/catalog/products/${encodeURIComponent(id)}/deactivation-summary`,
      { silent: true },
    );
    return outstandingSchema.parse(data);
  },
  async deactivate(id: string, input: { reason: string; expectedUpdatedAt: string }) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/catalog/products/${encodeURIComponent(id)}/deactivate`,
      input,
      { silent: true },
    );
    return z.object({ product: productSchema, outstanding: outstandingSchema }).parse(data);
  },
  async create(input: CreateProductInput): Promise<Product> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/catalog/products', input, {
      silent: true,
    });
    return productSchema.parse(data);
  },
  async configure(id: string, input: ProductConfigurationInput): Promise<Product> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/catalog/products/${encodeURIComponent(id)}/configuration`,
      input,
      { silent: true },
    );
    return productSchema.parse(data);
  },
  async importRows(items: readonly Record<string, unknown>[]) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/catalog/products/import',
      { items },
      { silent: true },
    );
    return z
      .object({
        created: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        items: z.array(
          z.object({
            row: z.number().int().positive(),
            sku: z.string().nullable(),
            status: z.enum(['CREATED', 'UNCHANGED', 'INVALID', 'DUPLICATE']),
            id: z.string().uuid().optional(),
            fields: z.array(z.string()).optional(),
          }),
        ),
      })
      .parse(data);
  },
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
