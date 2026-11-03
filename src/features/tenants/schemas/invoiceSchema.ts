import { z } from 'zod';

export const invoiceFiltersSchema = z.object({
  month: z.union([z.literal(''), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]),
  documentType: z.enum(['', 'ONBOARDING', 'PLAN', 'SERVICE', 'ADJUSTMENT']),
});
export const closeInvoicePeriodSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
