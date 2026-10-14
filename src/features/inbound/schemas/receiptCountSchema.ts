import { z } from 'zod';

const physicalDate = z.union([z.literal(''), z.iso.date()]);
export const receiptCountFormSchema = z
  .object({
    inboundLineId: z.string().uuid(),
    receivedQty: z.number().int().min(0).max(1_000_000),
    lots: z
      .array(
        z.object({
          lotCode: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .refine(
              (value) =>
                !Array.from(value).some(
                  (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
                ),
            ),
          receivedQty: z.number().int().min(1).max(1_000_000),
          manufacturedOn: physicalDate,
          expiresOn: physicalDate,
        }),
      )
      .max(50),
  })
  .superRefine((value, context) => {
    if (value.lots.reduce((sum, lot) => sum + lot.receivedQty, 0) !== value.receivedQty) {
      context.addIssue({ code: 'custom', path: ['lots'], message: 'countSum' });
    }
    if (new Set(value.lots.map((lot) => lot.lotCode)).size !== value.lots.length) {
      context.addIssue({ code: 'custom', path: ['lots'], message: 'duplicateLot' });
    }
    value.lots.forEach((lot, index) => {
      if (lot.manufacturedOn && lot.expiresOn && lot.expiresOn <= lot.manufacturedOn) {
        context.addIssue({
          code: 'custom',
          path: ['lots', index, 'expiresOn'],
          message: 'countDate',
        });
      }
    });
  });
export type ReceiptCountFormValues = z.infer<typeof receiptCountFormSchema>;
export interface ReceiptCountInput {
  operationKey: string;
  expectedVersion: number;
  inboundLineId: string;
  receivedQty: number;
  lots: { lotCode: string; receivedQty: number; manufacturedOn?: string; expiresOn?: string }[];
}
export function countCommand(
  values: ReceiptCountFormValues,
  operationKey: string,
  expectedVersion: number,
): ReceiptCountInput {
  const validated = receiptCountFormSchema.parse(values);
  return {
    operationKey,
    expectedVersion,
    inboundLineId: validated.inboundLineId,
    receivedQty: validated.receivedQty,
    lots: validated.lots.map((lot) => ({
      lotCode: lot.lotCode,
      receivedQty: lot.receivedQty,
      ...(lot.manufacturedOn ? { manufacturedOn: lot.manufacturedOn } : {}),
      ...(lot.expiresOn ? { expiresOn: lot.expiresOn } : {}),
    })),
  };
}
