import { z } from 'zod';

const amount = z.string().regex(/^\d{1,12}$/);
export const freightPolicySchema = z.object({
  version: z.literal(1),
  divisor: z.number().int().min(1).max(100000),
  roundingGram: z.number().int().min(1).max(100000),
  returnFeeVnd: amount,
  declaredValuePpm: z.number().int().min(0).max(1000000),
});
export const freightBandSchema = z.object({
  id: z.string().uuid().optional(),
  minWeightG: z.number().int().min(0).max(2000000),
  maxWeightG: z.number().int().min(1).max(2000001).nullable(),
  includedWeightG: z.number().int().min(1).max(2000000),
  stepWeightG: z.number().int().min(1).max(2000000),
  basePriceVnd: amount,
  stepPriceVnd: amount,
});
export const sellerBandSchema = freightBandSchema.extend({
  direction: z.enum(['OUTBOUND', 'RETURN']),
  laneCode: z.enum(['INTRA_PROVINCE', 'INTRA_REGION', 'INTER_REGION']),
  policy: freightPolicySchema,
  referenceBaseVnd: amount,
  referenceStepVnd: amount,
});
const common = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
});
export const purchaseTariffSchema = common.extend({
  carrierId: z.string().uuid(),
  serviceId: z.string().uuid(),
  zone: z.string(),
  volumeTierMin: z.number().int().nonnegative(),
  volumeTierMax: z.number().int().positive().nullable(),
  policy: freightPolicySchema,
  bands: z.array(freightBandSchema).min(1).max(100),
});
export const sellerTariffSchema = common.extend({
  code: z.string(),
  versionNo: z.number().int().positive(),
  referenceSource: z.string(),
  bands: z.array(sellerBandSchema).min(1).max(100),
});
export type PurchaseTariff = z.infer<typeof purchaseTariffSchema>;
export type SellerTariff = z.infer<typeof sellerTariffSchema>;
export type FreightPolicy = z.infer<typeof freightPolicySchema>;
export type FreightBand = z.infer<typeof freightBandSchema>;
export const tariffServiceSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  volumetricDivisor: z.number().int().positive(),
  carrier: z.object({ name: z.string(), code: z.string() }),
});
export type TariffService = z.infer<typeof tariffServiceSchema>;

const utcDate = z
  .string()
  .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
  .refine((v) => {
    const d = new Date(`${v}:00.000Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 16) === v;
  });
export const tariffFormSchema = z
  .object({
    kind: z.enum(['purchase', 'sell']),
    serviceId: z.string(),
    zone: z.string(),
    code: z.string(),
    versionNo: z.number().int().positive(),
    referenceSource: z.string(),
    effectiveFrom: utcDate,
    effectiveTo: z.union([utcDate, z.literal('')]),
    volumeTierMin: z.number().int().nonnegative(),
    volumeTierMax: z.union([z.number().int().positive(), z.null()]),
    policy: freightPolicySchema,
    bands: z
      .array(sellerBandSchema.omit({ id: true }))
      .min(1)
      .max(100),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (v.effectiveTo && v.effectiveTo <= v.effectiveFrom) issue(['effectiveTo'], 'invalid');
    if (v.kind === 'purchase') {
      if (!z.string().uuid().safeParse(v.serviceId).success) issue(['serviceId'], 'invalid');
      if (!/^[A-Z0-9_-]{1,40}$/.test(v.zone)) issue(['zone'], 'invalid');
      if (v.volumeTierMax !== null && v.volumeTierMax <= v.volumeTierMin) {
        issue(['volumeTierMax'], 'invalid');
      }
    } else {
      if (!/^[A-Z0-9_-]{1,40}$/.test(v.code)) issue(['code'], 'invalid');
      if (!v.referenceSource.trim() || v.referenceSource.length > 300) {
        issue(['referenceSource'], 'invalid');
      }
    }
    const groups = new Map<string, { index: number; band: (typeof v.bands)[number] }[]>();
    v.bands.forEach((band, index) => {
      if (band.maxWeightG !== null && band.maxWeightG <= band.minWeightG) {
        issue(['bands', index, 'maxWeightG'], 'invalid');
      }
      if (
        v.kind === 'sell' &&
        [band.basePriceVnd, band.referenceBaseVnd, band.stepPriceVnd, band.referenceStepVnd].every(
          (value) => /^\d{1,12}$/.test(value),
        ) &&
        (BigInt(band.basePriceVnd) > BigInt(band.referenceBaseVnd) ||
          BigInt(band.stepPriceVnd) > BigInt(band.referenceStepVnd))
      ) {
        issue(['bands', index, 'referenceBaseVnd'], 'invalid');
      }
      const key = v.kind === 'purchase' ? 'purchase' : `${band.direction}:${band.laneCode}`;
      groups.set(key, [...(groups.get(key) ?? []), { index, band }]);
    });
    for (const group of groups.values()) {
      group.sort((a, b) => a.band.minWeightG - b.band.minWeightG);
      if (group[0]?.band.minWeightG !== 0) issue(['bands'], 'invalid');
      group.forEach((row, i) => {
        const prev = group[i - 1];
        if (
          prev &&
          (prev.band.maxWeightG === null || prev.band.maxWeightG !== row.band.minWeightG)
        ) {
          issue(['bands', row.index, 'minWeightG'], 'invalid');
        }
      });
    }
  });
export type TariffFormValues = z.infer<typeof tariffFormSchema>;
export function purchaseInput(v: TariffFormValues, service: TariffService) {
  return {
    carrierId: service.carrierId,
    serviceId: service.id,
    zone: v.zone,
    effectiveFrom: `${v.effectiveFrom}:00.000Z`,
    effectiveTo: v.effectiveTo ? `${v.effectiveTo}:00.000Z` : null,
    volumeTierMin: v.volumeTierMin,
    volumeTierMax: v.volumeTierMax,
    policy: v.policy,
    bands: v.bands.map((b) => ({
      minWeightG: b.minWeightG,
      maxWeightG: b.maxWeightG,
      includedWeightG: b.includedWeightG,
      stepWeightG: b.stepWeightG,
      basePriceVnd: b.basePriceVnd,
      stepPriceVnd: b.stepPriceVnd,
    })),
  };
}
export function sellerInput(v: TariffFormValues) {
  return {
    code: v.code,
    versionNo: v.versionNo,
    referenceSource: v.referenceSource,
    effectiveFrom: `${v.effectiveFrom}:00.000Z`,
    effectiveTo: v.effectiveTo ? `${v.effectiveTo}:00.000Z` : null,
    bands: v.bands,
  };
}
