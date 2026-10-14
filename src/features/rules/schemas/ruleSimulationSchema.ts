import { z } from 'zod';

const uuid = z.string().uuid();
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().min(1).max(2147483646);
const text = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value);
export const simulationRequestSchema = z
  .object({
    kind: z.enum(['ALLOCATION', 'CARRIER']),
    sample: z
      .object({
        sellerId: uuid,
        provinceCode: text.optional(),
        wardCode: text.optional(),
        warehouseId: uuid.optional(),
        weightG: integer.optional(),
        itemCount: integer.optional(),
        codAmountVnd: z
          .string()
          .regex(/^(0|[1-9]\d{0,17})$/)
          .optional(),
        isCod: z.boolean().optional(),
      })
      .strict(),
    candidate: z.object({ ruleId: uuid, version }).strict().optional(),
  })
  .strict();
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
const action = z.union([
  z.object({ strategy: z.enum(['NEAREST_WAREHOUSE', 'EXPIRY_FIRST', 'TOTAL_COST']) }).strict(),
  z
    .object({ carrierServiceId: uuid, fallbackServiceIds: z.array(uuid).max(10) })
    .strict()
    .refine(
      (value) =>
        new Set(value.fallbackServiceIds).size === value.fallbackServiceIds.length &&
        !value.fallbackServiceIds.includes(value.carrierServiceId),
    ),
]);
const common = {
  ruleId: uuid,
  ruleVersion: version,
  name: z.string().min(3).max(150),
  priority: z.number().int().min(0).max(2147483647),
  scope: z.enum(['SELLER_EXCEPTION', 'GLOBAL']),
};
export const simulationResponseSchema = z
  .object({
    kind: z.enum(['ALLOCATION', 'CARRIER']),
    mode: z.enum(['PUBLISHED', 'SAVED_VERSION']),
    match: z
      .object({ ...common, action })
      .strict()
      .nullable(),
    trace: z
      .array(
        z
          .object({
            ...common,
            outcome: z.enum([
              'OTHER_SELLER',
              'OTHER_WAREHOUSE',
              'MISSING_FACTS',
              'NOT_MATCHED',
              'MATCHED',
              'SELECTED',
            ]),
            missingFields: z
              .array(
                z.enum([
                  'tenantId',
                  'provinceCode',
                  'wardCode',
                  'warehouseId',
                  'weightG',
                  'itemCount',
                  'codAmountVnd',
                  'isCod',
                ]),
              )
              .max(8),
          })
          .strict(),
      )
      .max(500),
    carrierServices: z
      .array(
        z
          .object({ id: uuid, name: z.string().min(1), role: z.enum(['PRIMARY', 'FALLBACK']) })
          .strict(),
      )
      .max(11),
    pending: z.array(z.enum(['ALLOCATION_PREVIEW', 'CARRIER_QUOTE'])).max(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const selected = value.trace.filter((row) => row.outcome === 'SELECTED');
    let valid = new Set(value.trace.map((row) => row.ruleId)).size === value.trace.length;
    if (!value.match) {
      valid &&=
        selected.length === 0 && value.pending.length === 0 && value.carrierServices.length === 0;
    } else {
      const match = value.match;
      valid &&=
        selected.length === 1 &&
        selected[0]?.ruleId === match.ruleId &&
        selected[0]?.ruleVersion === match.ruleVersion &&
        selected[0]?.priority === match.priority &&
        selected[0]?.scope === match.scope &&
        selected[0]?.name === match.name;
      valid &&=
        value.pending[0] === (value.kind === 'ALLOCATION' ? 'ALLOCATION_PREVIEW' : 'CARRIER_QUOTE');
      if (value.kind === 'ALLOCATION') {
        valid &&= 'strategy' in match.action && value.carrierServices.length === 0;
      } else if ('carrierServiceId' in match.action) {
        const ids = [match.action.carrierServiceId, ...match.action.fallbackServiceIds];
        valid &&=
          ids.length === value.carrierServices.length &&
          ids.every(
            (id, index) =>
              value.carrierServices[index]?.id === id &&
              value.carrierServices[index]?.role === (index === 0 ? 'PRIMARY' : 'FALLBACK'),
          );
      } else valid = false;
    }
    if (!valid) ctx.addIssue({ code: 'custom', message: 'Inconsistent simulation result' });
  });
export type SimulationResult = z.infer<typeof simulationResponseSchema>;
export const simulationFormSchema = (error: string) =>
  z
    .object({
      sellerId: z.string().trim().uuid(error),
      provinceCode: z.string().trim().max(128, error),
      wardCode: z.string().trim().max(128, error),
      warehouseId: z
        .string()
        .refine((value) => value === '' || uuid.safeParse(value).success, error),
      weightG: z
        .string()
        .refine(
          (value) =>
            value === '' || (/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))),
          error,
        ),
      itemCount: z
        .string()
        .refine(
          (value) =>
            value === '' || (/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))),
          error,
        ),
      codAmountVnd: z
        .string()
        .refine((value) => value === '' || /^(0|[1-9]\d{0,17})$/.test(value), error),
      isCod: z.enum(['', 'true', 'false']),
      ruleId: z.string().refine((value) => value === '' || uuid.safeParse(value).success, error),
      ruleVersion: z.string(),
    })
    .superRefine((value, ctx) => {
      if (
        value.ruleId &&
        (!/^[1-9]\d*$/.test(value.ruleVersion) ||
          !version.safeParse(Number(value.ruleVersion)).success)
      ) {
        ctx.addIssue({ code: 'custom', message: error, path: ['ruleVersion'] });
      }
    });
export type SimulationForm = z.infer<ReturnType<typeof simulationFormSchema>>;
export function toSimulationRequest(
  kind: SimulationRequest['kind'],
  value: SimulationForm,
): SimulationRequest {
  return simulationRequestSchema.parse({
    kind,
    sample: {
      sellerId: value.sellerId,
      ...(value.provinceCode ? { provinceCode: value.provinceCode } : {}),
      ...(value.wardCode ? { wardCode: value.wardCode } : {}),
      ...(value.warehouseId ? { warehouseId: value.warehouseId } : {}),
      ...(value.weightG !== '' ? { weightG: Number(value.weightG) } : {}),
      ...(value.itemCount !== '' ? { itemCount: Number(value.itemCount) } : {}),
      ...(value.codAmountVnd !== '' ? { codAmountVnd: value.codAmountVnd } : {}),
      ...(value.isCod !== '' ? { isCod: value.isCod === 'true' } : {}),
    },
    ...(value.ruleId
      ? { candidate: { ruleId: value.ruleId, version: Number(value.ruleVersion) } }
      : {}),
  });
}
