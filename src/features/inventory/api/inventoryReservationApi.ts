import { z } from 'zod';

import { ApiError, apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  ActiveReservationFilters,
  ActiveReservationPage,
  ReleaseReservationsResult,
  ReservationSummary,
} from '../types/inventoryReservation.types';

const PAGE_LIMIT = '100';
/** Mã lỗi nghĩa là đơn con không còn hàng nào để nhả (SRS: "expired or been converted"). */
const UNAVAILABLE_RESERVATION_CODES = new Set([
  'INVENTORY.RESERVATION_NOT_ACTIVE',
  'INVENTORY.RESERVATION_NOT_FOUND',
]);

const quantitySchema = z.number().int().nonnegative();
const positiveQuantitySchema = z.number().int().positive();
const activeReservationSchema = z.object({
  id: z.string().uuid(),
  fulfillmentOrderId: z.string().uuid(),
  parentOrderCode: z.string(),
  fulfillmentSequenceNo: positiveQuantitySchema,
  productId: z.string().uuid(),
  sku: z.string(),
  productName: z.string(),
  warehouseId: z.string().uuid(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  qty: positiveQuantitySchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  ttlRemainingSeconds: quantitySchema,
});
const activeReservationListSchema = z.array(activeReservationSchema);
const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
const reservationSummarySchema = z.object({ activeReservations: quantitySchema });
const releaseResultSchema = z.object({
  fulfillmentOrderId: z.string().uuid(),
  releasedReservations: z.array(
    z.object({
      reservationId: z.string().uuid(),
      productId: z.string().uuid(),
      warehouseId: z.string().uuid(),
      qty: positiveQuantitySchema,
      onHandQtyAfter: quantitySchema,
      reservedQtyAfter: quantitySchema,
      availableQtyAfter: quantitySchema,
    }),
  ),
});

export function isReservationUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && UNAVAILABLE_RESERVATION_CODES.has(error.code);
}

export const inventoryReservationApi = {
  async list(filters: ActiveReservationFilters, cursor?: string): Promise<ActiveReservationPage> {
    const params: Record<string, string> = { limit: PAGE_LIMIT };
    if (filters.fulfillmentOrderId) params.fulfillmentOrderId = filters.fulfillmentOrderId;
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/inventory/reservations', {
      params,
      silent: true,
    });
    return {
      items: activeReservationListSchema.parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },

  async getSummary(): Promise<ReservationSummary> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/inventory/reservations/summary',
      { silent: true },
    );
    return reservationSummarySchema.parse(data);
  },

  /** `silent`: hộp xác nhận tự hiển thị lỗi hết hạn; lỗi khác do hook gọi toast. */
  async release(fulfillmentOrderId: string): Promise<ReleaseReservationsResult> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/inventory/fulfillment-orders/${encodeURIComponent(fulfillmentOrderId)}/reservations/release`,
      {},
      { silent: true },
    );
    return releaseResultSchema.parse(data);
  },
};
