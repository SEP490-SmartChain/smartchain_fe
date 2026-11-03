import { z } from 'zod';

export const visualZoneSchema = z.strictObject({
  zoneId: z.string().uuid(),
  x: z.number().int().min(0).max(255),
  z: z.number().int().min(0).max(255),
  width: z.number().int().min(3).max(128),
  depth: z.number().int().min(3).max(128),
});
export const visualBinSchema = z.strictObject({
  binId: z.string().uuid(),
  x: z.number().int().min(0).max(127),
  z: z.number().int().min(0).max(127),
});
export const visualPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    width: z.number().int().min(16).max(256),
    depth: z.number().int().min(16).max(256),
    zones: z.array(visualZoneSchema).max(100),
    bins: z.array(visualBinSchema).max(1000),
  })
  .refine(
    (plan) =>
      new Set(plan.zones.map((zone) => zone.zoneId)).size === plan.zones.length &&
      new Set(plan.bins.map((bin) => bin.binId)).size === plan.bins.length,
  );
export const visualLayoutSchema = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    plan: visualPlanSchema.nullable(),
    savedAt: z.string().datetime().nullable(),
  })
  .refine((value) =>
    value.revision === 0
      ? value.plan === null && value.savedAt === null
      : value.plan !== null && value.savedAt !== null,
  );
export const saveVisualLayoutSchema = z.strictObject({
  expectedRevision: z.number().int().min(0).max(2147483646),
  plan: visualPlanSchema,
});
export type VisualPlan = z.infer<typeof visualPlanSchema>;
export type VisualZone = VisualPlan['zones'][number];
export type VisualLayout = z.infer<typeof visualLayoutSchema>;
export type VisualEntity = { kind: 'zone' | 'bin'; id: string };
