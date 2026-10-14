import { z } from 'zod';

export const carrierFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(150),
  isActive: z.boolean(),
});
const optionalLimit = z
  .string()
  .refine(
    (value) =>
      value === '' ||
      (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) < 1000000),
  );
export const carrierServiceFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(150),
  transportMode: z.enum(['ROAD', 'AIR', 'SEA', 'RAIL']),
  volumetricDivisor: z.number().int().min(1).max(1000000),
  maxWeightG: z
    .string()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 2147483647)),
  maxLengthCm: optionalLimit,
  maxWidthCm: optionalLimit,
  maxHeightCm: optionalLimit,
  maxDimensionSumCm: optionalLimit,
  isActive: z.boolean(),
});
export type CarrierFormValues = z.infer<typeof carrierFormSchema>;
export type CarrierServiceFormValues = z.infer<typeof carrierServiceFormSchema>;
export function servicePayload(values: CarrierServiceFormValues) {
  return {
    ...values,
    maxWeightG: values.maxWeightG === '' ? null : Number(values.maxWeightG),
    maxLengthCm: values.maxLengthCm === '' ? null : Number(values.maxLengthCm),
    maxWidthCm: values.maxWidthCm === '' ? null : Number(values.maxWidthCm),
    maxHeightCm: values.maxHeightCm === '' ? null : Number(values.maxHeightCm),
    maxDimensionSumCm: values.maxDimensionSumCm === '' ? null : Number(values.maxDimensionSumCm),
  };
}
