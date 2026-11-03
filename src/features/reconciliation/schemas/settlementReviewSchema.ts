import { z } from 'zod';

/** SS-1288 / UC-140–143 Accountant review. Field bounds mirror the API DTOs. */
export const DISPUTE_STATUSES = [
  'OPEN',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'RESOLVED',
  'REJECTED',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** Same state machine as orca_recon_update_dispute; the server remains the authority. */
const DISPUTE_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  OPEN: ['SUBMITTED', 'RESOLVED', 'REJECTED'],
  SUBMITTED: ['ACKNOWLEDGED', 'RESOLVED', 'REJECTED'],
  ACKNOWLEDGED: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

export function nextDisputeStatuses(status: DisputeStatus): readonly DisputeStatus[] {
  return DISPUTE_TRANSITIONS[status];
}

/** Rows the API accepts for manual matching (unmatched or ambiguous waybills). */
export function isManuallyMatchable(matchStatus: string): boolean {
  return matchStatus === 'NOT_FOUND' || matchStatus === 'AMBIGUOUS';
}

/** Rows the API accepts in a dispute: an unknown waybill or a freight/COD discrepancy. */
export function isDisputable(record: { matchStatus: string; discrepancies: string[] }): boolean {
  return (
    record.matchStatus !== 'INVALID' &&
    (isManuallyMatchable(record.matchStatus) || record.discrepancies.length > 0)
  );
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value));

export const manualMatchSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,64}$/),
  reason: z.string().trim().min(3).max(500),
});
export type ManualMatchValues = z.infer<typeof manualMatchSchema>;

export const disputeOpenSchema = z.object({
  externalTicketRef: optionalText(100),
  note: optionalText(2000),
});
export type DisputeOpenValues = z.input<typeof disputeOpenSchema>;
export type DisputeOpenOutput = z.output<typeof disputeOpenSchema>;

export const disputeUpdateSchema = z
  .object({
    status: z.union([z.enum(DISPUTE_STATUSES), z.literal('')]),
    externalTicketRef: optionalText(100),
    resolvedAmountVnd: z
      .string()
      .trim()
      .regex(/^(|0|[1-9]\d{0,17})$/),
    note: optionalText(2000),
  })
  .refine((value) => value.status !== '' || value.note !== undefined, { path: ['note'] })
  .refine((value) => value.status !== 'RESOLVED' || value.resolvedAmountVnd !== '', {
    path: ['resolvedAmountVnd'],
  });
export type DisputeUpdateValues = z.input<typeof disputeUpdateSchema>;
export type DisputeUpdateOutput = z.output<typeof disputeUpdateSchema>;

const money = z.string().regex(/^(0|-?[1-9]\d{0,19})$/);

export const disputeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(40),
  carrierCode: z.string().min(1).max(40),
  batchId: z.string().uuid(),
  status: z.enum(DISPUTE_STATUSES),
  claimedAmountVnd: money,
  resolvedAmountVnd: money.nullable(),
  externalTicketRef: z.string().max(100).nullable(),
  records: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CarrierDispute = z.infer<typeof disputeSchema>;

export const disputeDetailSchema = disputeSchema.extend({
  items: z.array(
    z.object({
      rowNumber: z.number().int().positive(),
      trackingNumber: z.string().max(64),
      matchStatus: z.string(),
      discrepancies: z.array(z.string()),
      claimedAmountVnd: money,
    }),
  ),
  events: z.array(
    z.object({
      kind: z.enum(['OPENED', 'STATUS_CHANGED', 'NOTE']),
      fromStatus: z.enum(DISPUTE_STATUSES).nullable(),
      toStatus: z.enum(DISPUTE_STATUSES).nullable(),
      note: z.string().max(2000).nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export type CarrierDisputeDetail = z.infer<typeof disputeDetailSchema>;
