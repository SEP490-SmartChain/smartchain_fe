import { z } from 'zod';

export const reportKindSchema = z.enum([
  'seller',
  'warehouse',
  'inventory',
  'carriers',
  'finance',
  'audit',
  'logs',
  'health',
]);
export type ReportKind = z.infer<typeof reportKindSchema>;
export const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
export const reportSchema = z.object({
  schemaVersion: z.literal(1),
  kind: reportKindSchema,
  generatedAt: z.string().datetime(),
  from: z.string(),
  to: z.string(),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  sections: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PARTIAL']),
      metrics: z.array(
        z.object({
          key: z.string(),
          value: decimal.nullable(),
          unit: z.enum(['count', 'VND', 'percent', 'hours', 'ms', 'seconds']),
          basis: z.string(),
          href: z
            .string()
            .regex(/^\/(orders|inventory)$/)
            .optional(),
        }),
      ),
      groups: z.array(z.object({ key: z.string(), value: z.string().regex(/^-?\d+$/) })).optional(),
      evidence: z
        .array(
          z.object({
            id: z.string().uuid(),
            source: z.enum(['DISPATCH', 'OUTBOX', 'WEBHOOK']),
            businessId: z.string().uuid(),
            state: z.string(),
            attempts: z.number().int().nonnegative(),
            at: z.string().datetime(),
            nextAttemptAt: z.string().datetime().nullable(),
          }),
        )
        .optional(),
      series: z.array(z.object({ key: z.string(), value: z.string().regex(/^-?\d+$/) })).optional(),
    }),
  ),
});
export type ReportView = z.infer<typeof reportSchema>;
export const reportFilterSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    warehouseId: z.union([z.literal(''), z.string().uuid()]),
    actorId: z.union([z.literal(''), z.string().uuid()]),
    action: z
      .string()
      .max(80)
      .regex(/^[A-Za-z0-9_.:-]*$/),
    entityId: z.union([z.literal(''), z.string().uuid()]),
    kind: z.enum(['', 'API', 'SCAN']),
  })
  .refine(
    (row) =>
      Date.parse(row.from) <= Date.parse(row.to) &&
      Date.parse(row.to) - Date.parse(row.from) < 92 * 86400000,
    { message: 'range', path: ['to'] },
  );
export type ReportFilters = z.infer<typeof reportFilterSchema>;
export const optionsSchema = z.object({
  views: z.array(reportKindSchema),
  warehouses: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string() })),
  warehouseRequired: z.boolean(),
  warehouseRequiredViews: z.array(reportKindSchema),
});
export type ReportOptions = z.infer<typeof optionsSchema>;
export const auditSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  actorId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  changes: z.array(
    z.object({ field: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  correlationId: z.string().nullable(),
});
export const technicalSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  actorId: z.string(),
  ownerScope: z.enum(['TENANT', 'PLATFORM']),
  tenantId: z.string().nullable(),
  warehouseId: z.string().nullable(),
  kind: z.enum(['API', 'SCAN']),
  route: z.string(),
  method: z.string(),
  outcome: z.enum(['ACCEPTED', 'REJECTED']),
  statusCode: z.number().int(),
  durationMs: z.number().nonnegative(),
  correlationId: z.string(),
});
export type AuditRow = z.infer<typeof auditSchema>;
export type TechnicalRow = z.infer<typeof technicalSchema>;
export const pagination = z.object({
  limit: z.number().int(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
