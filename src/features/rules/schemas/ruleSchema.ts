import { z } from 'zod';

import { RULE_FIELDS, type RuleCondition, type RuleDefinition } from '../types/rule.types';

const fields = z.enum([
  'tenantId',
  'provinceCode',
  'wardCode',
  'warehouseId',
  'weightG',
  'itemCount',
  'codAmountVnd',
  'isCod',
]);
const value = z.union([z.string(), z.number(), z.boolean()]);
const node: z.ZodType<RuleCondition, RuleCondition> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('ALL'), conditions: z.array(node).max(50) }).strict(),
    z.object({ kind: z.literal('ANY'), conditions: z.array(node).min(1).max(50) }).strict(),
    z
      .object({ kind: z.literal('PREDICATE'), field: fields, operator: z.literal('EXISTS') })
      .strict(),
    z
      .object({
        kind: z.literal('PREDICATE'),
        field: fields,
        operator: z.enum(['IN', 'NOT_IN']),
        values: z.array(value).min(1).max(50),
      })
      .strict(),
    z
      .object({
        kind: z.literal('PREDICATE'),
        field: fields,
        operator: z.enum(['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE']),
        value,
      })
      .strict(),
  ]),
);
function bounded(value: unknown): boolean {
  const pending: [unknown, number][] = [[value, 1]];
  let count = 0;
  while (pending.length) {
    const item = pending.pop();
    if (!item) return false;
    const [v, depth] = item;
    if (++count > 100 || depth > 8 || !v || typeof v !== 'object' || Array.isArray(v)) return false;
    if ('conditions' in v) {
      if (!Array.isArray(v.conditions) || v.conditions.length > 50) return false;
      for (const c of v.conditions) pending.push([c, depth + 1]);
    }
  }
  return true;
}
const uuid = z.string().uuid();
export const conditionSchema = z
  .preprocess((input, ctx) => {
    if (!bounded(input)) {
      ctx.issues.push({ code: 'custom', message: 'Invalid condition depth or size', input });
      return z.NEVER;
    }
    return input;
  }, node)
  .superRefine((condition, ctx) => {
    const visit = (c: RuleCondition): void => {
      if ('conditions' in c) {
        c.conditions.forEach(visit);
        return;
      }
      if (c.operator === 'EXISTS') return;
      const type = RULE_FIELDS[c.field];
      const values = 'values' in c ? c.values : [c.value];
      if (
        (type === 'TEXT' || type === 'BOOLEAN') &&
        !['EQ', 'NE', 'IN', 'NOT_IN'].includes(c.operator)
      ) {
        ctx.addIssue({ code: 'custom', message: 'Invalid comparison for field' });
      }
      for (const v of values) {
        const valid =
          type === 'INTEGER'
            ? typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
            : type === 'BOOLEAN'
              ? typeof v === 'boolean'
              : type === 'VND'
                ? typeof v === 'string' && /^(0|[1-9]\d{0,17})$/.test(v)
                : typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v;
        if (!valid || (c.field === 'warehouseId' && !uuid.safeParse(v).success)) {
          ctx.addIssue({ code: 'custom', message: 'Invalid field value' });
        }
      }
    };
    visit(condition);
  });
const actionSchema = z.union([
  z.object({ strategy: z.enum(['NEAREST_WAREHOUSE', 'EXPIRY_FIRST', 'TOTAL_COST']) }).strict(),
  z
    .object({ carrierServiceId: uuid, fallbackServiceIds: z.array(uuid).max(10) })
    .strict()
    .superRefine((v, c) => {
      if (
        new Set([v.carrierServiceId, ...v.fallbackServiceIds]).size !==
        1 + v.fallbackServiceIds.length
      ) {
        c.addIssue({ code: 'custom', message: 'Duplicate service' });
      }
    }),
]);
export const definitionSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    kind: z.enum(['ALLOCATION', 'CARRIER']),
    warehouseId: uuid.nullable(),
    exceptionTenantId: uuid.nullable(),
    priority: z.number().int().min(0).max(2147483647),
    condition: conditionSchema,
    action: actionSchema,
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.kind === 'ALLOCATION') !== 'strategy' in v.action) {
      c.addIssue({ code: 'custom', message: 'Action does not match rule type', path: ['action'] });
    }
  });
export const ruleSchema = definitionSchema
  .safeExtend({
    id: uuid,
    version: z.number().int().positive().max(2147483647),
    publishedVersion: z.number().int().positive().nullable(),
    isEnabled: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((v, c) => {
    if (
      (v.publishedVersion !== null) !== v.isEnabled ||
      (v.publishedVersion !== null && v.publishedVersion > v.version)
    ) {
      c.addIssue({ code: 'custom', message: 'Invalid publication pointer' });
    }
  });
export const versionSchema = z.object({
  version: z.number().int().positive(),
  definition: definitionSchema,
  operation: z.enum(['CREATE', 'EDIT', 'PUBLISH', 'DISABLE', 'ROLLBACK', 'DELETE', 'REORDER']),
  reason: z.string().min(3).max(500),
  createdBy: uuid,
  createdAt: z.string().datetime(),
});
export const paginationSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    hasNext: z.boolean(),
    nextCursor: uuid.nullable(),
  })
  .superRefine((v, c) => {
    if (v.hasNext && !v.nextCursor) c.addIssue({ code: 'custom', message: 'Missing next cursor' });
  });
export const targetSchema = z.object({ id: uuid, name: z.string().min(1) });
export const reasonSchema = (message: string) =>
  z.object({ reason: z.string().trim().min(3, message).max(500, message) });
export const ruleFormSchema = (message: string) =>
  z
    .object({
      name: z.string(),
      kind: z.enum(['ALLOCATION', 'CARRIER']),
      warehouseId: z.string(),
      exceptionTenantId: z.string(),
      priority: z.number(),
      condition: node,
      strategy: z.enum(['NEAREST_WAREHOUSE', 'EXPIRY_FIRST', 'TOTAL_COST']),
      carrierServiceId: z.string(),
      fallbackServiceIds: z.array(z.string()),
      reason: z.string(),
    })
    .superRefine((form, ctx) => {
      const parsed = definitionSchema.safeParse(toDefinition(form));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: 'custom',
            message,
            path: issue.path[0] === 'action' ? ['carrierServiceId'] : issue.path,
          });
        }
      }
      if (!reasonSchema(message).safeParse({ reason: form.reason }).success) {
        ctx.addIssue({ code: 'custom', message, path: ['reason'] });
      }
    });
export type RuleFormValues = z.infer<ReturnType<typeof ruleFormSchema>>;
export function toDefinition(form: RuleFormValues): RuleDefinition {
  return {
    name: form.name.trim(),
    kind: form.kind,
    warehouseId: form.warehouseId || null,
    exceptionTenantId: form.exceptionTenantId || null,
    priority: form.priority,
    condition: form.condition,
    action:
      form.kind === 'ALLOCATION'
        ? { strategy: form.strategy }
        : { carrierServiceId: form.carrierServiceId, fallbackServiceIds: form.fallbackServiceIds },
  };
}
