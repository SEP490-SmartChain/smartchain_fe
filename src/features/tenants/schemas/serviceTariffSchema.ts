import { z } from 'zod';

export const SERVICE_FEE_UNITS = {
  PICK_PACK_ORDER: 'ORDER',
  INBOUND_CARTON: 'CARTON',
  RETURN_HANDLING: 'PARCEL',
  STORAGE_M3_DAY: 'M3_DAY',
  COMBO: 'COMBO',
  PACKING_MATERIAL: 'UNIT',
} as const;

const quantity = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/);
const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
export const serviceTariffLineSchema = z.object({
  feeType: z.enum([
    'PICK_PACK_ORDER',
    'INBOUND_CARTON',
    'RETURN_HANDLING',
    'STORAGE_M3_DAY',
    'COMBO',
    'PACKING_MATERIAL',
  ]),
  unit: z.string(),
  lowerBound: quantity,
  upperBound: quantity.nullable(),
  unitPriceVnd: money,
  rounding: z.literal('CEIL_VND'),
});
export const serviceTariffSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  versionNo: z.number().int().positive(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  effectiveFrom: z.iso.datetime({ offset: true }),
  effectiveTo: z.iso.datetime({ offset: true }).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  lines: z.array(serviceTariffLineSchema),
});
export type ServiceTariff = z.infer<typeof serviceTariffSchema>;

function scaled(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'));
}
export const serviceTariffFormSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_-]{1,63}$/),
    versionNo: z.number().int().positive(),
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveTo: z.union([z.iso.datetime({ offset: true }), z.literal('')]),
    reason: z.string().trim().min(1).max(500),
    lines: z.array(serviceTariffLineSchema).min(1).max(100),
  })
  .superRefine((input, ctx) => {
    if (
      input.lines.some(
        (line) =>
          !quantity.safeParse(line.lowerBound).success ||
          (line.upperBound !== null && !quantity.safeParse(line.upperBound).success),
      )
    ) {
      return;
    }
    if (input.effectiveTo && new Date(input.effectiveTo) <= new Date(input.effectiveFrom)) {
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'invalid' });
    }
    input.lines.forEach((line, index) => {
      if (
        SERVICE_FEE_UNITS[line.feeType] !== line.unit ||
        (line.upperBound !== null && scaled(line.upperBound) <= scaled(line.lowerBound))
      ) {
        ctx.addIssue({ code: 'custom', path: ['lines', index], message: 'invalid' });
      }
    });
    for (const type of Object.keys(SERVICE_FEE_UNITS)) {
      const lines = input.lines
        .filter((line) => line.feeType === type)
        .sort((a, b) => (scaled(a.lowerBound) < scaled(b.lowerBound) ? -1 : 1));
      if (!lines.length) continue;
      if (
        scaled(lines[0]?.lowerBound ?? '1') !== BigInt(0) ||
        lines.at(-1)?.upperBound !== null ||
        lines.some(
          (line, i) =>
            i > 0 &&
            (lines[i - 1]?.upperBound === null ||
              scaled(lines[i - 1]?.upperBound ?? '0') !== scaled(line.lowerBound)),
        )
      ) {
        ctx.addIssue({ code: 'custom', path: ['lines'], message: 'invalid' });
      }
    }
  });
export type ServiceTariffForm = z.infer<typeof serviceTariffFormSchema>;

export const serviceTariffCommandSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  effectiveTo: z.union([z.iso.datetime({ offset: true }), z.literal('')]),
});
