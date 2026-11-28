import { ApiError, apiClient, type ApiResponse } from '@/services/apiClient';

import {
  estimateInputSchema,
  estimateResultSchema,
  orderFreightListResponseSchema,
  orderLookupRequestSchema,
  orderStatusRequestSchema,
  originsResponseSchema,
  type EstimateInput,
  type EstimateResult,
  type OrderFreightClient,
  type OrderFreightRow,
  type OrderLookupItem,
  type Origin,
} from '../../shared';

export class FreightApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'FreightApiError';
  }
}

function parseRetryAfter(details: unknown): number | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const raw = (details as { retryAfter?: unknown }).retryAfter;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.ceil(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    return Number(raw);
  }
  return undefined;
}

function rethrowFreightError(error: unknown): never {
  if (error instanceof FreightApiError) {
    throw error;
  }
  if (error instanceof ApiError) {
    throw new FreightApiError(
      error.message,
      error.status,
      error.code,
      parseRetryAfter(error.details),
    );
  }
  throw error;
}

export class HttpFreightEstimateClient implements OrderFreightClient {
  async origins(signal: AbortSignal): Promise<Origin[]> {
    try {
      const response = await apiClient.get<ApiResponse<unknown>>(
        '/v1/seller/freight-estimates/origins',
        { signal, silent: true },
      );
      return originsResponseSchema.parse(response.data).items;
    } catch (error) {
      rethrowFreightError(error);
    }
  }

  async estimate(input: EstimateInput, signal: AbortSignal): Promise<EstimateResult> {
    try {
      const payload = estimateInputSchema.parse(input);
      const response = await apiClient.post<ApiResponse<unknown>>(
        '/v1/seller/freight-estimates',
        payload,
        { signal, silent: true },
      );
      return estimateResultSchema.parse(response.data);
    } catch (error) {
      rethrowFreightError(error);
    }
  }

  async orderStatus(orderIds: readonly string[], signal: AbortSignal): Promise<OrderFreightRow[]> {
    try {
      const payload = orderStatusRequestSchema.parse({ orderIds: [...orderIds] });
      const response = await apiClient.post<ApiResponse<unknown>>(
        '/v1/seller/freight-estimates/order-status',
        payload,
        { signal, silent: true },
      );
      return orderFreightListResponseSchema.parse(response.data).items;
    } catch (error) {
      rethrowFreightError(error);
    }
  }

  async orderLookup(
    items: readonly OrderLookupItem[],
    signal: AbortSignal,
  ): Promise<OrderFreightRow[]> {
    try {
      const payload = orderLookupRequestSchema.parse({
        items: items.map((item) => ({
          orderId: item.orderId,
          ...(item.assumptions ? { assumptions: [...item.assumptions] } : {}),
        })),
      });
      const response = await apiClient.post<ApiResponse<unknown>>(
        '/v1/seller/freight-estimates/order-lookup',
        payload,
        { signal, silent: true },
      );
      return orderFreightListResponseSchema.parse(response.data).items;
    } catch (error) {
      rethrowFreightError(error);
    }
  }
}

export const freightEstimateApi = new HttpFreightEstimateClient();
