import { z } from 'zod';

export const zoneFormSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/),
  zoneType: z.enum(['RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE']),
  isActive: z.boolean(),
});
export type ZoneFormValues = z.infer<typeof zoneFormSchema>;
export const binFormSchema = z
  .object({
    code: z
      .string()
      .max(100)
      .regex(/^[A-Z0-9_-]*$/),
    maxWeightG: z.string().regex(/^[1-9]\d{0,17}$/),
    maxVolumeM3: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/)
      .refine((value) => Number(value) > 0),
    isActive: z.boolean(),
    mode: z.enum(['single', 'bulk']),
    aisleStart: z.number().int().min(1).max(99),
    aisleCount: z.number().int().min(1).max(99),
    rackStart: z.number().int().min(1).max(99),
    rackCount: z.number().int().min(1).max(99),
    levelStart: z.number().int().min(1).max(99),
    levelCount: z.number().int().min(1).max(99),
  })
  .superRefine((value, context) => {
    if (value.mode === 'single' && !value.code) {
      context.addIssue({ code: 'custom', path: ['code'], message: 'required' });
    }
    if (
      value.mode === 'bulk' &&
      (value.aisleCount * value.rackCount * value.levelCount > 200 ||
        value.aisleStart + value.aisleCount > 100 ||
        value.rackStart + value.rackCount > 100 ||
        value.levelStart + value.levelCount > 100)
    ) {
      context.addIssue({ code: 'custom', path: ['aisleCount'], message: 'bulkRange' });
    }
  });
export type BinFormValues = z.infer<typeof binFormSchema>;
