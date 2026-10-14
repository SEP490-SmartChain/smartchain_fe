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
