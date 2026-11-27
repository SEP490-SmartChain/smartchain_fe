export type RealtimeActorScope = 'TENANT' | 'PLATFORM';

export type RealtimeRoleCode =
  | 'SELLER_OWNER'
  | 'SELLER_STAFF'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'OPS_DISPATCHER'
  | 'ORCA_ACCOUNTANT'
  | 'ORCA_ADMIN';

export type RealtimeSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type RealtimeCategory =
  | 'INBOUND'
  | 'OUTBOUND'
  | 'SHIPMENT'
  | 'INVENTORY'
  | 'ORDER'
  | 'COMMERCIAL'
  | 'FINANCE'
  | 'CLAIM'
  | 'SYSTEM';

export type RealtimePrimitive = string | number | boolean | null;
export type RealtimeParams = Readonly<Record<string, RealtimePrimitive>>;

export const REALTIME_SYNC_AREAS = {
  COMMERCIAL_ONBOARDING: 'commercial.onboarding',
  COMMERCIAL_BILLING: 'commercial.billing',
  COMMERCIAL_UNMATCHED: 'commercial.unmatched',
  AUTH_PROFILE: 'auth.profile',
  INBOUND_ASN: 'inbound.asn',
  INBOUND_RECEIPT: 'inbound.receipt',
  INBOUND_PUTAWAY: 'inbound.putaway',
  OUTBOUND_PICKING: 'outbound.picking',
  OUTBOUND_PACKING: 'outbound.packing',
  OUTBOUND_HANDOVER: 'outbound.handover',
  OUTBOUND_ORDERS: 'outbound.orders',
  SHIPMENTS_TRACKING: 'shipments.tracking',
  SLA_EXCEPTIONS: 'sla.exceptions',
  INVENTORY_STOCKS: 'inventory.stocks',
  INVENTORY_EXPIRY: 'inventory.expiry',
  INVENTORY_WITHDRAWALS: 'inventory.withdrawals',
  RETURNS_LIST: 'returns.list',
  CLAIMS_DETAIL: 'claims.detail',
  COUNTS_LIST: 'counts.list',
  DISPOSALS_LIST: 'disposals.list',
  RATES_COLLECTION: 'rates.collection',
  FORECAST_DEMAND: 'forecast.demand',
  WAREHOUSES_ASSIGNMENTS: 'warehouses.assignments',
} as const;

export type RealtimeUiSyncResource =
  | (typeof REALTIME_SYNC_AREAS)[keyof typeof REALTIME_SYNC_AREAS]
  | (string & {});

export const REALTIME_API_PATHS = {
  LIST: '/v1/notifications',
  UNREAD_COUNT: '/v1/notifications/unread-count',
  READ_ALL: '/v1/notifications/read-all',
  STREAM: '/v1/notifications/stream',
  markRead: (id: string) => `/v1/notifications/${encodeURIComponent(id)}/read`,
} as const;

export const REALTIME_TOPICS = {
  // Flow 1 — Inbound
  ASN_SUBMITTED: 'asn.submitted',
  ASN_CANCELLED: 'asn.cancelled',
  ASN_ARRIVED: 'asn.arrived',
  INBOUND_DISCREPANCY_SELLER_NOTIFIED: 'inbound.discrepancy.seller_notified',
  RECEIPT_DISCREPANCY_REPORTED: 'receipt.discrepancy_reported',
  RECEIPT_REVIEWED: 'receipt.reviewed',
  ASN_RECEIVED: 'asn.received',
  PUTAWAY_COMPLETED: 'putaway.completed',
  // Flow 2 — Outbound
  PICK_WAVE_READY: 'pick.wave_ready',
  PICK_SHORT_REPORTED: 'pick.short_reported',
  PICK_SHORT_REPLACED: 'pick.short_replaced',
  ORDER_CANCELLATION_REQUESTED: 'order.cancellation_requested',
  ORDER_PICKED_READY_FOR_PACKING: 'order.picked_ready_for_packing',
  SHIPMENT_LABEL_READY: 'shipment.label_ready',
  SHIPMENT_LABEL_FAILED: 'shipment.label_failed',
  PARCEL_HANDED_OVER: 'parcel.handed_over',
  // Flow 3 — Tracking & SLA
  SHIPMENT_STATUS_CHANGED: 'shipment.status_changed',
  SHIPMENT_RETURNED: 'shipment.returned',
  SLA_HANDOVER_OVERDUE: 'sla.handover_overdue',
  SLA_TRACKING_STALLED: 'sla.tracking_stalled',
  HANDOVER_CARRIER_PICKUP_MISMATCH: 'handover.carrier_pickup_mismatch',
  // Flow 4 — Inventory
  STOCK_LOW: 'stock.low',
  INVENTORY_LOW_STOCK: 'inventory.low_stock',
  LOT_NEAR_EXPIRY: 'lot.near_expiry',
  // Flow 5 — Orders / Sheets / Webhooks
  ORDERS_SHEET_SYNC_FAILED: 'orders.sheet_sync_failed',
  ORDER_ON_HOLD: 'order.on_hold',
  ORDER_BACKORDER: 'order.backorder',
  ORDER_EXCEPTION_CORRECTED: 'order.exception_corrected',
  WEBHOOK_ENDPOINT_EXHAUSTED: 'webhook.endpoint_exhausted',
  // Flow 6 — Putaway & Bin Override
  PUTAWAY_PLAN_READY: 'putaway.plan_ready',
  PUTAWAY_CAPACITY_REQUIRED: 'putaway.capacity_required',
  PUTAWAY_BIN_OVERRIDDEN: 'putaway.bin_overridden',
  PUTBACK_RETARGETED: 'putback.retargeted',
  // Flow 7 — Withdrawal
  WITHDRAWAL_CREATED: 'withdrawal.created',
  WITHDRAWAL_DISPATCHED: 'withdrawal.dispatched',
  // Flow 8 — Carriers & Rates
  CARRIER_HEALTH_CHANGED: 'carrier.health_changed',
  RATE_COLLECTION_COMPLETED: 'rate.collection_completed',
  RATE_CHANGE_ALERT_CREATED: 'rate.change_alert_created',
  // Flow 9 — AI Forecast
  AI_FORECAST_COMPLETED: 'ai.forecast_completed',
  AI_FORECAST_FAILED: 'ai.forecast_failed',
  // Flow 10 — Commercial, SignNow, SePay Zero-Reload & Lifecycle
  COMMERCIAL_CUSTOM_INQUIRY_SUBMITTED: 'commercial.custom_inquiry_submitted',
  COMMERCIAL_CUSTOM_CONTRACT_OFFERED: 'commercial.custom_contract_offered',
  COMMERCIAL_SIGNING_REQUESTED: 'commercial.signing_requested',
  COMMERCIAL_CONTRACT_SIGNED: 'commercial.contract_signed',
  COMMERCIAL_PAYMENT_POSTED: 'commercial.payment_posted',
  COMMERCIAL_SERVICE_ACTIVATED: 'commercial.service_activated',
  SEPAY_UNMATCHED_RECEIVED: 'sepay.unmatched_received',
  COMMERCIAL_PLAN_CHANGE_REQUESTED: 'commercial.plan_change_requested',
  COMMERCIAL_PLAN_CHANGE_SCHEDULED: 'commercial.plan_change_scheduled',
  COMMERCIAL_PLAN_CHANGE_REJECTED: 'commercial.plan_change_rejected',
  COMMERCIAL_PLAN_CHANGE_APPLIED: 'commercial.plan_change_applied',
  COMMERCIAL_SERVICE_STATUS_CHANGED: 'commercial.service_status_changed',
  TENANT_STATUS_CHANGED: 'tenant.status_changed',
  COMMERCIAL_CLOSURE_REQUESTED: 'commercial.closure_requested',
  COMMERCIAL_CONTRACT_CLOSED: 'commercial.contract_closed',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_DUE_SOON: 'invoice.due_soon',
  PAYOUT_SENT: 'payout.sent',
  PAYOUT_CONFIRMED: 'payout.confirmed',
  PAYOUT_DISPUTED: 'payout.disputed',
  PAYOUT_RESOLVED: 'payout.resolved',
  PAYOUT_APPROVED: 'payout.approved',
  PAYOUT_PAID: 'payout.paid',
  // Cross-role
  RETURN_REQUESTED: 'return.requested',
  RETURN_REVERSE_REQUESTED: 'return.reverse_requested',
  RETURN_REVERSE_AUTHORIZED: 'return.reverse_authorized',
  RETURN_ARRIVED: 'return.arrived',
  RETURN_INSPECTED: 'return.inspected',
  RETURN_REVIEWED: 'return.reviewed',
  RETURN_RESTOCKED: 'return.restocked',
  CLAIM_OPENED: 'claim.opened',
  CLAIM_EVIDENCE_SUBMITTED: 'claim.evidence_submitted',
  CLAIM_INVESTIGATED: 'claim.investigated',
  CLAIM_DECIDED: 'claim.decided',
  CLAIM_CREDIT_POSTED: 'claim.credit_posted',
  COUNT_ASSIGNED: 'count.assigned',
  COUNT_OBSERVED: 'count.observed',
  COUNT_RECOUNT_REQUESTED: 'count.recount_requested',
  DISPOSAL_REQUESTED: 'disposal.requested',
  DISPOSAL_REVIEWED: 'disposal.reviewed',
  DISPOSAL_REVOKED: 'disposal.revoked',
  DISPOSAL_EXECUTED: 'disposal.executed',
  LOT_RECALLED: 'lot.recalled',
  RECALL_CUSTOMER_NOTIFICATION: 'recall.customer_notification',
  PLATFORM_USER_WAREHOUSES_ASSIGNED: 'platform_user.warehouses_assigned',
} as const;

export interface InAppNotificationDto {
  readonly id: string;
  readonly dedupKey: string;
  readonly topic: string;
  readonly category: RealtimeCategory;
  readonly severity: RealtimeSeverity;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly params: RealtimeParams;
  readonly targetPath: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly createdAt: string;
  readonly isRead: boolean;
  readonly readAt: string | null;
}

export interface NotificationListQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly unreadOnly?: boolean;
  readonly category?: RealtimeCategory;
}

export interface CursorPaginationMeta {
  readonly limit: number;
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
}

export interface NotificationListResponse {
  readonly items: readonly InAppNotificationDto[];
  readonly unreadCount: number;
  readonly pagination: CursorPaginationMeta;
}

export interface UnreadCountResponse {
  readonly unreadCount: number;
}

export interface MarkReadResponse {
  readonly id: string;
  readonly readAt: string;
  readonly unreadCount: number;
}

export interface MarkAllReadResponse {
  readonly markedCount: number;
  readonly unreadCount: number;
}

export interface RealtimeUiSyncPayload {
  readonly topic: string;
  readonly syncAreas: readonly RealtimeUiSyncResource[];
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly status?: string | null;
  readonly occurredAt: string;
  readonly meta?: RealtimeParams;
}

export interface SseConnectedEvent {
  readonly type: 'connected';
  readonly serverTime: string;
  readonly unreadCount: number;
}

export interface SseNotificationEvent {
  readonly type: 'notification';
  readonly notification: InAppNotificationDto;
  readonly uiSync?: RealtimeUiSyncPayload;
}

export interface SseUiSyncEvent {
  readonly type: 'ui_sync';
  readonly uiSync: RealtimeUiSyncPayload;
}

export interface SseHeartbeatEvent {
  readonly type: 'heartbeat';
  readonly serverTime: string;
}

export type SseEnvelope =
  | SseConnectedEvent
  | SseNotificationEvent
  | SseUiSyncEvent
  | SseHeartbeatEvent;

export type RealtimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface RealtimeStreamHandlers {
  readonly onEvent: (event: SseEnvelope) => void;
  readonly onStatusChange?: (status: RealtimeConnectionStatus) => void;
  readonly onError?: (error: Error) => void;
}

export interface RealtimeStreamSubscription {
  close(): void;
}

export interface RealtimeClientPort {
  listNotifications(query?: NotificationListQuery): Promise<NotificationListResponse>;
  getUnreadCount(): Promise<UnreadCountResponse>;
  markAsRead(id: string): Promise<MarkReadResponse>;
  markAllAsRead(): Promise<MarkAllReadResponse>;
  openStream(handlers: RealtimeStreamHandlers): RealtimeStreamSubscription;
}

export function sanitizeRealtimeTargetPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  return trimmed.slice(0, 400);
}

export function interpolateNotificationTemplate(template: string, params: RealtimeParams): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const val = params[key];
    return val === undefined || val === null ? '' : String(val);
  });
}
