import { z } from 'zod';

export const orderPolicyFormSchema = z.object({
  holdRiskyCod: z.boolean(),
  holdCodMinAmount: z.string().regex(/^[1-9]\d{0,11}$/),
});
