import { z } from 'zod';

export const qcReasons = ['NONE', 'DAMAGED', 'SHORT_SHELF_LIFE', 'OTHER'] as const;
const quantity = z.number().int().min(0).max(1_000_000);
export const inspectionValuesSchema = z.object({
  acceptedQty: quantity,
  quarantinedQty: quantity,
  rejectedQty: quantity,
  reasonCode: z.enum(qcReasons),
  reason: z
    .string()
    .trim()
    .max(1000)
    .refine((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
      }),
    ),
  photoIds: z
    .array(z.string().uuid())
    .max(10)
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length),
});
export type InspectionValues = z.infer<typeof inspectionValuesSchema>;
export interface InspectionInput extends InspectionValues {
  operationKey: string;
  expectedVersion: number;
}
export function inspectionFormSchema(actual: number, requiresQuarantine: boolean) {
  return inspectionValuesSchema.superRefine((value, context) => {
    if (value.acceptedQty + value.quarantinedQty + value.rejectedQty !== actual || actual <= 0) {
      context.addIssue({ code: 'custom', message: 'qcSumInvalid', path: ['acceptedQty'] });
    }
    if (requiresQuarantine && value.acceptedQty > 0) {
      context.addIssue({ code: 'custom', message: 'qcAcceptanceBlocked', path: ['acceptedQty'] });
    }
    const exceptional = value.quarantinedQty + value.rejectedQty > 0;
    if (
      (exceptional && (value.reasonCode === 'NONE' || !value.reason)) ||
      (!exceptional && value.reasonCode !== 'NONE')
    ) {
      context.addIssue({ code: 'custom', message: 'qcReasonRequired', path: ['reason'] });
    }
    if (value.reasonCode === 'DAMAGED' && !value.photoIds.length) {
      context.addIssue({ code: 'custom', message: 'qcPhotoRequired', path: ['photoIds'] });
    }
  });
}
