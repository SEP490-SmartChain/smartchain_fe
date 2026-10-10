import { z } from 'zod';

export const asnFormSchema = z.object({
  warehouseId: z.string().uuid(),
  externalReference: z.string().trim().max(100),
  expectedArrivalAt: z.string().refine((value) => !value || Number.isFinite(Date.parse(value))),
  cartonCount: z.number().int().min(1).max(1000),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        declaredQty: z.number().int().min(1).max(1000000),
        declaredLotCode: z.string().trim().max(100),
        declaredExpiryOn: z.union([z.literal(''), z.iso.date()]),
      }),
    )
    .min(1)
    .max(100),
});
export const cancelAsnSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type AsnFormValues = z.infer<typeof asnFormSchema>;
