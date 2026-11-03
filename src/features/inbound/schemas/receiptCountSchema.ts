import { z } from 'zod';

const physicalDate = z.union([z.literal(''), z.iso.date()]);
export interface ReceiptSkuPolicy {
  trackLot: boolean;
  trackExpiry: boolean;
  manufactureRequired: boolean;
  shelfLifeDays: number | null;
}
export function derivedReceiptExpiry(
  manufacturedOn: string,
  shelfLifeDays: number | null,
): string | null {
  if (!z.iso.date().safeParse(manufacturedOn).success || !shelfLifeDays) return null;
  const expiry = new Date(Date.parse(manufacturedOn) + shelfLifeDays * 86_400_000);
  if (!Number.isFinite(expiry.getTime()) || expiry.getUTCFullYear() > 9999) return null;
  return expiry.toISOString().slice(0, 10);
}
export function receiptCountSchemaFor(policy?: ReceiptSkuPolicy) {
  return z
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
              )
              .optional(),
            receivedQty: z.number().int().min(1).max(1_000_000),
            manufacturedOn: physicalDate,
            expiresOn: physicalDate,
          }),
        )
        .max(50),
    })
    .superRefine((value, context) => {
      const requiresLotDates = Boolean(policy?.trackExpiry || policy?.manufactureRequired);
      const canCreateOneInternalLot = policy !== undefined && !requiresLotDates;
      if (
        policy?.trackLot === false
          ? value.lots.length !== 0
          : value.lots.length > 0 &&
            value.lots.reduce((sum, lot) => sum + lot.receivedQty, 0) !== value.receivedQty
      ) {
        context.addIssue({ code: 'custom', path: ['lots'], message: 'countSum' });
      }
      if (value.receivedQty > 0 && !value.lots.length && !canCreateOneInternalLot) {
        context.addIssue({ code: 'custom', path: ['lots'], message: 'countLotsRequired' });
      }
      const lotCodes = value.lots.flatMap((lot) => (lot.lotCode ? [lot.lotCode] : []));
      if (new Set(lotCodes).size !== lotCodes.length) {
        context.addIssue({ code: 'custom', path: ['lots'], message: 'duplicateLot' });
      }
      value.lots.forEach((lot, index) => {
        const requireManufacture =
          policy?.manufactureRequired || (policy?.trackExpiry && !policy.shelfLifeDays);
        if (requireManufacture && !lot.manufacturedOn) {
          context.addIssue({
            code: 'custom',
            path: ['lots', index, 'manufacturedOn'],
            message: 'countManufactureRequired',
          });
        }
        if (
          policy?.trackExpiry &&
          !lot.expiresOn &&
          !(lot.manufacturedOn && policy.shelfLifeDays)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lots', index, 'expiresOn'],
            message: 'countExpiryRequired',
          });
        }
        if (lot.manufacturedOn && lot.expiresOn && lot.expiresOn <= lot.manufacturedOn) {
          context.addIssue({
            code: 'custom',
            path: ['lots', index, 'expiresOn'],
            message: 'countDate',
          });
        }
      });
    });
}
export const receiptCountFormSchema = receiptCountSchemaFor();
export type ReceiptCountFormValues = z.infer<typeof receiptCountFormSchema>;
export interface ReceiptCountInput {
  generateLotCodes?: true;
  operationKey: string;
  expectedVersion: number;
  inboundLineId: string;
  receivedQty: number;
  lots: { receivedQty: number; manufacturedOn?: string; expiresOn?: string }[];
}
export function countCommand(
  values: ReceiptCountFormValues,
  operationKey: string,
  expectedVersion: number,
  policy?: ReceiptSkuPolicy,
): ReceiptCountInput {
  const validated = receiptCountSchemaFor(policy).parse(values);
  const generateLotCodes =
    policy?.trackLot !== false &&
    values.receivedQty > 0 &&
    (validated.lots.length === 0 || validated.lots.some((lot) => !lot.lotCode));
  return {
    ...(generateLotCodes ? { generateLotCodes: true as const } : {}),
    operationKey,
    expectedVersion,
    inboundLineId: validated.inboundLineId,
    receivedQty: validated.receivedQty,
    lots: validated.lots.map((lot) => ({
      ...(lot.lotCode ? { lotCode: lot.lotCode } : {}),
      receivedQty: lot.receivedQty,
      ...(lot.manufacturedOn ? { manufacturedOn: lot.manufacturedOn } : {}),
      ...(lot.expiresOn ? { expiresOn: lot.expiresOn } : {}),
    })),
  };
}
