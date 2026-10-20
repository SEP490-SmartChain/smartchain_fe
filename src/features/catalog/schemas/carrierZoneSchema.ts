import { z } from 'zod';

export const carrierZoneFormSchema = z.object({
  fromProvince: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  toProvince: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  zone: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,40}$/),
  etaDays: z.number().int().min(1).max(60),
});
export const routeSchema = carrierZoneFormSchema.extend({
  id: z.uuid(),
  carrierId: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export type CarrierZone = z.infer<typeof routeSchema>;
export type CarrierZoneForm = z.infer<typeof carrierZoneFormSchema>;
