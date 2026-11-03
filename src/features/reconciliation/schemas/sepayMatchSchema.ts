import { z } from 'zod';

/** Mirrors the API contract: ORCA invoice numbers are letters, digits and hyphens. */
export const sepayMatchSchema = z.object({
  invoiceNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,64}$/),
});

export type SepayMatchFormValues = z.infer<typeof sepayMatchSchema>;
