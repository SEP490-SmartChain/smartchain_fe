import type { ApiPaginationMeta } from '@/services/apiClient';

/** Một dòng `GET /v1/inventory/reservations` (SRS §3.10.2). */
export interface ActiveReservation {
  id: string;
  fulfillmentOrderId: string;
  parentOrderCode: string;
  fulfillmentSequenceNo: number;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  qty: number;
  createdAt: string;
  expiresAt: string;
  ttlRemainingSeconds: number;
}

/** Dòng trên bảng: kèm mốc hết hạn theo đồng hồ máy người dùng để đếm ngược. */
export interface ActiveReservationRow extends ActiveReservation {
  deadlineMs: number;
}

export interface ActiveReservationFilters {
  fulfillmentOrderId?: string;
}

export interface ActiveReservationPage {
  items: ActiveReservation[];
  pagination: ApiPaginationMeta;
}

export interface ReservationSummary {
  activeReservations: number;
}

export interface ReleasedReservation {
  reservationId: string;
  productId: string;
  warehouseId: string;
  qty: number;
  onHandQtyAfter: number;
  reservedQtyAfter: number;
  availableQtyAfter: number;
}

export interface ReleaseReservationsResult {
  fulfillmentOrderId: string;
  releasedReservations: ReleasedReservation[];
}
