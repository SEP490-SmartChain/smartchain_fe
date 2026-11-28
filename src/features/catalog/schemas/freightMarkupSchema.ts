import { z } from 'zod';

export const freightMarkupFormSchema = z.strictObject({
  markupVnd: z
    .string()
    .trim()
    .regex(/^(0|[1-9][0-9]{0,11})$/),
});

export const freightMarkupSchema = freightMarkupFormSchema.extend({
  version: z.number().int().positive(),
});

export type FreightMarkup = z.infer<typeof freightMarkupSchema>;
