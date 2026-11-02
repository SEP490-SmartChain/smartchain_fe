import { z } from 'zod';

const dimension = z.string().regex(/^[1-9]\d{0,3}(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/);
export const packingFormSchema = z.object({
  actualWeightG: z.number().int().min(1).max(1000000),
  actualLengthCm: dimension,
  actualWidthCm: dimension,
  actualHeightCm: dimension,
  contents: z
    .array(z.object({ itemId: z.uuid(), qty: z.number().int().min(1).max(1000000) }))
    .min(1)
    .max(100),
  materialCode: z.string().regex(/^(?:[A-Z0-9_-]{1,40})?$/),
  materialQty: z.string().regex(/^[1-9]\d{0,5}$/),
});
export const handoverAckSchema = z.object({
  confirmedParcelCount: z.number().int().min(1).max(100),
  carrierAckRef: z.string().trim().max(120).optional(),
  carrierSignerName: z.string().trim().min(1).max(150),
  evidenceKey: z.string().trim().min(1).max(500),
});
export const putbackFormSchema = z.object({
  binCode: z.string().min(1).max(150),
  sku: z.string().min(1).max(150),
  lotCode: z.string().min(1).max(150),
  qty: z.number().int().positive(),
});
