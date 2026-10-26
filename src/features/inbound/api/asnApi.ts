import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  AllocationSuggestion,
  Asn,
  AsnPage,
  AsnStatus,
  CreateAsnInput,
  UpdateAsnInput,
} from '../types/asn.types';

const asnLineSchema = z.object({
  id: z.string().uuid(),
  lineNo: z.number().int().positive(),
  productId: z.string().uuid(),
  sku: z.string(),
  productName: z.string(),
  declaredQty: z.number().int().positive(),
  receivedQty: z.number().int().nonnegative(),
  acceptedQty: z.number().int().nonnegative(),
  quarantinedQty: z.number().int().nonnegative(),
  rejectedQty: z.number().int().nonnegative(),
  declaredLotCode: z.string().nullable(),
  declaredExpiryOn: z.string().datetime().nullable(),
});
export const asnSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  asnCode: z.string(),
  externalReference: z.string().nullable(),
  status: z.enum([
    'DRAFT',
    'SUBMITTED',
    'ARRIVED',
    'RECEIVING',
    'DISCREPANCY',
    'READY_FOR_PUTAWAY',
    'COMPLETED',
    'CANCELLED',
  ]),
  expectedArrivalAt: z.string().datetime().nullable(),
  arrivedAt: z.string().datetime().nullable(),
  submittedAt: z.string().datetime().nullable(),
  cartonLabelRefs: z.array(z.string().regex(/^[\x20-\x7e]{1,100}$/)).max(1000),
  cartonCount: z.number().int().min(1).max(1000),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  receiptIds: z.array(z.string().uuid()),
  discrepancyIds: z.array(z.string().uuid()),
  createdByUserId: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(asnLineSchema),
});
const pageSchema = z.object({
  items: z.array(asnSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

const skuPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sku: z.string(),
      name: z.string(),
      trackLot: z.boolean(),
      trackExpiry: z.boolean(),
    }),
  ),
  pagination: pageSchema.shape.pagination,
});

const warehouseAllocationSchema = z.object({
  warehouseId: z.string().uuid(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  region: z.string(),
  suggestedQty: z.number().int().min(0).max(1000000),
  sharePercent: z.number().min(0).max(100),
  dailyVelocity: z.number().nonnegative(),
  cappedByExpiry: z.boolean(),
  maxSellableBeforeExpiry: z.number().int().nonnegative().nullable(),
  redistributedQty: z.number().int().nonnegative(),
});
const allocationSuggestionSchema = z
  .object({
    productId: z.string().uuid(),
    sku: z.string(),
    productName: z.string(),
    totalQuantity: z.number().int().min(1).max(1000000),
    declaredExpiryOn: z.iso.date().nullable(),
    daysUntilExpiry: z.number().int().nonnegative().nullable(),
    basis: z.enum(['HISTORICAL_VELOCITY_30D', 'CONFIGURED_REGIONAL_BASELINE']),
    hasSufficientHistory: z.boolean(),
    allocations: z.array(warehouseAllocationSchema),
    warnings: z.array(z.string()),
    unallocatedQuantity: z.number().int().min(0).max(1000000),
  })
  .refine((value) => {
    const destinations = value.allocations.map((row) => row.warehouseId.toLowerCase());
    return (
      new Set(destinations).size === destinations.length &&
      value.allocations.reduce((sum, row) => sum + row.suggestedQty, value.unallocatedQuantity) ===
        value.totalQuantity &&
      value.allocations.every(
        (row) =>
          row.redistributedQty <= row.suggestedQty &&
          (row.maxSellableBeforeExpiry === null || row.suggestedQty <= row.maxSellableBeforeExpiry),
      )
    );
  }, 'Allocation quantities must conserve the requested total and respect each expiry cap.');

export const asnApi = {
  async getAllocationSuggestion(
    params: { productId: string; totalQuantity: number; declaredExpiryOn?: string },
    signal?: AbortSignal,
  ): Promise<AllocationSuggestion> {
    const searchParams: Record<string, string> = {
      productId: params.productId,
      totalQuantity: String(params.totalQuantity),
    };
    if (params.declaredExpiryOn !== undefined) {
      searchParams.declaredExpiryOn = params.declaredExpiryOn;
    }
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/asns/allocation-suggestion', {
      params: searchParams,
      signal,
      silent: true,
    });
    return allocationSuggestionSchema
      .refine(
        (value) =>
          value.productId.toLowerCase() === params.productId.toLowerCase() &&
          value.totalQuantity === params.totalQuantity &&
          value.declaredExpiryOn === (params.declaredExpiryOn ?? null),
        'Allocation suggestion must match the requested SKU, quantity and expiry.',
      )
      .parse(data);
  },

  async skuOptions(search = '', cursor?: string, signal?: AbortSignal) {
    const params: Record<string, string> = { limit: '100' };
    if (search.trim()) params.search = search.trim();
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/asns/sku-options', {
      params,
      signal,
      silent: true,
    });
    return skuPageSchema.parse({ items: data, pagination: meta.pagination });
  },
  async get(id: string, signal?: AbortSignal): Promise<Asn> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/asns/${encodeURIComponent(id)}`,
      { signal, silent: true },
    );
    return asnSchema.parse(data);
  },
  async list(
    search = '',
    status?: AsnStatus,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AsnPage> {
    const params: Record<string, string> = { limit: '20' };
    if (search.trim()) params.search = search.trim();
    if (status) params.status = status;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/asns', {
      params,
      signal,
      silent: true,
    });
    return pageSchema.parse({ items: data, pagination: meta.pagination }) as AsnPage;
  },

  async create(input: CreateAsnInput): Promise<Asn> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/asns', input, {
      silent: true,
    });
    return asnSchema.parse(data);
  },

  async update(id: string, input: UpdateAsnInput): Promise<Asn> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/asns/${encodeURIComponent(id)}`,
      input,
      { silent: true },
    );
    return asnSchema.parse(data);
  },

  async submit(id: string, version: number): Promise<Asn> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/asns/${encodeURIComponent(id)}/submit`,
      { version },
      { silent: true },
    );
    return asnSchema.parse(data);
  },

  async cancel(id: string, version: number, reason: string): Promise<Asn> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/asns/${encodeURIComponent(id)}/cancel`,
      { version, reason },
      { silent: true },
    );
    return asnSchema.parse(data);
  },
};
