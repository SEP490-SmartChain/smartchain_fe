import { z } from 'zod';

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const shipmentSchema = z.object({
  id,
  tenantId: id,
  warehouseId: id.nullable(),
  fulfillmentOrderId: id,
  packingRecordId: id.nullable(),
  carrierId: id,
  serviceId: id,
  trackingNumber: z.string().max(100).nullable(),
  carrierCode: z.string().max(30).nullable(),
  bookingState: z.enum([
    'INTENT',
    'REQUESTED',
    'UNKNOWN',
    'CONFIRMED',
    'FAILED',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'CANCEL_UNKNOWN',
    'COMPLETED',
  ]),
  status: z.string(),
  version: z.number().int().positive(),
  failureCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  labelAvailable: z.boolean(),
});
export type Shipment = z.infer<typeof shipmentSchema>;
export const trackingEventSchema = z.object({
  id,
  eventCode: z.string().max(50),
  standardStatus: z.string().max(50),
  eventTime: z.string().datetime(),
  isApplied: z.boolean(),
  ignoreReason: z.string().max(100).nullable(),
});
export type TrackingEvent = z.infer<typeof trackingEventSchema>;
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(50),
  hasNext: z.boolean(),
  nextCursor: id.nullable(),
});
const breakerBase = z.object({
  account_id: id,
  carrier_id: id,
  warehouse_id: id,
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  status: z.string(),
});
export const breakerSchema = z.discriminatedUnion('available', [
  breakerBase.extend({
    available: z.literal(true),
    state: z.enum(['CLOSED', 'HALF_OPEN', 'OPEN']),
    openUntil: z.string().datetime().nullable(),
    failures: z.number().int().nonnegative(),
  }),
  breakerBase.extend({
    available: z.literal(false),
    state: z.null(),
    openUntil: z.null(),
    failures: z.null(),
  }),
]);
export type CarrierBreaker = z.infer<typeof breakerSchema>;
export const cancelResultSchema = z.enum([
  'REQUESTED',
  'ALREADY_REQUESTED',
  'ALREADY_CANCELLED',
  'RETRY_SCHEDULED',
]);
export type CancelResult = z.infer<typeof cancelResultSchema>;

/** SS-1319 / UC-104 SLA breach; the API projection carries no money or recipient fields. */
export const slaExceptionSchema = z.object({
  id: z.string().uuid(),
  reasonCode: z.enum([
    'SLA.HANDOVER_OVERDUE',
    'SLA.TRACKING_STALLED',
    'DISPATCH.LABEL_RETRIES_EXHAUSTED',
  ]),
  status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']),
  aggregateType: z.enum(['fulfillment_order', 'shipment']),
  aggregateId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  warehouseCode: z.string().max(100),
  trackingNumber: z.string().max(100).nullable(),
  readyAt: z.string().datetime().nullable(),
  deadline: z.string().datetime().nullable(),
  lastProgressAt: z.string().datetime().nullable(),
  stallHours: z.number().int().positive().nullable(),
  isAssigned: z.boolean(),
  isAssignedToMe: z.boolean(),
  resolution: z.enum(['AUTO:HANDED_OVER', 'AUTO:CARRIER_PROGRESS']).nullable(),
  canRetryLabel: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SlaException = z.infer<typeof slaExceptionSchema>;
export const slaExceptionPageSchema = z.object({
  items: z.array(slaExceptionSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasNext: z.boolean(),
    nextCursor: z.string().datetime().nullable(),
  }),
});
