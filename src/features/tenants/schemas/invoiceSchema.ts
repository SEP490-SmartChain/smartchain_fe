import { z } from 'zod';

import { vietnamToday } from '@/lib/dateValidation';

export const invoiceFiltersSchema = z.object({
  month: z.union([z.literal(''), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]),
  documentType: z.enum(['', 'ONBOARDING', 'PLAN', 'SERVICE', 'ADJUSTMENT']),
});
export function closeInvoicePeriodSchemaFor(clock = () => new Date()) {
  return z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .refine(
        (month) =>
          month >= '2020-01' && month <= '9998-12' && month < vietnamToday(clock()).slice(0, 7),
      ),
  });
}
export const closeInvoicePeriodSchema = closeInvoicePeriodSchemaFor();
