import { z } from 'zod';

const money = z.string().regex(/^-?\d{1,20}$/);
const timestamp = z.string().datetime({ offset: true });
// Posted PostgreSQL UUIDs may predate RFC version/variant normalization.
// Keep immutable ledger identities readable; command/actor UUIDs stay strict.
export const ledgerIdSchema = z.guid();
export function payoutReadError(failure: unknown, fallback: string): string {
  return failure instanceof Error && !(failure instanceof z.ZodError) ? failure.message : fallback;
}
export const payoutSummarySchema = z.object({
  tenantId: z.string().uuid(),
  operatingBalanceVnd: money,
  depositBalanceVnd: money,
  debtVnd: money,
  creditLimitVnd: money,
  debtDueDays: z.number().int().positive(),
  oldestUnpaidAt: timestamp.nullable(),
  isOverLimit: z.boolean(),
  isOverdue: z.boolean(),
  isDebtBlocked: z.boolean(),
});
export const ledgerEntrySchema = z.object({
  id: ledgerIdSchema,
  accountKind: z.enum(['OPERATING', 'DEPOSIT']),
  entryType: z.string(),
  amountVnd: money,
  sourceType: z.string(),
  sourceId: z.string(),
  componentKey: z.string(),
  feeType: z.string().nullable().optional().default(null),
  orderKind: z.enum(['SALES', 'WITHDRAWAL']).nullable().optional().default(null),
  effectiveAt: timestamp,
  postedAt: timestamp,
  reversesEntryId: ledgerIdSchema.nullable(),
});
export function ledgerEntryLabelKey(
  entry: Pick<
    z.infer<typeof ledgerEntrySchema>,
    'entryType' | 'sourceType' | 'componentKey' | 'feeType' | 'orderKind'
  >,
): string {
  if (entry.entryType !== 'FEE') return `entry.${entry.entryType}`;
  if (['SUBSCRIPTION', 'ONBOARDING_PLAN_FEE'].includes(entry.sourceType)) return 'fee.subscription';
  if (entry.sourceType === 'BILLABLE_EVENT') {
    if (entry.feeType === 'FREIGHT' || entry.componentKey === 'freight-fee-v1') {
      return 'fee.freight';
    }
    if (entry.feeType === 'PICK_PACK_ORDER') {
      return entry.orderKind === 'WITHDRAWAL' ? 'fee.withdrawalHandling' : 'fee.orderHandling';
    }
    if (entry.feeType === 'INBOUND_CARTON') return 'fee.inbound';
    if (entry.feeType === 'STORAGE_M3_DAY') return 'fee.storage';
    if (entry.feeType === 'PACKING_MATERIAL') return 'fee.material';
    if (entry.feeType === 'RETURN_HANDLING') return 'fee.returnHandling';
    if (entry.feeType === 'COMBO') return 'fee.combo';
  }
  return 'fee.service';
}
export const payoutStatementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'AUTO_CONFIRMED', 'APPROVED', 'PAID', 'CLOSED']),
  version: z.number().int().positive(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  cutoffAt: timestamp.nullable(),
  reviewDeadlineAt: timestamp,
  eligibleAmountVnd: money,
  openingBalanceVnd: money,
  closingBalanceVnd: money,
  approvedAmountVnd: money.nullable(),
  sentAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  approvedAt: timestamp.nullable(),
  closedAt: timestamp.nullable(),
  isLegacy: z.boolean(),
});
// Additive detail contract: older deployed APIs can omit the new read model.
export const payoutStatementDetailSchema = payoutStatementSchema.extend({
  review: z
    .object({
      openDisputeCount: z.number().int().nonnegative(),
      disputedCreditsVnd: money.refine((value) => BigInt(value) >= BigInt(0)),
      disputedDebitsVnd: money.refine((value) => BigInt(value) >= BigInt(0)),
    })
    .optional(),
  transfer: z
    .object({
      id: z.string().uuid(),
      bankReference: z.string(),
      amountVnd: money.refine((value) => BigInt(value) > BigInt(0)),
      confirmedAt: timestamp,
    })
    .nullable()
    .optional(),
});
export type PayoutStatementDetail = z.infer<typeof payoutStatementDetailSchema>;
export const payoutLineSchema = z.object({
  id: z.string().uuid(),
  ledgerEntryId: ledgerIdSchema,
  amountVnd: money,
  lineStatus: z.enum(['ELIGIBLE', 'DISPUTED', 'CONFIRMED', 'PAID', 'DEFERRED']),
  carryForwardFromLineId: z.string().uuid().nullable(),
  entryType: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  postedAt: timestamp,
  disputes: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.string(),
      status: z.enum(['OPEN', 'RESOLVED', 'REJECTED']),
      amountVnd: money,
      resolutionReason: z.string().nullable(),
      adjustmentEntryId: ledgerIdSchema.nullable(),
    }),
  ),
});
export const payoutCommandSchema = z.object({
  operationKey: z.string().uuid(),
  version: z.number().int().positive(),
});
export const payoutReasonSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
export const payoutTransferSchema = z.object({
  bankReference: z.string().trim().min(3).max(200),
  transferredAt: timestamp,
  evidenceKey: z.string().min(1).max(500),
});
export const payoutResolutionSchema = payoutReasonSchema.extend({ adjustmentVnd: money });
export function payoutReviewOpen(
  statement: z.infer<typeof payoutStatementSchema>,
  now: Date,
): boolean {
  return (
    !statement.isLegacy &&
    statement.status === 'SENT' &&
    now.getTime() < Date.parse(statement.reviewDeadlineAt)
  );
}
export function vietnamWednesday(now: Date): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(
      now,
    ) === 'Wed'
  );
}
export type PayoutStatement = z.infer<typeof payoutStatementSchema>;
export type PayoutLine = z.infer<typeof payoutLineSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type PayoutSummary = z.infer<typeof payoutSummarySchema>;

export const closeoutSummarySchema = z.object({
  contractId: z.string().uuid().nullable(),
  contractVersion: z.number().int().positive().nullable(),
  isTerminating: z.boolean(),
  operatingBalanceVnd: money,
  depositBalanceVnd: money,
  debtVnd: money,
  refundableVnd: money,
  blockers: z.array(
    z.enum([
      'CLOSEOUT_NOT_REQUESTED',
      'STOCK',
      'WORK',
      'DISPUTES',
      'PENDING_FINANCE',
      'UNPAID_OBLIGATIONS',
      'STATEMENTS',
      'DEBT',
    ]),
  ),
});
export const closeoutOffsetSchema = payoutReasonSchema.extend({
  amountVnd: z.string().regex(/^[1-9]\d{0,19}$/),
  evidenceKey: z.string().min(1).max(500),
});
export const closeoutRefundSchema = closeoutOffsetSchema.merge(payoutTransferSchema);
export type CloseoutSummary = z.infer<typeof closeoutSummarySchema>;
