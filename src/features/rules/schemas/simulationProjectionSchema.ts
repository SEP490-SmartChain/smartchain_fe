import { z } from 'zod';

const code = z
  .string()
  .regex(/^[\w .:/-]{1,128}$/)
  .refine(
    (value) => value.trim() === value && !['__proto__', 'prototype', 'constructor'].includes(value),
  );
const qty = z.number().int().min(0).max(1_000_000);
const money = z.string().regex(/^(0|[1-9]\d{0,17})$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
export const allocationSnapshotSchema = z
  .object({
    asOf: date,
    destinationProvince: code,
    destinationRegion: code,
    items: z
      .array(
        z
          .object({
            productId: code,
            qty: qty.min(1),
            unitValueVnd: money,
            trackExpiry: z.boolean(),
            minOutboundDays: qty.max(3650),
            active: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    warehouses: z
      .array(
        z
          .object({
            id: code,
            province: code,
            region: code,
            eligible: z.boolean(),
            estimatedFreightVnd: money.nullable(),
          })
          .strict(),
      )
      .max(20),
    stock: z
      .array(
        z
          .object({
            id: code,
            warehouseId: code,
            productId: code,
            lotId: code,
            binId: code,
            availableQty: qty,
            expiresOn: date.nullable(),
            receivedOn: date,
            lotStatus: z.enum([
              'SELLABLE',
              'NEAR_EXPIRY',
              'NEAR_EXPIRY_LOCKED',
              'EXPIRED',
              'RECALLED',
              'QUARANTINE',
            ]),
            stockState: z.enum(['SELLABLE', 'QUARANTINE', 'RECEIVING']),
            activePosition: z.boolean(),
            storageZone: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    codVnd: money,
    buyerFreightVnd: money,
    splitPenaltyVnd: money,
    expiryRiskVndPerUnitDay: money,
  })
  .strict();
export type AllocationSnapshot = z.infer<typeof allocationSnapshotSchema>;
const measurement = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);
const weight = z.number().int().min(1).max(2_147_483_647);
export const carrierSnapshotSchema = z
  .object({
    measurements: z
      .object({
        weightGram: weight,
        lengthCm: measurement,
        widthCm: measurement,
        heightCm: measurement,
      })
      .strict(),
    direction: z.enum(['OUTBOUND', 'RETURN']),
    declaredValueVnd: money,
    tariffs: z
      .array(
        z
          .object({
            serviceId: z
              .string()
              .uuid()
              .transform((value) => value.toLowerCase()),
            version: code,
            eligible: z.boolean(),
            policy: z
              .object({
                version: z.literal(1),
                divisor: qty.min(1),
                roundingGram: weight,
                returnFeeVnd: money,
                declaredValuePpm: qty,
              })
              .strict(),
            bands: z
              .array(
                z
                  .object({
                    minWeightG: z.number().int().min(0).max(2_147_483_647),
                    maxWeightG: weight.nullable(),
                    includedWeightG: weight,
                    stepWeightG: weight,
                    basePriceVnd: money,
                    stepPriceVnd: money,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(11),
  })
  .strict();
export type CarrierSnapshot = z.infer<typeof carrierSnapshotSchema>;
export const simulationProjectionSchema = z.union([
  allocationSnapshotSchema,
  carrierSnapshotSchema,
]);

const reference = code;
export const allocationProjectionSchema = z
  .object({
    basis: z.literal('SIMULATED_INPUT'),
    strategy: z.enum(['NEAREST_WAREHOUSE', 'EXPIRY_FIRST', 'TOTAL_COST']),
    status: z.enum(['PLANNED', 'BACKORDER', 'MANUAL_REVIEW']),
    reason: z.enum([
      'NEAREST_WAREHOUSE',
      'EXPIRY_FIRST',
      'TOTAL_COST',
      'INSUFFICIENT_ELIGIBLE_STOCK',
      'PARCEL_LIMIT',
      'ALLOCATION_COST_INPUT_REQUIRED',
    ]),
    candidates: z
      .array(
        z
          .object({
            warehouseId: reference,
            proximity: z.number().int().min(0).max(2),
            eligible: z.boolean(),
            stock: z.record(reference, z.number().int().min(0).max(200_000_000)),
          })
          .strict(),
      )
      .max(20),
    lots: z
      .array(
        z
          .object({
            stockId: reference,
            warehouseId: reference,
            lotId: reference,
            eligible: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    parcels: z
      .array(
        z
          .object({
            warehouseId: reference,
            codVnd: money,
            lines: z
              .array(
                z
                  .object({
                    productId: reference,
                    qty: qty.min(1),
                    lots: z
                      .array(
                        z
                          .object({
                            stockId: reference,
                            lotId: reference,
                            binId: reference,
                            qty: qty.min(1),
                          })
                          .strict(),
                      )
                      .min(1)
                      .max(200),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .max(3),
    estimatedTotalVnd: z
      .string()
      .regex(/^(0|[1-9]\d{0,30})$/)
      .nullable(),
    globalOptimum: z.literal(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const candidates = new Map(value.candidates.map((row) => [row.warehouseId, row]));
    const lots = new Map(value.lots.map((row) => [row.stockId, row]));
    const used = value.parcels.flatMap((parcel) =>
      parcel.lines.flatMap((line) => line.lots.map((lot) => lot.stockId)),
    );
    const consistent =
      candidates.size === value.candidates.length &&
      lots.size === value.lots.length &&
      new Set(value.parcels.map((row) => row.warehouseId)).size === value.parcels.length &&
      new Set(used).size === used.length &&
      (value.status === 'PLANNED' ? value.parcels.length > 0 : value.parcels.length === 0) &&
      (value.status === 'PLANNED'
        ? value.reason === value.strategy
        : value.status === 'BACKORDER'
          ? value.reason === 'INSUFFICIENT_ELIGIBLE_STOCK'
          : ['PARCEL_LIMIT', 'ALLOCATION_COST_INPUT_REQUIRED'].includes(value.reason)) &&
      value.parcels.every(
        (parcel) =>
          candidates.get(parcel.warehouseId)?.eligible &&
          parcel.lines.every(
            (line) =>
              line.lots.reduce((sum, row) => sum + row.qty, 0) === line.qty &&
              line.lots.every(
                (lot) =>
                  lots.get(lot.stockId)?.eligible &&
                  lots.get(lot.stockId)?.warehouseId === parcel.warehouseId &&
                  lots.get(lot.stockId)?.lotId === lot.lotId,
              ),
          ),
      );
    if (!consistent) ctx.addIssue({ code: 'custom', message: 'Inconsistent synthetic allocation' });
  });
export const carrierProjectionSchema = z
  .object({
    basis: z.literal('SIMULATED_INPUT'),
    selectedServiceId: z.string().uuid().nullable(),
    candidates: z
      .array(
        z
          .object({
            serviceId: z.string().uuid(),
            status: z.enum(['QUOTED', 'UNAVAILABLE']),
            reason: z
              .enum(['MISSING_TARIFF', 'MISSING_BAND', 'SIMULATED_SERVICE_UNAVAILABLE'])
              .nullable(),
            tariffVersion: code.nullable(),
            roundedWeightG: weight.nullable(),
            totalVnd: z
              .string()
              .regex(/^(0|[1-9]\d{0,19})$/)
              .nullable(),
          })
          .strict(),
      )
      .max(11),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.candidates.map((row) => row.serviceId)).size !== value.candidates.length ||
      (value.candidates.find((row) => row.status === 'QUOTED')?.serviceId ?? null) !==
        value.selectedServiceId ||
      value.candidates.some((row) =>
        row.status === 'QUOTED'
          ? row.reason !== null ||
            row.totalVnd === null ||
            row.roundedWeightG === null ||
            row.tariffVersion === null
          : row.reason === null || row.totalVnd !== null || row.roundedWeightG !== null,
      )
    ) {
      ctx.addIssue({ code: 'custom', message: 'Inconsistent synthetic carrier quote' });
    }
  });
