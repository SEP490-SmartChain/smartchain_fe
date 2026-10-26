import { z } from 'zod';

export const withdrawalAddressFormSchema = z
  .object({
    recipientName: z.string().trim().min(1).max(150),
    recipientPhone: z.string().regex(/^0[0-9]{9}$/),
    address: z.string().trim().min(5).max(500),
    provinceCode: z.string().length(2),
    wardCode: z.string().length(5),
  })
  .strict();
export const withdrawalFormSchema = z
  .object({
    selection: z.string().min(1),
    qty: z.number().int().min(1).max(1000000),
  })
  .strict();
export const withdrawalCommandSchema = z
  .object({
    clientRequestId: z.uuid(),
    warehouseId: z.uuid(),
    productId: z.uuid(),
    lotId: z.uuid(),
    qty: z.number().int().min(1).max(1000000),
    addressVersion: z.number().int().positive(),
  })
  .strict();
