import { z } from 'zod';

import { recordedLocalDateTimeSchema } from '@/lib/dateValidation';

export const remittanceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('MANUAL'),
    bankReference: z.string().trim().min(1).max(100),
    amountVnd: z.string().regex(/^[1-9]\d{0,17}$/),
    receivedAt: recordedLocalDateTimeSchema,
    evidenceRef: z.string().trim().min(3).max(500),
  }),
  z.object({ source: z.literal('SEPAY'), notificationId: z.string().uuid() }),
]);
export type RemittanceValues = z.infer<typeof remittanceSchema>;
