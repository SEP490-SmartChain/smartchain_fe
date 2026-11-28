import { z } from 'zod';

export const TIERS = ['ECONOMY', 'BALANCED', 'EXPRESS'] as const;
export const tierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof tierSchema>;

export const QUOTE_REASONS = [
  'TEMPORARY',
  'ADDRESS_UNMAPPED',
  'ETA_UNAVAILABLE',
  'NO_QUOTE',
  'UNSERVICEABLE',
] as const;
export const quoteReasonSchema = z.enum(QUOTE_REASONS);
export type QuoteReason = z.infer<typeof quoteReasonSchema>;

/** 12-digit nonnegative integer VND string for seller input forms and quotes. */
export const inputVndSchema = z.string().regex(/^(0|[1-9]\d{0,11})$/);

/** Positive integer VND string (> 0) required for valid carrier freight quotes. */
export const positiveQuoteVndSchema = z.string().regex(/^[1-9]\d{0,12}$/);

/** Unbounded nonnegative integer VND string for recorded ledger/aggregate totals. */
export const recordedVndSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export type Vnd = z.infer<typeof inputVndSchema>;

export const originSchema = z
  .object({
    id: z.uuid({ version: 'v4' }),
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
  })
  .strict();
export type Origin = z.infer<typeof originSchema>;

export const originsResponseSchema = z
  .object({
    items: z.array(originSchema),
  })
  .strict();
export type OriginsResponse = z.infer<typeof originsResponseSchema>;

export const positiveSafeIntSchema = z.number().int().min(1).max(10_000_000);

export const parcelDimensionsSchema = z
  .object({
    weightG: z.number().int().min(1).max(1_000_000),
    lengthCm: z.number().int().min(1).max(1000),
    widthCm: z.number().int().min(1).max(1000),
    heightCm: z.number().int().min(1).max(1000),
    itemCount: z.number().int().min(1).max(1_000_000),
  })
  .strict();
export type ParcelDimensions = z.infer<typeof parcelDimensionsSchema>;

export const estimateInputSchema = z
  .object({
    originWarehouseId: z.uuid({ version: 'v4' }),
    toProvinceCode: z.string().trim().min(1).max(20),
    toWardCode: z.string().trim().min(1).max(20),
    parcel: parcelDimensionsSchema,
    declaredValueVnd: inputVndSchema,
    codVnd: inputVndSchema,
  })
  .strict();
export type EstimateInput = z.infer<typeof estimateInputSchema>;

const quotedTierSchema = z
  .object({
    tier: tierSchema,
    status: z.literal('QUOTED'),
    amountVnd: positiveQuoteVndSchema,
    deliveryDays: z.number().finite().min(0).nullable(),
  })
  .strict();

const unavailableTierSchema = z
  .object({
    tier: tierSchema,
    status: z.literal('UNAVAILABLE'),
    reason: quoteReasonSchema,
  })
  .strict();

export const tierResultSchema = z.discriminatedUnion('status', [
  quotedTierSchema,
  unavailableTierSchema,
]);
export type TierResult = z.infer<typeof tierResultSchema>;

export const estimateResultSchema = z
  .object({
    basis: z.literal('ONE_PARCEL_ASSUMPTION'),
    origin: originSchema,
    input: estimateInputSchema,
    quotedAt: z.iso.datetime(),
    refreshAfter: z.iso.datetime(),
    tiers: z.tuple([tierResultSchema, tierResultSchema, tierResultSchema]),
  })
  .strict()
  .refine(
    (result) =>
      result.tiers[0].tier === 'ECONOMY' &&
      result.tiers[1].tier === 'BALANCED' &&
      result.tiers[2].tier === 'EXPRESS',
    { path: ['tiers'], message: 'Tiers must appear in ECONOMY, BALANCED, EXPRESS order.' },
  );
export type EstimateResult = z.infer<typeof estimateResultSchema>;

export const orderLookupAssumptionSchema = z
  .object({
    fulfillmentOrderId: z.uuid({ version: 'v4' }).nullable(),
    originWarehouseId: z.uuid({ version: 'v4' }).optional(),
    parcel: parcelDimensionsSchema.optional(),
  })
  .strict();
export type OrderLookupAssumption = z.infer<typeof orderLookupAssumptionSchema>;

export const orderLookupItemSchema = z
  .object({
    orderId: z.uuid({ version: 'v4' }),
    assumptions: z.array(orderLookupAssumptionSchema).max(10).optional(),
  })
  .strict();
export type OrderLookupItem = z.infer<typeof orderLookupItemSchema>;

export const orderStatusRequestSchema = z
  .object({
    includeDispatchReview: z.boolean().optional(),
    orderIds: z
      .array(z.uuid({ version: 'v4' }))
      .min(1)
      .max(100),
  })
  .strict()
  .refine((value) => new Set(value.orderIds).size === value.orderIds.length, {
    path: ['orderIds'],
  });

export const orderLookupRequestSchema = z
  .object({
    includeDispatchReview: z.boolean().optional(),
    items: z.array(orderLookupItemSchema).min(1).max(5),
  })
  .strict()
  .refine((value) => new Set(value.items.map((item) => item.orderId)).size === value.items.length, {
    path: ['items'],
  });

export const parcelInputFieldSchema = z.enum(['origin', 'parcel', 'oneParcelConfirmation']);
export type ParcelInputField = z.infer<typeof parcelInputFieldSchema>;

export const orderParcelUnavailableReasonSchema = z.enum([
  ...QUOTE_REASONS,
  'ORIGIN_UNAVAILABLE',
  'ORDER_DATA_CHANGED',
  'ORDER_DATA_INCOMPLETE',
]);
export type OrderParcelUnavailableReason = z.infer<typeof orderParcelUnavailableReasonSchema>;

export const parcelFreightSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('APPROVED'),
    amountVnd: recordedVndSchema,
    bookingState: z.enum(['BOOKING_PENDING', 'RECORDED_FEE_MISSING']).optional(),
  }),
  z.strictObject({
    state: z.literal('REVIEW_REQUIRED'),
    reason: z.enum(['PRICE_CHANGED', 'SERVICE_UNAVAILABLE']),
    previousAmountVnd: recordedVndSchema,
    newAmountVnd: recordedVndSchema.nullable(),
    canChoose: z.boolean(),
  }),
  z
    .object({
      state: z.literal('RECORDED'),
      amountVnd: recordedVndSchema,
      recordedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      state: z.literal('ESTIMATED'),
      amountVnd: positiveQuoteVndSchema,
      quotedAt: z.iso.datetime(),
      refreshAfter: z.iso.datetime(),
      tier: tierSchema,
      basis: z.enum(['ASSUMED', 'PACKED']),
      origin: originSchema,
    })
    .strict(),
  z
    .object({
      state: z.enum(['NOT_QUOTED', 'BOOKING_PENDING', 'RECORDED_FEE_MISSING', 'NOT_APPLICABLE']),
    })
    .strict(),
  z
    .object({
      state: z.literal('NEEDS_INPUT'),
      fields: z.array(parcelInputFieldSchema).min(1),
    })
    .strict(),
  z
    .object({
      state: z.literal('UNAVAILABLE'),
      reason: orderParcelUnavailableReasonSchema,
    })
    .strict(),
]);
export type ParcelFreight = z.infer<typeof parcelFreightSchema>;

export const freightSubtotalGroupSchema = z
  .object({
    count: z.number().int().nonnegative(),
    subtotalVnd: recordedVndSchema.nullable(),
  })
  .strict();
export type FreightSubtotalGroup = z.infer<typeof freightSubtotalGroupSchema>;

export const orderFreightRowSchema = z.discriminatedUnion('state', [
  z
    .object({
      orderId: z.uuid({ version: 'v4' }),
      state: z.literal('NOT_FOUND'),
    })
    .strict(),
  z
    .object({
      orderId: z.uuid({ version: 'v4' }),
      state: z.literal('VISIBLE'),
      orderVersion: z.number().int().nonnegative(),
      sourceRevision: z.string().min(1),
      asOf: z.iso.datetime(),
      parcelCount: z.number().int().nonnegative().nullable(),
      recorded: freightSubtotalGroupSchema,
      estimated: freightSubtotalGroupSchema,
      parcels: z.array(
        z
          .object({
            fulfillmentOrderId: z.uuid({ version: 'v4' }).nullable(),
            parcelNumber: z.number().int().positive().optional(),
            trackingNumber: z.string().trim().min(1).max(128).nullable().optional(),
            carrierCode: z.string().trim().min(1).max(32).nullable().optional(),
            freight: parcelFreightSchema,
          })
          .strict(),
      ),
    })
    .strict(),
]);
export type OrderFreightRow = z.infer<typeof orderFreightRowSchema>;

export const orderFreightListResponseSchema = z
  .object({
    items: z.array(orderFreightRowSchema),
  })
  .strict();
export type OrderFreightListResponse = z.infer<typeof orderFreightListResponseSchema>;
