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
  carrierAckRef: z.string().trim().min(1).max(120),
  carrierSignerName: z.string().trim().min(1).max(150),
});
