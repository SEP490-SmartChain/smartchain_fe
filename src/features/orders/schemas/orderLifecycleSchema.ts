import { z } from 'zod';
export const orderCorrectionSchema = z.object({
  recipientName: z.string().trim().min(1).max(150),
  recipientPhone: z.string().regex(/^0\d{9}$/),
  recipientAddress: z.string().trim().min(5).max(500),
  toProvinceCode: z.string().min(1).max(20),
  toWardCode: z.string().min(1).max(20),
});
