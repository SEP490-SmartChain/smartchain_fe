import { z } from 'zod';

import { ApiError, apiClient, type ApiResponse } from '@/services/apiClient';

export const FULFILLMENT_SLA_RISK_STATES = [
  'DISABLED',
  'WARMING_UP',
  'READY',
  'INSUFFICIENT_DATA',
  'STALE',
  'MODEL_UNAVAILABLE',
] as const;

export type FulfillmentSlaRiskState = (typeof FULFILLMENT_SLA_RISK_STATES)[number];

export const FULFILLMENT_SLA_RISK_SOURCES = ['EMPIRICAL_DURATION', 'CALIBRATED_LOGISTIC'] as const;

export const FULFILLMENT_SLA_RISK_TIERS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type FulfillmentSlaRiskTier = (typeof FULFILLMENT_SLA_RISK_TIERS)[number];

export const FULFILLMENT_SLA_RISK_STAGES = [
  'WAITING_PICK',
  'PICKING',
  'WAITING_PACK',
  'WAITING_LABEL',
  'WAITING_HANDOVER',
] as const;

export type FulfillmentSlaRiskStage = (typeof FULFILLMENT_SLA_RISK_STAGES)[number];

export type FulfillmentSlaRiskDisplayStage = FulfillmentSlaRiskStage | 'WAITING_LABEL_VERIFYING';

export const FULFILLMENT_SLA_RISK_RECOMMENDATION_CODES = [
  'CHECK_PICK_SHORTAGE',
  'CHECK_RESERVATION',
  'CHECK_LABEL_VERIFICATION',
  'CHECK_DISPATCH_FAILURE',
  'REVIEW_PICK_BACKLOG',
  'REVIEW_PACK_QUEUE',
  'REVIEW_HANDOVER_QUEUE',
] as const;

export type FulfillmentSlaRiskRecommendationCode =
  (typeof FULFILLMENT_SLA_RISK_RECOMMENDATION_CODES)[number];

export const FULFILLMENT_SLA_RISK_EXPLANATION_LOCALES = ['vi', 'en'] as const;
export type FulfillmentSlaRiskExplanationLocale =
  (typeof FULFILLMENT_SLA_RISK_EXPLANATION_LOCALES)[number];

export const FULFILLMENT_SLA_RISK_EXPLANATION_SOURCES = ['TEMPLATE', 'GEMINI'] as const;

export const FULFILLMENT_SLA_RISK_FACT_IDS = [
  'OPEN_PICK_SHORTAGE',
  'RESERVATION_ISSUE',
  'DISPATCH_FAILURE',
  'WAITING_FOR_LABEL',
  'TIME_REMAINING',
  'COHORT_BENCHMARK',
  'BENCHMARK_MISSING',
  'STAGE_AGE_ELEVATED',
  'PICK_REMAINING',
  'STAGE_QUEUE_LOAD',
  'WAREHOUSE_THROUGHPUT_LOAD',
] as const;
export type FulfillmentSlaRiskFactId = (typeof FULFILLMENT_SLA_RISK_FACT_IDS)[number];

export const FULFILLMENT_SLA_RISK_CANDIDATE_ACTIONS = [
  'VIEW_OPEN_SHORTAGE',
  'CHECK_PICK_PROGRESS',
  'CHECK_RESERVATION',
  'CHECK_DISPATCH_FAILURE',
  'CHECK_LABEL_VERIFICATION',
  'REVIEW_PICK_BACKLOG',
  'REVIEW_PACK_QUEUE',
  'REVIEW_HANDOVER_QUEUE',
] as const;
export type FulfillmentSlaRiskCandidateAction =
  (typeof FULFILLMENT_SLA_RISK_CANDIDATE_ACTIONS)[number];

export const FULFILLMENT_SLA_RISK_EXPLANATION_TEMPLATE_IDS = [
  'SHORTAGE_WITH_TIME_PRESSURE',
  'SHORTAGE_WITH_WORKLOAD',
  'SHORTAGE_PRIMARY',
  'RESERVATION_WITH_TIME_PRESSURE',
  'RESERVATION_WITH_QUEUE_PRESSURE',
  'RESERVATION_PRIMARY',
  'DISPATCH_FAILURE_WITH_TIME_PRESSURE',
  'DISPATCH_FAILURE_PRIMARY',
  'LABEL_VERIFYING_WITH_TIME_PRESSURE',
  'LABEL_VERIFYING_PRIMARY',
  'PICK_TIME_VS_BENCHMARK',
  'PICK_REMAINING_WORKLOAD',
  'PICK_QUEUE_AND_AGE',
  'PICK_NO_BENCHMARK',
  'PICK_TIME_ONLY',
  'PACK_TIME_VS_BENCHMARK',
  'PACK_WAITING_LABEL_DELAY',
  'PACK_QUEUE_AND_AGE',
  'PACK_NO_BENCHMARK',
  'PACK_TIME_ONLY',
  'HANDOVER_TIME_VS_BENCHMARK',
  'HANDOVER_QUEUE_AND_CONGESTION',
  'HANDOVER_NO_BENCHMARK',
  'HANDOVER_TIME_ONLY',
] as const;
export type FulfillmentSlaRiskExplanationTemplateId =
  (typeof FULFILLMENT_SLA_RISK_EXPLANATION_TEMPLATE_IDS)[number];

const STAGE_TIE_ORDER: Record<FulfillmentSlaRiskStage, number> = {
  WAITING_PICK: 1,
  PICKING: 2,
  WAITING_PACK: 3,
  WAITING_LABEL: 4,
  WAITING_HANDOVER: 5,
};

const finiteNumber = z.number().finite();
const nonNegInt = z.number().int().nonnegative();
const isoDateTimeWithOffset = z.iso.datetime({ offset: true });

export const fulfillmentSlaRiskReasonSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('SHORT_TIME_TO_CUTOFF'),
      evidence: z
        .object({
          minutesRemaining: finiteNumber,
          p50Minutes: finiteNumber.optional(),
          p80Minutes: finiteNumber.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('STAGE_AGE_ELEVATED'),
      evidence: z
        .object({
          stageAgeMinutes: finiteNumber,
          stage: z.enum(FULFILLMENT_SLA_RISK_STAGES),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('PICK_BACKLOG_HIGH'),
      evidence: z
        .object({
          stageOtherParcelsCount: nonNegInt,
          warehouseTotalActiveCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('PICK_REMAINING'),
      evidence: z
        .object({
          remainingPickQty: finiteNumber,
          distinctSkuCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('WAREHOUSE_CONGESTION'),
      evidence: z
        .object({
          warehouseTotalActiveCount: nonNegInt,
          handoversLast60mCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('OPEN_PICK_SHORTAGE'),
      evidence: z.object({ remainingPickQty: finiteNumber }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('RESERVATION_ISSUE'),
      evidence: z.object({ remainingPickQty: finiteNumber }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('WAITING_FOR_LABEL'),
      evidence: z
        .object({
          stageAgeMinutes: finiteNumber,
          isLabelVerifying: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('DISPATCH_FAILURE'),
      evidence: z.object({ stageAgeMinutes: finiteNumber }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('COHORT_DURATION_PRESSURE'),
      evidence: z
        .object({
          minutesRemaining: finiteNumber,
          p50Minutes: finiteNumber.optional(),
          p80Minutes: finiteNumber.optional(),
        })
        .strict(),
    })
    .strict(),
]);

export type FulfillmentSlaRiskReason = z.infer<typeof fulfillmentSlaRiskReasonSchema>;

export const fulfillmentSlaRiskCoverageSchema = z
  .object({
    eligible: nonNegInt,
    scored: nonNegInt,
    missingCalendar: nonNegInt,
    unsupported: nonNegInt,
    blocked: nonNegInt,
    insufficientData: nonNegInt,
    activeOver30Days: nonNegInt,
    invalidatedSinceAsOf: nonNegInt,
  })
  .strict();

export type FulfillmentSlaRiskCoverage = z.infer<typeof fulfillmentSlaRiskCoverageSchema>;

export const fulfillmentSlaRiskSummarySchema = z
  .object({
    validTotal: nonNegInt,
    highCount: nonNegInt,
    mediumCount: nonNegInt,
    lowCount: nonNegInt,
    topHighStage: z.enum(FULFILLMENT_SLA_RISK_STAGES).nullable(),
    topHighStageCount: nonNegInt,
  })
  .strict();

export type FulfillmentSlaRiskSummary = z.infer<typeof fulfillmentSlaRiskSummarySchema>;

export const fulfillmentSlaRiskVerifiedTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('picking_shortage_line'),
      waveId: z.uuid(),
      waveCode: z.string().min(1).max(120),
      lineId: z.uuid(),
      exceptionId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('picking_progress_line'),
      waveId: z.uuid(),
      waveCode: z.string().min(1).max(120),
      lineId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('picking_wave'),
      waveId: z.uuid(),
      waveCode: z.string().min(1).max(120),
    })
    .strict(),
  z.object({ kind: z.literal('picking_waves_list') }).strict(),
  z.object({ kind: z.literal('picking_backlog') }).strict(),
  z
    .object({
      kind: z.literal('packing_parcel'),
      fulfillmentOrderId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('handover_parcel'),
      fulfillmentOrderId: z.uuid(),
    })
    .strict(),
  z.object({ kind: z.literal('shipments_list') }).strict(),
]);

export type FulfillmentSlaRiskVerifiedTarget = z.infer<
  typeof fulfillmentSlaRiskVerifiedTargetSchema
>;

export const fulfillmentSlaRiskItemSchema = z
  .object({
    fulfillmentOrderId: z.uuid(),
    orderCode: z.string().min(1).max(120),
    parcelNo: z.number().int().positive(),
    stage: z.enum(FULFILLMENT_SLA_RISK_STAGES),
    deadlineAt: isoDateTimeWithOffset,
    tier: z.enum(FULFILLMENT_SLA_RISK_TIERS),
    probability: z.number().finite().min(0).max(1).nullable(),
    reasons: z.array(fulfillmentSlaRiskReasonSchema).max(10),
    recommendationCode: z.enum(FULFILLMENT_SLA_RISK_RECOMMENDATION_CODES),
    target: fulfillmentSlaRiskVerifiedTargetSchema.nullable().optional(),
    targetStateToken: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

export type FulfillmentSlaRiskItem = z.infer<typeof fulfillmentSlaRiskItemSchema>;

export const fulfillmentSlaRiskResponseSchema = z
  .object({
    state: z.enum(FULFILLMENT_SLA_RISK_STATES),
    warehouseId: z.uuid(),
    warehouseTimeZone: z.string().min(1).max(120),
    asOf: isoDateTimeWithOffset.nullable(),
    validUntil: isoDateTimeWithOffset.nullable(),
    source: z.enum(FULFILLMENT_SLA_RISK_SOURCES).nullable(),
    modelVersion: z.string().min(1).max(120).nullable(),
    coverage: fulfillmentSlaRiskCoverageSchema.nullable(),
    summary: fulfillmentSlaRiskSummarySchema.nullable().optional().default(null),
    hasMore: z.boolean(),
    risks: z.array(fulfillmentSlaRiskItemSchema).max(50),
  })
  .strict();

export type FulfillmentSlaRiskResponse = z.infer<typeof fulfillmentSlaRiskResponseSchema>;

export const fulfillmentSlaRiskExplanationFactSchema = z.discriminatedUnion('factId', [
  z
    .object({
      factId: z.literal('OPEN_PICK_SHORTAGE'),
      kind: z.literal('BLOCKER_EVENT'),
      reasonCode: z.literal('OPEN_PICK_SHORTAGE'),
      metrics: z.object({ remainingPickQty: nonNegInt }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('RESERVATION_ISSUE'),
      kind: z.literal('BLOCKER_EVENT'),
      reasonCode: z.literal('RESERVATION_ISSUE'),
      metrics: z.object({ remainingPickQty: nonNegInt }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('DISPATCH_FAILURE'),
      kind: z.literal('BLOCKER_EVENT'),
      reasonCode: z.literal('DISPATCH_FAILURE'),
      metrics: z.object({ stageAgeMinutes: nonNegInt }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('WAITING_FOR_LABEL'),
      kind: z.literal('BLOCKER_EVENT'),
      reasonCode: z.literal('WAITING_FOR_LABEL'),
      metrics: z.object({ stageAgeMinutes: nonNegInt, isLabelVerifying: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('TIME_REMAINING'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.enum(['SHORT_TIME_TO_CUTOFF', 'COHORT_DURATION_PRESSURE']),
      metrics: z.object({ minutesRemaining: nonNegInt }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('COHORT_BENCHMARK'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.enum(['SHORT_TIME_TO_CUTOFF', 'COHORT_DURATION_PRESSURE']),
      metrics: z
        .object({
          p50Minutes: nonNegInt.optional(),
          p80Minutes: nonNegInt.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('BENCHMARK_MISSING'),
      kind: z.literal('MISSING_REFERENCE'),
      reasonCode: z.literal('COHORT_DURATION_PRESSURE'),
      metrics: z.object({ minutesRemaining: nonNegInt }).strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('STAGE_AGE_ELEVATED'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.literal('STAGE_AGE_ELEVATED'),
      metrics: z
        .object({
          stageAgeMinutes: nonNegInt,
          stage: z.enum(FULFILLMENT_SLA_RISK_STAGES),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('PICK_REMAINING'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.literal('PICK_REMAINING'),
      metrics: z
        .object({
          remainingPickQty: nonNegInt,
          distinctSkuCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('STAGE_QUEUE_LOAD'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.literal('PICK_BACKLOG_HIGH'),
      metrics: z
        .object({
          stageOtherParcelsCount: nonNegInt,
          warehouseTotalActiveCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      factId: z.literal('WAREHOUSE_THROUGHPUT_LOAD'),
      kind: z.literal('SCORE_DRIVER'),
      reasonCode: z.literal('WAREHOUSE_CONGESTION'),
      metrics: z
        .object({
          warehouseTotalActiveCount: nonNegInt,
          handoversLast60mCount: nonNegInt,
        })
        .strict(),
    })
    .strict(),
]);

export type FulfillmentSlaRiskExplanationFact = z.infer<
  typeof fulfillmentSlaRiskExplanationFactSchema
>;

export const fulfillmentSlaRiskExplanationResponseSchema = z
  .object({
    fulfillmentOrderId: z.uuid(),
    warehouseId: z.uuid(),
    asOf: isoDateTimeWithOffset,
    validUntil: isoDateTimeWithOffset,
    locale: z.enum(FULFILLMENT_SLA_RISK_EXPLANATION_LOCALES),
    source: z.enum(FULFILLMENT_SLA_RISK_EXPLANATION_SOURCES),
    explanationTemplateId: z.enum(FULFILLMENT_SLA_RISK_EXPLANATION_TEMPLATE_IDS),
    recommendationCode: z.enum(FULFILLMENT_SLA_RISK_RECOMMENDATION_CODES),
    candidateAction: z.enum(FULFILLMENT_SLA_RISK_CANDIDATE_ACTIONS),
    candidatesCount: z.number().int().positive(),
    target: fulfillmentSlaRiskVerifiedTargetSchema.nullable().optional().default(null),
    advicePattern: z.string().min(18).max(160).nullable().optional().default(null),
    facts: z.array(fulfillmentSlaRiskExplanationFactSchema).max(2),
  })
  .strict();

export type FulfillmentSlaRiskExplanationResponse = z.infer<
  typeof fulfillmentSlaRiskExplanationResponseSchema
>;

export type RiskFetchResult =
  | { readonly kind: 'ok'; readonly data: FulfillmentSlaRiskResponse }
  | { readonly kind: 'endpoint_unavailable' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error' };

export type ExplanationFetchResult =
  | { readonly kind: 'ok'; readonly data: FulfillmentSlaRiskExplanationResponse }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'parcel_unavailable' }
  | { readonly kind: 'unavailable' };

export interface RiskNavigationPermissions {
  readonly canManagePicking?: boolean;
  readonly canPackingRoute: boolean;
  readonly canHandoverRoute: boolean;
  readonly canShipmentsRoute?: boolean;
  readonly canExceptionsRoute?: boolean;
}

export type RiskActionLabelKey =
  | 'actionOpenShortageLine'
  | 'actionOpenPickLine'
  | 'actionOpenWave'
  | 'actionViewBacklog'
  | 'actionViewWaves'
  | 'actionCheckPacking'
  | 'actionCheckLabel'
  | 'actionViewShipments'
  | 'actionViewExceptions'
  | 'actionViewHandover';

export type RiskNavigationTarget =
  | {
      readonly kind: 'open_picking_line';
      readonly waveId: string;
      readonly waveCode: string;
      readonly lineId: string;
      readonly exceptionId?: string;
      readonly labelKey: 'actionOpenShortageLine' | 'actionOpenPickLine';
    }
  | {
      readonly kind: 'open_picking_wave';
      readonly waveId: string;
      readonly waveCode: string;
      readonly labelKey: 'actionOpenWave';
    }
  | { readonly kind: 'focus_backlog'; readonly labelKey: RiskActionLabelKey }
  | { readonly kind: 'focus_waves'; readonly labelKey: RiskActionLabelKey }
  | {
      readonly kind: 'link';
      readonly target: 'packing' | 'shipments' | 'exceptions' | 'handover';
      readonly to: string;
      readonly labelKey: RiskActionLabelKey;
    }
  | { readonly kind: 'none' };

export interface ScopedRiskSnapshot {
  readonly scopeKey: string;
  readonly loading: boolean;
  readonly loadMoreLoading?: boolean;
  readonly loadMoreError?: boolean;
  readonly loadMoreSucceeded?: boolean;
  readonly result: RiskFetchResult | null;
}

export type EvaluatedStaleReason = 'ttl_expired' | 'all_past_deadline' | 'invalidated';

export interface ExcludedCoverageSummary {
  readonly total: number;
  readonly missingCalendar: number;
  readonly blocked: number;
  readonly unsupported: number;
  readonly activeOver30Days: number;
}

export interface OverdueHandoverParcelPreview {
  readonly id: string;
  readonly aggregateId: string;
  readonly fulfillmentOrderId: string | null;
  readonly orderCode: string;
  readonly parcelNo: number | null;
  readonly fulfillmentStatus: string | null;
  readonly deadline: string | null;
  readonly status: 'OPEN' | 'ASSIGNED';
}

export interface OverdueHandoverCount {
  readonly count: number;
  readonly hasMorePages: boolean;
  readonly parcels?: readonly OverdueHandoverParcelPreview[];
}

export interface ScopedOverdueHandoverState {
  readonly scopeKey: string;
  readonly status: 'idle' | 'ready';
  readonly count: number;
  readonly hasMorePages: boolean;
  readonly parcels?: readonly OverdueHandoverParcelPreview[];
}

export type EvaluatedRiskView =
  | { readonly kind: 'scope_mismatch' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'endpoint_unavailable' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error' }
  | {
      readonly kind: Exclude<FulfillmentSlaRiskState, 'READY' | 'STALE'>;
      readonly data: FulfillmentSlaRiskResponse;
      readonly activeRisks: readonly [];
      readonly summary: null;
      readonly summaryScope: 'warehouse';
      readonly hasMore: false;
      readonly nextExpiryMs: null;
    }
  | {
      readonly kind: 'STALE';
      readonly staleReason: EvaluatedStaleReason;
      readonly data: FulfillmentSlaRiskResponse;
      readonly activeRisks: readonly [];
      readonly summary: null;
      readonly summaryScope: 'warehouse';
      readonly hasMore: false;
      readonly nextExpiryMs: null;
    }
  | {
      readonly kind: 'READY';
      readonly data: FulfillmentSlaRiskResponse;
      readonly activeRisks: readonly FulfillmentSlaRiskItem[];
      readonly expiredByDeadlineCount: number;
      readonly summary: FulfillmentSlaRiskSummary;
      readonly summaryScope: 'warehouse' | 'displayed';
      readonly hasMore: boolean;
      readonly nextExpiryMs: number | null;
    };

export type RemainingDurationParts =
  | { readonly kind: 'expired' }
  | { readonly kind: 'under_minute' }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'hours_minutes'; readonly hours: number; readonly minutes: number };

export interface LocalParcelExplanation {
  readonly facts: readonly FulfillmentSlaRiskExplanationFact[];
  readonly explanationTemplateId: FulfillmentSlaRiskExplanationTemplateId;
  readonly hasMultipleInterpretations: boolean;
}

export interface ScopedExplanationEntry {
  readonly entryKey: string;
  readonly loading: boolean;
  readonly data: FulfillmentSlaRiskExplanationResponse | null;
  readonly expiresAtMs: number;
  readonly targetSignature?: string;
}

export type WarehouseDeadlineParts =
  | { readonly kind: 'today'; readonly time: string }
  | { readonly kind: 'tomorrow'; readonly time: string }
  | { readonly kind: 'date'; readonly time: string; readonly date: string };

type LocalQuantitativeGate =
  | 'NONE'
  | 'TIME_PRESSURE'
  | 'BENCHMARK_PRESSURE'
  | 'WORKLOAD_OR_QUEUE_PRESSURE'
  | 'QUEUE_OR_AGE_PRESSURE'
  | 'PICK_WORKLOAD'
  | 'MISSING_BENCHMARK';

interface TemplateRule {
  readonly templateId: FulfillmentSlaRiskExplanationTemplateId;
  readonly recommendationCode: FulfillmentSlaRiskRecommendationCode;
  readonly requiredFactIds: readonly FulfillmentSlaRiskFactId[];
  readonly anyOfFactIds?: readonly FulfillmentSlaRiskFactId[];
  readonly gate: LocalQuantitativeGate;
}

const ELEVATED_STAGE_AGE_MIN = 45;
const HIGH_STAGE_QUEUE_MIN = 5;
const HIGH_WAREHOUSE_ACTIVE_MIN = 15;
const FALLBACK_TIGHT_TIME_MIN = 60;

const LOCAL_TEMPLATE_RULES: readonly TemplateRule[] = [
  {
    templateId: 'SHORTAGE_WITH_TIME_PRESSURE',
    recommendationCode: 'CHECK_PICK_SHORTAGE',
    requiredFactIds: ['OPEN_PICK_SHORTAGE', 'TIME_REMAINING'],
    gate: 'TIME_PRESSURE',
  },
  {
    templateId: 'SHORTAGE_WITH_WORKLOAD',
    recommendationCode: 'CHECK_PICK_SHORTAGE',
    requiredFactIds: ['OPEN_PICK_SHORTAGE'],
    anyOfFactIds: [
      'PICK_REMAINING',
      'STAGE_AGE_ELEVATED',
      'STAGE_QUEUE_LOAD',
      'WAREHOUSE_THROUGHPUT_LOAD',
    ],
    gate: 'WORKLOAD_OR_QUEUE_PRESSURE',
  },
  {
    templateId: 'SHORTAGE_PRIMARY',
    recommendationCode: 'CHECK_PICK_SHORTAGE',
    requiredFactIds: ['OPEN_PICK_SHORTAGE'],
    gate: 'NONE',
  },
  {
    templateId: 'RESERVATION_WITH_TIME_PRESSURE',
    recommendationCode: 'CHECK_RESERVATION',
    requiredFactIds: ['RESERVATION_ISSUE', 'TIME_REMAINING'],
    gate: 'TIME_PRESSURE',
  },
  {
    templateId: 'RESERVATION_WITH_QUEUE_PRESSURE',
    recommendationCode: 'CHECK_RESERVATION',
    requiredFactIds: ['RESERVATION_ISSUE'],
    anyOfFactIds: [
      'STAGE_QUEUE_LOAD',
      'WAREHOUSE_THROUGHPUT_LOAD',
      'STAGE_AGE_ELEVATED',
      'PICK_REMAINING',
    ],
    gate: 'WORKLOAD_OR_QUEUE_PRESSURE',
  },
  {
    templateId: 'RESERVATION_PRIMARY',
    recommendationCode: 'CHECK_RESERVATION',
    requiredFactIds: ['RESERVATION_ISSUE'],
    gate: 'NONE',
  },
  {
    templateId: 'DISPATCH_FAILURE_WITH_TIME_PRESSURE',
    recommendationCode: 'CHECK_DISPATCH_FAILURE',
    requiredFactIds: ['DISPATCH_FAILURE', 'TIME_REMAINING'],
    gate: 'TIME_PRESSURE',
  },
  {
    templateId: 'DISPATCH_FAILURE_PRIMARY',
    recommendationCode: 'CHECK_DISPATCH_FAILURE',
    requiredFactIds: ['DISPATCH_FAILURE'],
    gate: 'NONE',
  },
  {
    templateId: 'LABEL_VERIFYING_WITH_TIME_PRESSURE',
    recommendationCode: 'CHECK_LABEL_VERIFICATION',
    requiredFactIds: ['WAITING_FOR_LABEL', 'TIME_REMAINING'],
    gate: 'TIME_PRESSURE',
  },
  {
    templateId: 'LABEL_VERIFYING_PRIMARY',
    recommendationCode: 'CHECK_LABEL_VERIFICATION',
    requiredFactIds: ['WAITING_FOR_LABEL'],
    gate: 'NONE',
  },
  {
    templateId: 'PICK_TIME_VS_BENCHMARK',
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    requiredFactIds: ['TIME_REMAINING', 'COHORT_BENCHMARK'],
    gate: 'BENCHMARK_PRESSURE',
  },
  {
    templateId: 'PICK_REMAINING_WORKLOAD',
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    requiredFactIds: ['PICK_REMAINING'],
    gate: 'PICK_WORKLOAD',
  },
  {
    templateId: 'PICK_QUEUE_AND_AGE',
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    requiredFactIds: [],
    anyOfFactIds: ['STAGE_AGE_ELEVATED', 'STAGE_QUEUE_LOAD', 'WAREHOUSE_THROUGHPUT_LOAD'],
    gate: 'QUEUE_OR_AGE_PRESSURE',
  },
  {
    templateId: 'PICK_NO_BENCHMARK',
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    requiredFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'MISSING_BENCHMARK',
  },
  {
    templateId: 'PICK_TIME_ONLY',
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    requiredFactIds: [],
    anyOfFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'NONE',
  },
  {
    templateId: 'PACK_TIME_VS_BENCHMARK',
    recommendationCode: 'REVIEW_PACK_QUEUE',
    requiredFactIds: ['TIME_REMAINING', 'COHORT_BENCHMARK'],
    gate: 'BENCHMARK_PRESSURE',
  },
  {
    templateId: 'PACK_WAITING_LABEL_DELAY',
    recommendationCode: 'REVIEW_PACK_QUEUE',
    requiredFactIds: ['WAITING_FOR_LABEL'],
    gate: 'NONE',
  },
  {
    templateId: 'PACK_QUEUE_AND_AGE',
    recommendationCode: 'REVIEW_PACK_QUEUE',
    requiredFactIds: [],
    anyOfFactIds: ['STAGE_AGE_ELEVATED', 'STAGE_QUEUE_LOAD', 'WAREHOUSE_THROUGHPUT_LOAD'],
    gate: 'QUEUE_OR_AGE_PRESSURE',
  },
  {
    templateId: 'PACK_NO_BENCHMARK',
    recommendationCode: 'REVIEW_PACK_QUEUE',
    requiredFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'MISSING_BENCHMARK',
  },
  {
    templateId: 'PACK_TIME_ONLY',
    recommendationCode: 'REVIEW_PACK_QUEUE',
    requiredFactIds: [],
    anyOfFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'NONE',
  },
  {
    templateId: 'HANDOVER_TIME_VS_BENCHMARK',
    recommendationCode: 'REVIEW_HANDOVER_QUEUE',
    requiredFactIds: ['TIME_REMAINING', 'COHORT_BENCHMARK'],
    gate: 'BENCHMARK_PRESSURE',
  },
  {
    templateId: 'HANDOVER_QUEUE_AND_CONGESTION',
    recommendationCode: 'REVIEW_HANDOVER_QUEUE',
    requiredFactIds: [],
    anyOfFactIds: ['STAGE_AGE_ELEVATED', 'STAGE_QUEUE_LOAD', 'WAREHOUSE_THROUGHPUT_LOAD'],
    gate: 'QUEUE_OR_AGE_PRESSURE',
  },
  {
    templateId: 'HANDOVER_NO_BENCHMARK',
    recommendationCode: 'REVIEW_HANDOVER_QUEUE',
    requiredFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'MISSING_BENCHMARK',
  },
  {
    templateId: 'HANDOVER_TIME_ONLY',
    recommendationCode: 'REVIEW_HANDOVER_QUEUE',
    requiredFactIds: [],
    anyOfFactIds: ['TIME_REMAINING', 'BENCHMARK_MISSING'],
    gate: 'NONE',
  },
];

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundNonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

export function parseFulfillmentSlaRiskResponse(payload: unknown): FulfillmentSlaRiskResponse {
  return fulfillmentSlaRiskResponseSchema.parse(payload);
}

export function parseFulfillmentSlaRiskExplanationResponse(
  payload: unknown,
): FulfillmentSlaRiskExplanationResponse {
  return fulfillmentSlaRiskExplanationResponseSchema.parse(payload);
}

/**
 * Formats probability strictly when calibrated numeric probability is present.
 * Never rounds extreme tails to 100% or 0%: uses "trên 99%" / "over 99%" for >= 0.99
 * and "dưới 1%" / "under 1%" for <= 0.01 so UI never implies certainty.
 */
export function formatRiskProbability(probability: number | null, locale: string): string | null {
  if (probability === null || !Number.isFinite(probability)) return null;
  const clamped = Math.min(1, Math.max(0, probability));
  const isVi = locale === 'vi';
  if (clamped >= 0.99) {
    return isVi ? 'trên 99%' : 'over 99%';
  }
  if (clamped <= 0.01) {
    return isVi ? 'dưới 1%' : 'under 1%';
  }
  const boundedPct = Math.min(99, Math.max(1, Math.round(clamped * 100))) / 100;
  return new Intl.NumberFormat(isVi ? 'vi-VN' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(boundedPct);
}

/** Formats elapsed dwell duration naturally (e.g. 202 min -> "3 giờ 22 phút" / "3h 22m"). */
export function formatElapsedMinutes(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  const isVi = locale === 'vi';
  if (total < 60) {
    return isVi ? `${total} phút` : `${total} min`;
  }
  const hours = Math.floor(total / 60);
  const rem = total % 60;
  if (rem === 0) {
    return isVi ? `${hours} giờ` : `${hours}h`;
  }
  return isVi ? `${hours} giờ ${rem} phút` : `${hours}h ${rem}m`;
}

function localCalendarDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

/** Formats handover cutoff relative to the warehouse local date ("10:00 hôm nay" / "10:00 today"). */
export function formatWarehouseDeadline(
  iso: string,
  timeZone: string,
  locale: string,
  nowMs: number = Date.now(),
): WarehouseDeadlineParts {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return { kind: 'date', time: iso, date: '' };
  }
  const resolvedLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
  let effectiveTz = timeZone;
  try {
    new Intl.DateTimeFormat(resolvedLocale, { timeZone: effectiveTz }).format(date);
  } catch {
    effectiveTz = 'UTC';
  }
  const time = new Intl.DateTimeFormat(resolvedLocale, {
    timeZone: effectiveTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const targetDay = localCalendarDayKey(date, effectiveTz);
  const todayDay = localCalendarDayKey(new Date(nowMs), effectiveTz);
  if (targetDay === todayDay) {
    return { kind: 'today', time };
  }
  const tomorrowDay = localCalendarDayKey(new Date(nowMs + 86_400_000), effectiveTz);
  if (targetDay === tomorrowDay) {
    return { kind: 'tomorrow', time };
  }
  const dateText = new Intl.DateTimeFormat(resolvedLocale, {
    timeZone: effectiveTz,
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  return { kind: 'date', time, date: dateText };
}

export function computeParcelTargetSignature(
  item: Pick<
    FulfillmentSlaRiskItem,
    'recommendationCode' | 'target' | 'targetStateToken' | 'reasons'
  >,
): string {
  return JSON.stringify({
    r: item.recommendationCode,
    t: item.target ?? null,
    ts: item.targetStateToken ?? null,
    e: item.reasons,
  });
}

const ADVICE_ACTION_TOKEN = '{{action}}';
const ADVICE_REASON_TOKEN = '{{reason}}';
const ADVICE_PATTERN_MIN_LEN = 18;
const ADVICE_PATTERN_MAX_LEN = 160;
const ADVICE_WRAPPER_MAX_LEN = 90;
const ADVICE_UNSAFE_FORMAT = /(https?:\/\/|[<>{}`]|\*\*|\r|\n|^[-*•]\s|[\p{Cc}])/u;
const ADVICE_FORBIDDEN_CLAIMS =
  /(thiếu nhân viên|nhân viên chậm|chắc chắn|tuyệt đối|understaffed|slow worker|guaranteed|certainly|definitely)/i;
const ADVICE_FORBIDDEN_VI_LOANWORDS =
  /\b(pick|picking|putback|putaway|wave|booking|retry|reservation|manager|staff|admin|cut-off|cutoff|downtime|barcode|snapshot|payload|quarantine|sellable|QC|ASN|SKU)\b/i;
const ADVICE_WRAPPER_FORBIDDEN_VI =
  /(bỏ qua|lờ đi|xác nhận|duyệt|hủy|thay lô|đóng phiếu|bỏ phiếu|chuyển trạng thái|không cần|đừng|đóng gói|bàn giao|vận đơn|dán nhãn|tạo nhãn|xác minh nhãn|phiếu báo thiếu|báo thiếu|giữ tồn|lấy hàng|soạn hàng|hạn bàn giao|quá hạn|phút|giờ|tiếng|ngày|sản phẩm|mã hàng|phần trăm)/iu;
const ADVICE_WRAPPER_FORBIDDEN_EN =
  /\b(ignore|skip|bypass|confirm|approve|cancel|replace|close|override|avoid|don't|do\s+not|pack|packing|handover|hand\s+over|shipment|shipments|label|shortage|reservation|picking|cutoff|cut-off|overdue|deadline|minute|minutes|min|hour|hours|hr|hrs|day|days|unit|units|item|items|sku|skus|percent)\b/i;
const VI_DIACRITIC_RE = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;
const EN_COMMON_WRAPPER_RE =
  /\b(you|should|can|please|first|next|check|review|open|before|this|parcel|for|the|to|and|with|is|are|it)\b/i;
const VI_ASCII_WRAPPER_RE = /\b(ban|nen|truoc|kiem|tra|kien|hang|nhe|vui|long|hay)\b/i;

/**
 * High #1 + Medium #1 + Section 2 (client defense-in-depth parity with BE validator):
 * Validates Gemini's token-structured `advicePattern` before interpolating ORCA's verified
 * `{{action}}` phrase and `{{reason}}` sentence. Returns null on ANY violation so the UI
 * falls back cleanly to ORCA's deterministic template.
 */
export function validateGroundedAdvicePattern(
  rawPattern: unknown,
  locale: FulfillmentSlaRiskExplanationLocale,
): string | null {
  if (typeof rawPattern !== 'string') return null;
  const normalized = rawPattern.replace(/[ \t]+/g, ' ').trim();
  if (normalized.length < ADVICE_PATTERN_MIN_LEN || normalized.length > ADVICE_PATTERN_MAX_LEN) {
    return null;
  }
  if (/\d/.test(normalized)) return null;

  const actionMatches = normalized.match(/\{\{action\}\}/g);
  const reasonMatches = normalized.match(/\{\{reason\}\}/g);
  if (actionMatches?.length !== 1 || reasonMatches?.length !== 1) return null;

  const wrapper = normalized
    .replace(ADVICE_ACTION_TOKEN, ' ')
    .replace(ADVICE_REASON_TOKEN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    wrapper.length === 0 ||
    wrapper.length > ADVICE_WRAPPER_MAX_LEN ||
    ADVICE_UNSAFE_FORMAT.test(wrapper) ||
    ADVICE_FORBIDDEN_CLAIMS.test(wrapper) ||
    ADVICE_WRAPPER_FORBIDDEN_VI.test(wrapper) ||
    ADVICE_WRAPPER_FORBIDDEN_EN.test(wrapper)
  ) {
    return null;
  }

  const letters = (wrapper.match(/\p{L}/gu) ?? []).length;
  if (letters < 3) return null;

  const sentenceProbe = normalized
    .replace(ADVICE_ACTION_TOKEN, 'action')
    .replace(ADVICE_REASON_TOKEN, 'reason');
  const sentences = sentenceProbe
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (sentences.length < 1 || sentences.length > 2) return null;

  if (locale === 'vi') {
    if (
      ADVICE_FORBIDDEN_VI_LOANWORDS.test(wrapper) ||
      EN_COMMON_WRAPPER_RE.test(wrapper) ||
      !VI_DIACRITIC_RE.test(wrapper)
    ) {
      return null;
    }
  } else {
    if (
      !/[a-z]/i.test(wrapper) ||
      VI_DIACRITIC_RE.test(wrapper) ||
      VI_ASCII_WRAPPER_RE.test(wrapper)
    ) {
      return null;
    }
  }

  return normalized;
}

function capitalizeFirstChar(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const first = trimmed.charAt(0);
  return first.toLocaleUpperCase() + trimmed.slice(1);
}

function lowercaseFirstChar(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const first = trimmed.charAt(0);
  return first.toLocaleLowerCase() + trimmed.slice(1);
}

/**
 * Deterministically fills Gemini's validated `advicePattern` with ORCA's verified action phrase
 * and verified reason sentence (Section 2). Handles sentence-initial capitalization and punctuation.
 */
export function renderGroundedAdvicePattern(
  rawPattern: unknown,
  actionPhrase: string,
  reasonSentence: string,
  locale: FulfillmentSlaRiskExplanationLocale,
): string | null {
  const pattern = validateGroundedAdvicePattern(rawPattern, locale);
  const cleanAction = actionPhrase.trim().replace(/[.!?]+$/, '');
  const cleanReason = reasonSentence.trim();
  if (!pattern || !cleanAction || !cleanReason) return null;

  const actionIdx = pattern.indexOf(ADVICE_ACTION_TOKEN);
  const beforeAction = pattern.slice(0, actionIdx).trimEnd();
  const actionStartsSentence = beforeAction.length === 0 || /[.!?]$/.test(beforeAction);
  const formattedAction = actionStartsSentence ? capitalizeFirstChar(cleanAction) : cleanAction;

  const afterActionSubst = pattern.replace(ADVICE_ACTION_TOKEN, formattedAction);
  const reasonIdx = afterActionSubst.indexOf(ADVICE_REASON_TOKEN);
  const beforeReason = afterActionSubst.slice(0, reasonIdx).trimEnd();
  const afterReason = afterActionSubst.slice(reasonIdx + ADVICE_REASON_TOKEN.length).trimStart();
  const reasonStartsSentence = beforeReason.length === 0 || /[.!?]$/.test(beforeReason);
  const reasonFollowedByPunct = /^[.,;!?]/.test(afterReason);
  let formattedReason = reasonStartsSentence ? cleanReason : lowercaseFirstChar(cleanReason);
  if (reasonFollowedByPunct) {
    formattedReason = formattedReason.replace(/[.!?]+$/, '');
  }

  return afterActionSubst
    .replace(ADVICE_REASON_TOKEN, formattedReason)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .trim();
}

export type AdviceActionKey =
  | 'VIEW_OPEN_SHORTAGE_LINE'
  | 'VIEW_OPEN_SHORTAGE_WAVE'
  | 'CHECK_PICK_PROGRESS_LINE'
  | 'CHECK_PICK_PROGRESS_WAVE'
  | 'CHECK_PICK_PROGRESS_LIST'
  | 'CHECK_RESERVATION'
  | 'CHECK_DISPATCH_FAILURE'
  | 'CHECK_LABEL_VERIFICATION'
  | 'REVIEW_PICK_BACKLOG'
  | 'REVIEW_PACK_QUEUE'
  | 'REVIEW_HANDOVER_QUEUE';

export function resolveAdviceActionKey(
  action: FulfillmentSlaRiskCandidateAction,
  target: FulfillmentSlaRiskVerifiedTarget | null | undefined,
): AdviceActionKey {
  switch (action) {
    case 'VIEW_OPEN_SHORTAGE':
      return target?.kind === 'picking_shortage_line'
        ? 'VIEW_OPEN_SHORTAGE_LINE'
        : 'VIEW_OPEN_SHORTAGE_WAVE';
    case 'CHECK_PICK_PROGRESS':
      if (target?.kind === 'picking_progress_line') return 'CHECK_PICK_PROGRESS_LINE';
      if (target?.kind === 'picking_wave') return 'CHECK_PICK_PROGRESS_WAVE';
      return 'CHECK_PICK_PROGRESS_LIST';
    case 'CHECK_RESERVATION':
      return 'CHECK_RESERVATION';
    case 'CHECK_DISPATCH_FAILURE':
      return 'CHECK_DISPATCH_FAILURE';
    case 'CHECK_LABEL_VERIFICATION':
      return 'CHECK_LABEL_VERIFICATION';
    case 'REVIEW_PICK_BACKLOG':
      return 'REVIEW_PICK_BACKLOG';
    case 'REVIEW_PACK_QUEUE':
      return 'REVIEW_PACK_QUEUE';
    case 'REVIEW_HANDOVER_QUEUE':
      return 'REVIEW_HANDOVER_QUEUE';
  }
}

export type AdviceReasonKey =
  | 'SHORTAGE_OPEN'
  | 'SHORTAGE_WITH_REMAINING_PICK'
  | 'SHORTAGE_WITH_BENCHMARK_TIGHT'
  | 'PICK_REMAINING_UNBLOCKED'
  | 'PICK_TIME_VS_BENCHMARK'
  | 'PICK_QUEUE_AND_AGE'
  | 'PICK_NO_BENCHMARK'
  | 'PICK_TIME_ONLY'
  | 'RESERVATION_OPEN'
  | 'DISPATCH_FAILURE_OPEN'
  | 'LABEL_VERIFYING_OPEN'
  | 'PACK_TIME_VS_BENCHMARK'
  | 'PACK_WAITING_LABEL_DELAY'
  | 'PACK_QUEUE_AND_AGE'
  | 'PACK_NO_BENCHMARK'
  | 'PACK_TIME_ONLY'
  | 'HANDOVER_TIME_VS_BENCHMARK'
  | 'HANDOVER_QUEUE_AND_CONGESTION'
  | 'HANDOVER_NO_BENCHMARK'
  | 'HANDOVER_TIME_ONLY';

/**
 * Resolves ORCA's verified, countdown-free reason sentence key for token-structured Gemini advice
 * (Section 2). Only cites historical handling duration when `COHORT_BENCHMARK` is verified & tight.
 */
export function resolveAdviceReasonKey(
  templateId: FulfillmentSlaRiskExplanationTemplateId,
  facts: readonly FulfillmentSlaRiskExplanationFact[],
): AdviceReasonKey {
  const benchFact = findLocalFact(facts, 'COHORT_BENCHMARK');
  const timeFact = findLocalFact(facts, 'TIME_REMAINING');
  const benchUpper = benchFact?.metrics.p80Minutes ?? benchFact?.metrics.p50Minutes;
  const hasTightBenchmark = Boolean(
    benchFact &&
    timeFact &&
    isPositiveFinite(benchUpper) &&
    timeFact.metrics.minutesRemaining < benchUpper,
  );
  const hasPickRemaining = facts.some((f) => f.factId === 'PICK_REMAINING');

  switch (templateId) {
    case 'SHORTAGE_WITH_TIME_PRESSURE':
      return hasTightBenchmark ? 'SHORTAGE_WITH_BENCHMARK_TIGHT' : 'SHORTAGE_OPEN';
    case 'SHORTAGE_WITH_WORKLOAD':
      return hasPickRemaining ? 'SHORTAGE_WITH_REMAINING_PICK' : 'SHORTAGE_OPEN';
    case 'SHORTAGE_PRIMARY':
      return 'SHORTAGE_OPEN';
    case 'PICK_REMAINING_WORKLOAD':
      return 'PICK_REMAINING_UNBLOCKED';
    case 'PICK_TIME_VS_BENCHMARK':
      return hasTightBenchmark ? 'PICK_TIME_VS_BENCHMARK' : 'PICK_TIME_ONLY';
    case 'PICK_QUEUE_AND_AGE':
      return 'PICK_QUEUE_AND_AGE';
    case 'PICK_NO_BENCHMARK':
      return 'PICK_NO_BENCHMARK';
    case 'PICK_TIME_ONLY':
      return hasTightBenchmark ? 'PICK_TIME_VS_BENCHMARK' : 'PICK_TIME_ONLY';
    case 'RESERVATION_WITH_TIME_PRESSURE':
    case 'RESERVATION_WITH_QUEUE_PRESSURE':
    case 'RESERVATION_PRIMARY':
      return 'RESERVATION_OPEN';
    case 'DISPATCH_FAILURE_WITH_TIME_PRESSURE':
    case 'DISPATCH_FAILURE_PRIMARY':
      return 'DISPATCH_FAILURE_OPEN';
    case 'LABEL_VERIFYING_WITH_TIME_PRESSURE':
    case 'LABEL_VERIFYING_PRIMARY':
      return 'LABEL_VERIFYING_OPEN';
    case 'PACK_TIME_VS_BENCHMARK':
      return hasTightBenchmark ? 'PACK_TIME_VS_BENCHMARK' : 'PACK_TIME_ONLY';
    case 'PACK_WAITING_LABEL_DELAY':
      return 'PACK_WAITING_LABEL_DELAY';
    case 'PACK_QUEUE_AND_AGE':
      return 'PACK_QUEUE_AND_AGE';
    case 'PACK_NO_BENCHMARK':
      return 'PACK_NO_BENCHMARK';
    case 'PACK_TIME_ONLY':
      return 'PACK_TIME_ONLY';
    case 'HANDOVER_TIME_VS_BENCHMARK':
      return hasTightBenchmark ? 'HANDOVER_TIME_VS_BENCHMARK' : 'HANDOVER_TIME_ONLY';
    case 'HANDOVER_QUEUE_AND_CONGESTION':
      return 'HANDOVER_QUEUE_AND_CONGESTION';
    case 'HANDOVER_NO_BENCHMARK':
      return 'HANDOVER_NO_BENCHMARK';
    case 'HANDOVER_TIME_ONLY':
      return 'HANDOVER_TIME_ONLY';
  }
}

export function formatRiskClockTime(iso: string, timeZone: string, locale: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  const resolvedLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  try {
    return new Intl.DateTimeFormat(resolvedLocale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(resolvedLocale, { ...options, timeZone: 'UTC' }).format(date);
  }
}

export function formatRemainingDuration(
  deadlineAt: string,
  nowMs: number = Date.now(),
): RemainingDurationParts {
  const deadlineMs = Date.parse(deadlineAt);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) {
    return { kind: 'expired' };
  }
  const diffMs = deadlineMs - nowMs;
  if (diffMs < 60_000) {
    return { kind: 'under_minute' };
  }
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) {
    return { kind: 'minutes', minutes: totalMinutes };
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { kind: 'hours_minutes', hours, minutes };
}

export const AUTO_REFRESH_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000] as const;

/**
 * Computes the next foreground auto-refresh delay in ms (UI2):
 * - Returns null when tab is hidden, feature is disabled/forbidden/unavailable, or already loading.
 * - For READY snapshots: schedules refresh right near `validUntil` (never spamming rapid ticks).
 * - For WARMING_UP / STALE / error / MODEL_UNAVAILABLE: uses bounded exponential backoff (15s..120s).
 */
export function computeNextAutoRefreshDelayMs(input: {
  readonly view: EvaluatedRiskView;
  readonly isVisible: boolean;
  readonly loading: boolean;
  readonly retryAttempt: number;
  readonly nowMs?: number;
}): number | null {
  if (!input.isVisible || input.loading) return null;
  const nowMs = input.nowMs ?? Date.now();
  const backoffIndex = Math.min(
    AUTO_REFRESH_BACKOFF_MS.length - 1,
    Math.max(0, Math.floor(input.retryAttempt)),
  );
  const backoffDelay = AUTO_REFRESH_BACKOFF_MS[backoffIndex] ?? 120_000;

  switch (input.view.kind) {
    case 'scope_mismatch':
    case 'loading':
    case 'endpoint_unavailable':
    case 'forbidden':
    case 'DISABLED':
      return null;
    case 'READY': {
      const validUntil = input.view.data.validUntil;
      if (!validUntil) return null;
      const validMs = Date.parse(validUntil);
      if (!Number.isFinite(validMs)) return null;
      // Refresh right after snapshot TTL expiry (or 15s minimum guard) so open screens roll cleanly across ticks.
      return Math.max(15_000, validMs - nowMs + 1_500);
    }
    case 'WARMING_UP':
    case 'INSUFFICIENT_DATA':
    case 'STALE':
    case 'MODEL_UNAVAILABLE':
    case 'error':
      return backoffDelay;
  }
}

export function isRiskSnapshotExpired(
  validUntil: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!validUntil) return false;
  const expiresAt = Date.parse(validUntil);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

/** Each row expires at min(deadlineAt, validUntil) so overdue parcels leave pre-deadline advisory immediately. */
export function getItemEffectiveExpiryMs(deadlineAt: string, validUntil: string | null): number {
  const deadlineMs = Date.parse(deadlineAt);
  if (!Number.isFinite(deadlineMs)) return Number.NEGATIVE_INFINITY;
  if (!validUntil) return deadlineMs;
  const validUntilMs = Date.parse(validUntil);
  return Number.isFinite(validUntilMs) ? Math.min(deadlineMs, validUntilMs) : deadlineMs;
}

function summarizeActiveItems(items: readonly FulfillmentSlaRiskItem[]): FulfillmentSlaRiskSummary {
  const seen = new Set<string>();
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  const highStageCounts = new Map<FulfillmentSlaRiskStage, number>();

  for (const item of items) {
    if (seen.has(item.fulfillmentOrderId)) continue;
    seen.add(item.fulfillmentOrderId);
    if (item.tier === 'HIGH') {
      highCount += 1;
      highStageCounts.set(item.stage, (highStageCounts.get(item.stage) ?? 0) + 1);
    } else if (item.tier === 'MEDIUM') {
      mediumCount += 1;
    } else {
      lowCount += 1;
    }
  }

  let topHighStage: FulfillmentSlaRiskStage | null = null;
  let topHighStageCount = 0;
  for (const [stage, count] of highStageCounts.entries()) {
    if (
      count > topHighStageCount ||
      (count === topHighStageCount &&
        topHighStage !== null &&
        STAGE_TIE_ORDER[stage] < STAGE_TIE_ORDER[topHighStage])
    ) {
      topHighStage = stage;
      topHighStageCount = count;
    }
  }

  return {
    validTotal: seen.size,
    highCount,
    mediumCount,
    lowCount,
    topHighStage,
    topHighStageCount,
  };
}

export function summarizeExcludedCoverage(
  coverage: FulfillmentSlaRiskCoverage | null | undefined,
): ExcludedCoverageSummary {
  if (!coverage) {
    return { total: 0, missingCalendar: 0, blocked: 0, unsupported: 0, activeOver30Days: 0 };
  }
  const missingCalendar = Math.max(0, coverage.missingCalendar);
  const blocked = Math.max(0, coverage.blocked);
  const unsupported = Math.max(0, coverage.unsupported);
  const activeOver30Days = Math.max(0, coverage.activeOver30Days);
  return {
    total: missingCalendar + blocked + unsupported + activeOver30Days,
    missingCalendar,
    blocked,
    unsupported,
    activeOver30Days,
  };
}

/**
 * Pure fail-closed view evaluator (H6): only a non-expired READY snapshot yields rows,
 * summary totals, hasMore, and workflow actions. Each parcel expires at min(deadlineAt, validUntil).
 * Distinguishes TTL expiry, server-side invalidation, and live deadline crossing.
 */
export function evaluateRiskViewState(
  snapshot: ScopedRiskSnapshot,
  expectedScopeKey: string,
  nowMs: number = Date.now(),
): EvaluatedRiskView {
  if (snapshot.scopeKey !== expectedScopeKey) {
    return { kind: 'scope_mismatch' };
  }
  if (!snapshot.result) {
    return { kind: 'loading' };
  }
  if (snapshot.result.kind !== 'ok') {
    return { kind: snapshot.result.kind };
  }

  const data = snapshot.result.data;
  if (data.state === 'STALE') {
    const staleReason: EvaluatedStaleReason =
      !isRiskSnapshotExpired(data.validUntil, nowMs) &&
      (data.coverage?.invalidatedSinceAsOf ?? 0) > 0
        ? 'invalidated'
        : 'ttl_expired';
    return {
      kind: 'STALE',
      staleReason,
      data,
      activeRisks: [],
      summary: null,
      summaryScope: 'warehouse',
      hasMore: false,
      nextExpiryMs: null,
    };
  }
  if (data.state !== 'READY') {
    return {
      kind: data.state,
      data,
      activeRisks: [],
      summary: null,
      summaryScope: 'warehouse',
      hasMore: false,
      nextExpiryMs: null,
    };
  }

  if (isRiskSnapshotExpired(data.validUntil, nowMs)) {
    return {
      kind: 'STALE',
      staleReason: 'ttl_expired',
      data,
      activeRisks: [],
      summary: null,
      summaryScope: 'warehouse',
      hasMore: false,
      nextExpiryMs: null,
    };
  }

  let expiredByDeadlineCount = 0;
  const activeRisks = data.risks.filter((item) => {
    const deadlineMs = Date.parse(item.deadlineAt);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) {
      expiredByDeadlineCount += 1;
      return false;
    }
    return getItemEffectiveExpiryMs(item.deadlineAt, data.validUntil) > nowMs;
  });

  if (data.risks.length > 0 && activeRisks.length === 0) {
    return {
      kind: 'STALE',
      staleReason: expiredByDeadlineCount > 0 ? 'all_past_deadline' : 'ttl_expired',
      data,
      activeRisks: [],
      summary: null,
      summaryScope: 'warehouse',
      hasMore: false,
      nextExpiryMs: null,
    };
  }

  const clientDroppedAny = activeRisks.length !== data.risks.length;
  let summary: FulfillmentSlaRiskSummary;
  let summaryScope: 'warehouse' | 'displayed';
  if (!clientDroppedAny && data.summary !== null) {
    summary = data.summary;
    summaryScope = 'warehouse';
  } else {
    summary = summarizeActiveItems(activeRisks);
    summaryScope = data.hasMore || clientDroppedAny ? 'displayed' : 'warehouse';
  }

  const candidateExpiries: number[] = [];
  if (data.validUntil) {
    const validMs = Date.parse(data.validUntil);
    if (Number.isFinite(validMs)) candidateExpiries.push(validMs);
  }
  for (const item of activeRisks) {
    const exp = getItemEffectiveExpiryMs(item.deadlineAt, data.validUntil);
    if (Number.isFinite(exp)) candidateExpiries.push(exp);
  }
  const nextExpiryMs = candidateExpiries.length > 0 ? Math.min(...candidateExpiries) : null;

  return {
    kind: 'READY',
    data,
    activeRisks,
    expiredByDeadlineCount,
    summary,
    summaryScope,
    hasMore: data.hasMore,
    nextExpiryMs,
  };
}

export function resolveDisplayStage(item: FulfillmentSlaRiskItem): FulfillmentSlaRiskDisplayStage {
  if (
    item.stage === 'WAITING_LABEL' &&
    (item.recommendationCode === 'CHECK_LABEL_VERIFICATION' ||
      item.reasons.some(
        (reason) => reason.code === 'WAITING_FOR_LABEL' && reason.evidence.isLabelVerifying,
      ))
  ) {
    return 'WAITING_LABEL_VERIFYING';
  }
  return item.stage;
}

/**
 * Extracts verified, PII-free facts from a scored parcel's reasons (matching BE contract).
 */
export function extractLocalRiskFacts(
  reasons: readonly FulfillmentSlaRiskReason[],
): FulfillmentSlaRiskExplanationFact[] {
  const facts: FulfillmentSlaRiskExplanationFact[] = [];
  const seen = new Set<FulfillmentSlaRiskFactId>();
  const pushUnique = (fact: FulfillmentSlaRiskExplanationFact): void => {
    if (seen.has(fact.factId)) return;
    seen.add(fact.factId);
    facts.push(fact);
  };

  for (const reason of reasons) {
    switch (reason.code) {
      case 'OPEN_PICK_SHORTAGE':
        pushUnique({
          factId: 'OPEN_PICK_SHORTAGE',
          kind: 'BLOCKER_EVENT',
          reasonCode: 'OPEN_PICK_SHORTAGE',
          metrics: { remainingPickQty: roundNonNegative(reason.evidence.remainingPickQty) },
        });
        break;
      case 'RESERVATION_ISSUE':
        pushUnique({
          factId: 'RESERVATION_ISSUE',
          kind: 'BLOCKER_EVENT',
          reasonCode: 'RESERVATION_ISSUE',
          metrics: { remainingPickQty: roundNonNegative(reason.evidence.remainingPickQty) },
        });
        break;
      case 'DISPATCH_FAILURE':
        pushUnique({
          factId: 'DISPATCH_FAILURE',
          kind: 'BLOCKER_EVENT',
          reasonCode: 'DISPATCH_FAILURE',
          metrics: { stageAgeMinutes: roundNonNegative(reason.evidence.stageAgeMinutes) },
        });
        break;
      case 'WAITING_FOR_LABEL':
        pushUnique({
          factId: 'WAITING_FOR_LABEL',
          kind: 'BLOCKER_EVENT',
          reasonCode: 'WAITING_FOR_LABEL',
          metrics: {
            stageAgeMinutes: roundNonNegative(reason.evidence.stageAgeMinutes),
            isLabelVerifying: Boolean(reason.evidence.isLabelVerifying),
          },
        });
        break;
      case 'SHORT_TIME_TO_CUTOFF':
      case 'COHORT_DURATION_PRESSURE': {
        const minutesRemaining = roundNonNegative(reason.evidence.minutesRemaining);
        const p50Value = reason.evidence.p50Minutes;
        const p80Value = reason.evidence.p80Minutes;
        const hasP50 = isPositiveFinite(p50Value);
        const hasP80 = isPositiveFinite(p80Value);
        pushUnique({
          factId: 'TIME_REMAINING',
          kind: 'SCORE_DRIVER',
          reasonCode: reason.code,
          metrics: { minutesRemaining },
        });
        if (hasP50 || hasP80) {
          pushUnique({
            factId: 'COHORT_BENCHMARK',
            kind: 'SCORE_DRIVER',
            reasonCode: reason.code,
            metrics: {
              ...(hasP50 ? { p50Minutes: roundNonNegative(p50Value) } : {}),
              ...(hasP80 ? { p80Minutes: roundNonNegative(p80Value) } : {}),
            },
          });
        } else if (reason.code === 'COHORT_DURATION_PRESSURE') {
          pushUnique({
            factId: 'BENCHMARK_MISSING',
            kind: 'MISSING_REFERENCE',
            reasonCode: 'COHORT_DURATION_PRESSURE',
            metrics: { minutesRemaining },
          });
        }
        break;
      }
      case 'STAGE_AGE_ELEVATED':
        pushUnique({
          factId: 'STAGE_AGE_ELEVATED',
          kind: 'SCORE_DRIVER',
          reasonCode: 'STAGE_AGE_ELEVATED',
          metrics: {
            stageAgeMinutes: roundNonNegative(reason.evidence.stageAgeMinutes),
            stage: reason.evidence.stage,
          },
        });
        break;
      case 'PICK_REMAINING':
        pushUnique({
          factId: 'PICK_REMAINING',
          kind: 'SCORE_DRIVER',
          reasonCode: 'PICK_REMAINING',
          metrics: {
            remainingPickQty: roundNonNegative(reason.evidence.remainingPickQty),
            distinctSkuCount: roundNonNegative(reason.evidence.distinctSkuCount),
          },
        });
        break;
      case 'PICK_BACKLOG_HIGH':
        pushUnique({
          factId: 'STAGE_QUEUE_LOAD',
          kind: 'SCORE_DRIVER',
          reasonCode: 'PICK_BACKLOG_HIGH',
          metrics: {
            stageOtherParcelsCount: roundNonNegative(reason.evidence.stageOtherParcelsCount),
            warehouseTotalActiveCount: roundNonNegative(reason.evidence.warehouseTotalActiveCount),
          },
        });
        break;
      case 'WAREHOUSE_CONGESTION':
        pushUnique({
          factId: 'WAREHOUSE_THROUGHPUT_LOAD',
          kind: 'SCORE_DRIVER',
          reasonCode: 'WAREHOUSE_CONGESTION',
          metrics: {
            warehouseTotalActiveCount: roundNonNegative(reason.evidence.warehouseTotalActiveCount),
            handoversLast60mCount: roundNonNegative(reason.evidence.handoversLast60mCount),
          },
        });
        break;
    }
  }
  return facts;
}

function findLocalFact<T extends FulfillmentSlaRiskFactId>(
  facts: readonly FulfillmentSlaRiskExplanationFact[],
  factId: T,
): Extract<FulfillmentSlaRiskExplanationFact, { factId: T }> | undefined {
  return facts.find(
    (fact): fact is Extract<FulfillmentSlaRiskExplanationFact, { factId: T }> =>
      fact.factId === factId,
  );
}

function rulePassesQuantitativeGate(
  rule: TemplateRule,
  facts: readonly FulfillmentSlaRiskExplanationFact[],
): boolean {
  const timeFact = findLocalFact(facts, 'TIME_REMAINING');
  const benchFact = findLocalFact(facts, 'COHORT_BENCHMARK');
  const missingBench = findLocalFact(facts, 'BENCHMARK_MISSING');
  const ageFact = findLocalFact(facts, 'STAGE_AGE_ELEVATED');
  const pickFact = findLocalFact(facts, 'PICK_REMAINING');
  const queueFact = findLocalFact(facts, 'STAGE_QUEUE_LOAD');
  const whFact = findLocalFact(facts, 'WAREHOUSE_THROUGHPUT_LOAD');

  const hasElevatedAge =
    ageFact !== undefined && ageFact.metrics.stageAgeMinutes >= ELEVATED_STAGE_AGE_MIN;
  const hasHighQueue =
    (queueFact !== undefined &&
      (queueFact.metrics.stageOtherParcelsCount >= HIGH_STAGE_QUEUE_MIN ||
        queueFact.metrics.warehouseTotalActiveCount >= HIGH_WAREHOUSE_ACTIVE_MIN)) ||
    (whFact !== undefined && whFact.metrics.warehouseTotalActiveCount >= HIGH_WAREHOUSE_ACTIVE_MIN);
  const hasPickWorkload = pickFact !== undefined && pickFact.metrics.remainingPickQty >= 1;
  const benchUpper = benchFact?.metrics.p80Minutes ?? benchFact?.metrics.p50Minutes;

  switch (rule.gate) {
    case 'NONE':
      return true;
    case 'TIME_PRESSURE': {
      if (!timeFact) return false;
      const rem = timeFact.metrics.minutesRemaining;
      if (isPositiveFinite(benchUpper)) return rem < benchUpper;
      return rem <= FALLBACK_TIGHT_TIME_MIN;
    }
    case 'BENCHMARK_PRESSURE': {
      if (!timeFact || !benchFact || !isPositiveFinite(benchUpper)) return false;
      return timeFact.metrics.minutesRemaining <= Math.round(benchUpper * 1.25);
    }
    case 'PICK_WORKLOAD':
      return hasPickWorkload;
    case 'QUEUE_OR_AGE_PRESSURE':
      return hasElevatedAge || hasHighQueue;
    case 'WORKLOAD_OR_QUEUE_PRESSURE':
      return hasPickWorkload || hasElevatedAge || hasHighQueue;
    case 'MISSING_BENCHMARK':
      return Boolean(timeFact && missingBench && !benchFact);
  }
}

function ruleMatchesFacts(
  rule: TemplateRule,
  factIds: ReadonlySet<FulfillmentSlaRiskFactId>,
  facts: readonly FulfillmentSlaRiskExplanationFact[],
): boolean {
  for (const req of rule.requiredFactIds) {
    if (!factIds.has(req)) return false;
  }
  if (rule.anyOfFactIds && rule.anyOfFactIds.length > 0) {
    if (!rule.anyOfFactIds.some((candidate) => factIds.has(candidate))) return false;
  }
  return rulePassesQuantitativeGate(rule, facts);
}

/**
 * Deterministic instant fallback shown immediately when a parcel's "Why?" panel opens,
 * aligned with BE G1 quantitative gates & pilot assistant eligibility (`PICKING` HIGH/MEDIUM).
 */
export function buildLocalParcelExplanation(item: FulfillmentSlaRiskItem): LocalParcelExplanation {
  const allFacts = extractLocalRiskFacts(item.reasons);
  const factIds = new Set(allFacts.map((fact) => fact.factId));
  let allowed = LOCAL_TEMPLATE_RULES.filter(
    (rule) =>
      rule.recommendationCode === item.recommendationCode &&
      ruleMatchesFacts(rule, factIds, allFacts),
  );
  if (allowed.length === 0) {
    const byAction = LOCAL_TEMPLATE_RULES.filter(
      (rule) => rule.recommendationCode === item.recommendationCode,
    );
    const fallbackRule = byAction[byAction.length - 1];
    if (fallbackRule) allowed = [fallbackRule];
  }
  const primaryRule = allowed[0] ?? LOCAL_TEMPLATE_RULES[0];
  if (!primaryRule) {
    return {
      facts: [],
      explanationTemplateId: 'PICK_TIME_ONLY',
      hasMultipleInterpretations: false,
    };
  }

  const chosenIds: FulfillmentSlaRiskFactId[] = [];
  const addId = (id: FulfillmentSlaRiskFactId): void => {
    if (chosenIds.length >= 2 || chosenIds.includes(id) || !factIds.has(id)) return;
    chosenIds.push(id);
  };
  for (const req of primaryRule.requiredFactIds) addId(req);
  if (primaryRule.anyOfFactIds) {
    for (const candidate of primaryRule.anyOfFactIds) {
      if (factIds.has(candidate)) {
        addId(candidate);
        break;
      }
    }
  }
  for (const fact of allFacts) {
    if (chosenIds.length >= 2) break;
    if (fact.factId === 'BENCHMARK_MISSING' && chosenIds.includes('TIME_REMAINING')) continue;
    addId(fact.factId);
  }

  const facts = chosenIds
    .map((id) => allFacts.find((fact) => fact.factId === id))
    .filter((fact): fact is FulfillmentSlaRiskExplanationFact => Boolean(fact));

  // Explicit product opt-in: request token-structured Gemini phrasing (`advicePattern`) for every
  // parcel with verified facts across all stages and risk tiers, while keeping ORCA visible until
  // a verified GEMINI selection arrives and falling back cleanly to ORCA on any rejection/error.
  const hasMultipleInterpretations = allFacts.length > 0;

  return {
    facts,
    explanationTemplateId: primaryRule.templateId,
    hasMultipleInterpretations,
  };
}

/**
 * Picks ONE concise, honest signal phrase for the collapsed row (G1: never presents
 * parcel remainingPickQty as a shortage delta; uses "Có báo thiếu hàng" for open pick shortages).
 */
export function resolvePrimarySignal(
  item: FulfillmentSlaRiskItem,
  locale = 'vi',
): {
  readonly key: string;
  readonly values: Record<string, string | number>;
  readonly stageKey?: FulfillmentSlaRiskDisplayStage;
} {
  const findReason = <T extends FulfillmentSlaRiskReason['code']>(code: T) =>
    item.reasons.find((r): r is Extract<FulfillmentSlaRiskReason, { code: T }> => r.code === code);

  const shortage = findReason('OPEN_PICK_SHORTAGE');
  if (shortage) {
    return {
      key: 'signals.OPEN_PICK_SHORTAGE',
      values: {},
      stageKey: resolveDisplayStage(item),
    };
  }

  const reservation = findReason('RESERVATION_ISSUE');
  if (reservation) {
    // M4: Never present parcel remainingPickQty as an unreserved unit count;
    // snapshot only confirms a reservation issue exists.
    return { key: 'signals.RESERVATION_ISSUE', values: {} };
  }

  const dispatchFailure = findReason('DISPATCH_FAILURE');
  if (dispatchFailure || item.recommendationCode === 'CHECK_DISPATCH_FAILURE') {
    return { key: 'signals.DISPATCH_FAILURE', values: {} };
  }

  const waitingLabel = findReason('WAITING_FOR_LABEL');
  if (waitingLabel) {
    return waitingLabel.evidence.isLabelVerifying
      ? { key: 'signals.WAITING_LABEL_VERIFYING', values: {} }
      : { key: 'signals.WAITING_LABEL', values: {} };
  }
  if (resolveDisplayStage(item) === 'WAITING_LABEL_VERIFYING') {
    return { key: 'signals.WAITING_LABEL_VERIFYING', values: {} };
  }

  const pickRemaining = findReason('PICK_REMAINING');
  if (pickRemaining && roundNonNegative(pickRemaining.evidence.remainingPickQty) > 0) {
    return {
      key: 'signals.PICK_REMAINING',
      values: { qty: roundNonNegative(pickRemaining.evidence.remainingPickQty) },
    };
  }

  const stageAge = findReason('STAGE_AGE_ELEVATED');
  if (stageAge) {
    return {
      key: 'signals.STAGE_AGE_ELEVATED',
      values: {
        duration: formatElapsedMinutes(stageAge.evidence.stageAgeMinutes, locale),
      },
      stageKey: stageAge.evidence.stage,
    };
  }

  const backlogHigh = findReason('PICK_BACKLOG_HIGH');
  if (backlogHigh) {
    return {
      key: 'signals.PICK_BACKLOG_HIGH',
      values: { count: backlogHigh.evidence.stageOtherParcelsCount },
    };
  }

  const congestion = findReason('WAREHOUSE_CONGESTION');
  if (congestion) {
    return {
      key: 'signals.WAREHOUSE_CONGESTION',
      values: { count: congestion.evidence.warehouseTotalActiveCount },
    };
  }

  return {
    key: 'signals.STAGE_ONLY',
    values: {},
    stageKey: resolveDisplayStage(item),
  };
}

/**
 * Resolves i18n key + values for a verified explanation fact using exact p50 (median) / p80 (80th pct) labels.
 * Formats elapsed durations naturally (e.g. 202 min -> "3 giờ 22 phút") with snapshot observation clock,
 * and avoids repeating remainingPickQty when PICK_REMAINING is already displayed alongside OPEN_PICK_SHORTAGE.
 */
export function resolveFactTranslation(
  fact: FulfillmentSlaRiskExplanationFact,
  asOfClock?: string | null,
  locale = 'vi',
  options?: { readonly hasPickRemainingFact?: boolean },
): {
  readonly key: string;
  readonly values: Record<string, string | number>;
  readonly stageKey?: FulfillmentSlaRiskStage;
} {
  const clock = typeof asOfClock === 'string' ? asOfClock.trim() : '';
  switch (fact.factId) {
    case 'OPEN_PICK_SHORTAGE':
      return fact.metrics.remainingPickQty > 0 && !options?.hasPickRemainingFact
        ? {
            key: 'facts.OPEN_PICK_SHORTAGE',
            values: { qty: fact.metrics.remainingPickQty },
          }
        : {
            key: 'facts.OPEN_PICK_SHORTAGE_SIMPLE',
            values: {},
          };
    case 'RESERVATION_ISSUE':
      return fact.metrics.remainingPickQty > 0 && !options?.hasPickRemainingFact
        ? {
            key: 'facts.RESERVATION_ISSUE',
            values: { qty: fact.metrics.remainingPickQty },
          }
        : {
            key: 'facts.RESERVATION_ISSUE_SIMPLE',
            values: {},
          };
    case 'DISPATCH_FAILURE': {
      const duration = formatElapsedMinutes(fact.metrics.stageAgeMinutes, locale);
      return clock
        ? {
            key: 'facts.DISPATCH_FAILURE_AT',
            values: { duration, asOf: clock },
          }
        : {
            key: 'facts.DISPATCH_FAILURE',
            values: { duration },
          };
    }
    case 'WAITING_FOR_LABEL': {
      const duration = formatElapsedMinutes(fact.metrics.stageAgeMinutes, locale);
      if (fact.metrics.isLabelVerifying) {
        return clock
          ? { key: 'facts.WAITING_FOR_LABEL_VERIFYING_AT', values: { duration, asOf: clock } }
          : { key: 'facts.WAITING_FOR_LABEL_VERIFYING', values: { duration } };
      }
      return clock
        ? { key: 'facts.WAITING_FOR_LABEL_AT', values: { duration, asOf: clock } }
        : { key: 'facts.WAITING_FOR_LABEL', values: { duration } };
    }
    case 'TIME_REMAINING': {
      if (fact.metrics.minutesRemaining <= 0) {
        return clock
          ? { key: 'facts.TIME_REMAINING_UNDER_MINUTE_AT', values: { asOf: clock } }
          : { key: 'facts.TIME_REMAINING_UNDER_MINUTE', values: {} };
      }
      return clock
        ? {
            key: 'facts.TIME_REMAINING_AT',
            values: { minutes: fact.metrics.minutesRemaining, asOf: clock },
          }
        : {
            key: 'facts.TIME_REMAINING',
            values: { minutes: fact.metrics.minutesRemaining },
          };
    }
    case 'COHORT_BENCHMARK': {
      const p50 = fact.metrics.p50Minutes;
      const p80 = fact.metrics.p80Minutes;
      const hasP50 = isPositiveFinite(p50);
      const hasP80 = isPositiveFinite(p80);
      if (hasP50 && hasP80) {
        return {
          key: 'facts.COHORT_BENCHMARK_BOTH',
          values: { p50Minutes: p50, p80Minutes: p80 },
        };
      }
      if (hasP80) {
        return {
          key: 'facts.COHORT_BENCHMARK_P80',
          values: { p80Minutes: p80 },
        };
      }
      if (hasP50) {
        return {
          key: 'facts.COHORT_BENCHMARK_P50',
          values: { p50Minutes: p50 },
        };
      }
      return { key: 'facts.BENCHMARK_MISSING', values: {} };
    }
    case 'BENCHMARK_MISSING':
      return { key: 'facts.BENCHMARK_MISSING', values: {} };
    case 'STAGE_AGE_ELEVATED': {
      const duration = formatElapsedMinutes(fact.metrics.stageAgeMinutes, locale);
      return clock
        ? {
            key: 'facts.STAGE_AGE_ELEVATED_AT',
            values: { duration, asOf: clock },
            stageKey: fact.metrics.stage,
          }
        : {
            key: 'facts.STAGE_AGE_ELEVATED',
            values: { duration },
            stageKey: fact.metrics.stage,
          };
    }
    case 'PICK_REMAINING':
      return {
        key: 'facts.PICK_REMAINING',
        values: {
          qty: fact.metrics.remainingPickQty,
          skuCount: fact.metrics.distinctSkuCount,
        },
      };
    case 'STAGE_QUEUE_LOAD':
      return {
        key: 'facts.STAGE_QUEUE_LOAD',
        values: {
          stageCount: fact.metrics.stageOtherParcelsCount,
          warehouseCount: fact.metrics.warehouseTotalActiveCount,
        },
      };
    case 'WAREHOUSE_THROUGHPUT_LOAD':
      return {
        key: 'facts.WAREHOUSE_THROUGHPUT_LOAD',
        values: {
          warehouseCount: fact.metrics.warehouseTotalActiveCount,
          handoverCount: fact.metrics.handoversLast60mCount,
        },
      };
  }
}

export type OverdueElapsedDuration =
  | { readonly kind: 'days_hours'; readonly days: number; readonly hours: number }
  | { readonly kind: 'hours_minutes'; readonly hours: number; readonly minutes: number }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'under_minute' };

/**
 * Formats how long a parcel has been past its handover deadline.
 * Returns null if deadline is missing, invalid, or still in the future.
 */
export function formatOverdueElapsedDuration(
  deadlineIso: string | null | undefined,
  nowMs: number,
): OverdueElapsedDuration | null {
  if (!deadlineIso) return null;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return null;
  const elapsedMs = nowMs - deadlineMs;
  if (elapsedMs <= 0) return null;
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  if (totalMinutes < 1) return { kind: 'under_minute' };
  if (totalMinutes < 60) return { kind: 'minutes', minutes: totalMinutes };
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return { kind: 'hours_minutes', hours: totalHours, minutes: totalMinutes % 60 };
  }
  return {
    kind: 'days_hours',
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
  };
}

export function buildOverdueExceptionsPath(warehouseId: string, highlightId?: string): string {
  const params: Record<string, string> = {
    warehouse: warehouseId,
    reason: 'SLA.HANDOVER_OVERDUE',
  };
  if (highlightId) {
    params.highlight = highlightId;
  }
  const search = new URLSearchParams(params).toString();
  return `/exceptions?${search}`;
}

/**
 * Verified read-only navigation resolver (P1 UI1):
 * Prefers server-verified deep-link target (wave/line/exception) when present, falling back honestly
 * to wave or general list names when only broader scope is verified. Never promises actions without permission.
 */
export function resolveRiskNavigation(
  item: Pick<
    FulfillmentSlaRiskItem,
    'stage' | 'recommendationCode' | 'fulfillmentOrderId' | 'target'
  >,
  warehouseId: string,
  permissions: RiskNavigationPermissions,
  overrideTarget?: FulfillmentSlaRiskVerifiedTarget | null,
): RiskNavigationTarget {
  const canManagePicking = permissions.canManagePicking ?? true;
  const canShipmentsRoute = permissions.canShipmentsRoute ?? false;
  const canExceptionsRoute = permissions.canExceptionsRoute ?? false;
  const verifiedTarget = overrideTarget ?? item.target ?? null;

  if (verifiedTarget) {
    switch (verifiedTarget.kind) {
      case 'picking_shortage_line':
        return {
          kind: 'open_picking_line',
          waveId: verifiedTarget.waveId,
          waveCode: verifiedTarget.waveCode,
          lineId: verifiedTarget.lineId,
          exceptionId: verifiedTarget.exceptionId,
          labelKey: 'actionOpenShortageLine',
        };
      case 'picking_progress_line':
        return {
          kind: 'open_picking_line',
          waveId: verifiedTarget.waveId,
          waveCode: verifiedTarget.waveCode,
          lineId: verifiedTarget.lineId,
          labelKey: 'actionOpenPickLine',
        };
      case 'picking_wave':
        return {
          kind: 'open_picking_wave',
          waveId: verifiedTarget.waveId,
          waveCode: verifiedTarget.waveCode,
          labelKey: 'actionOpenWave',
        };
      case 'picking_waves_list':
        return { kind: 'focus_waves', labelKey: 'actionViewWaves' };
      case 'picking_backlog':
        return canManagePicking
          ? { kind: 'focus_backlog', labelKey: 'actionViewBacklog' }
          : { kind: 'none' };
      case 'packing_parcel': {
        if (!permissions.canPackingRoute) return { kind: 'none' };
        const search = new URLSearchParams({
          warehouse: warehouseId,
          fulfillment: verifiedTarget.fulfillmentOrderId,
        }).toString();
        return {
          kind: 'link',
          target: 'packing',
          to: `/warehouse/packing?${search}`,
          labelKey:
            item.recommendationCode === 'CHECK_LABEL_VERIFICATION'
              ? 'actionCheckLabel'
              : 'actionCheckPacking',
        };
      }
      case 'handover_parcel': {
        if (!permissions.canHandoverRoute) return { kind: 'none' };
        const search = new URLSearchParams({
          warehouse: warehouseId,
          fulfillment: verifiedTarget.fulfillmentOrderId,
        }).toString();
        return {
          kind: 'link',
          target: 'handover',
          to: `/warehouse/handover?${search}`,
          labelKey: 'actionViewHandover',
        };
      }
      case 'shipments_list':
        if (canShipmentsRoute) {
          return {
            kind: 'link',
            target: 'shipments',
            to: '/shipments',
            labelKey: 'actionViewShipments',
          };
        }
        if (canExceptionsRoute) {
          return {
            kind: 'link',
            target: 'exceptions',
            to: `/exceptions?${new URLSearchParams({ warehouse: warehouseId }).toString()}`,
            labelKey: 'actionViewExceptions',
          };
        }
        return { kind: 'none' };
    }
  }

  switch (item.recommendationCode) {
    case 'CHECK_PICK_SHORTAGE':
      return { kind: 'focus_waves', labelKey: 'actionViewWaves' };
    case 'CHECK_RESERVATION':
      return canManagePicking
        ? { kind: 'focus_backlog', labelKey: 'actionViewBacklog' }
        : { kind: 'none' };
    case 'REVIEW_PICK_BACKLOG':
      if (item.stage === 'PICKING') {
        return { kind: 'focus_waves', labelKey: 'actionViewWaves' };
      }
      return canManagePicking
        ? { kind: 'focus_backlog', labelKey: 'actionViewBacklog' }
        : { kind: 'none' };
    case 'CHECK_DISPATCH_FAILURE':
      if (canShipmentsRoute) {
        return {
          kind: 'link',
          target: 'shipments',
          to: '/shipments',
          labelKey: 'actionViewShipments',
        };
      }
      if (canExceptionsRoute) {
        return {
          kind: 'link',
          target: 'exceptions',
          to: `/exceptions?${new URLSearchParams({ warehouse: warehouseId }).toString()}`,
          labelKey: 'actionViewExceptions',
        };
      }
      return { kind: 'none' };
    case 'CHECK_LABEL_VERIFICATION': {
      if (!permissions.canPackingRoute) return { kind: 'none' };
      const search = new URLSearchParams({
        warehouse: warehouseId,
        fulfillment: item.fulfillmentOrderId,
      }).toString();
      return {
        kind: 'link',
        target: 'packing',
        to: `/warehouse/packing?${search}`,
        labelKey: 'actionCheckLabel',
      };
    }
    case 'REVIEW_PACK_QUEUE': {
      if (!permissions.canPackingRoute) return { kind: 'none' };
      const search = new URLSearchParams({
        warehouse: warehouseId,
        fulfillment: item.fulfillmentOrderId,
      }).toString();
      return {
        kind: 'link',
        target: 'packing',
        to: `/warehouse/packing?${search}`,
        labelKey: 'actionCheckPacking',
      };
    }
    case 'REVIEW_HANDOVER_QUEUE': {
      if (!permissions.canHandoverRoute) return { kind: 'none' };
      const search = new URLSearchParams({
        warehouse: warehouseId,
        fulfillment: item.fulfillmentOrderId,
      }).toString();
      return {
        kind: 'link',
        target: 'handover',
        to: `/warehouse/handover?${search}`,
        labelKey: 'actionViewHandover',
      };
    }
  }
}

const slaExceptionRowSummarySchema = z.object({
  id: z.string().min(1),
  reasonCode: z.string().min(1),
  status: z.string().min(1),
  aggregateId: z.string().min(1),
  warehouseId: z.string().min(1),
  fulfillmentOrderId: z.string().min(1).nullable().optional(),
  orderCode: z.string().max(100).nullable().optional(),
  parcelNo: z.number().int().positive().nullable().optional(),
  fulfillmentStatus: z.string().max(64).nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
});

/**
 * Silently reads open UC-104 handover-overdue exceptions for the selected warehouse only.
 * Never leaks other warehouses, ignores tracking-stalled rows, preserves pagination honesty
 * (hasMorePages), and fails closed to null without disturbing warehouse operations.
 */
export async function fetchWarehouseOverdueHandoverSummary(
  warehouseId: string,
  signal?: AbortSignal,
): Promise<OverdueHandoverCount | null> {
  try {
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/sla-exceptions', {
      params: {
        openOnly: 'true',
        limit: '50',
        warehouseId,
        reasonCode: 'SLA.HANDOVER_OVERDUE',
      },
      signal,
      silent: true,
    });
    const items = z.array(slaExceptionRowSummarySchema).parse(response.data);
    const hasMorePages = Boolean(response.meta?.pagination?.hasNext);
    const overdueParcels = new Set<string>();
    const previews: OverdueHandoverParcelPreview[] = [];
    for (const item of items) {
      if (
        item.warehouseId === warehouseId &&
        item.reasonCode === 'SLA.HANDOVER_OVERDUE' &&
        (item.status === 'OPEN' || item.status === 'ASSIGNED')
      ) {
        const isNew = !overdueParcels.has(item.aggregateId);
        overdueParcels.add(item.aggregateId);
        const trimmedOrderCode = item.orderCode?.trim();
        if (isNew && trimmedOrderCode) {
          previews.push({
            id: item.id,
            aggregateId: item.aggregateId,
            fulfillmentOrderId: item.fulfillmentOrderId ?? null,
            orderCode: trimmedOrderCode,
            parcelNo: item.parcelNo ?? null,
            fulfillmentStatus: item.fulfillmentStatus ?? null,
            deadline: item.deadline ?? null,
            status: item.status,
          });
        }
      }
    }
    return previews.length > 0
      ? { count: overdueParcels.size, hasMorePages, parcels: previews }
      : { count: overdueParcels.size, hasMorePages };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    return null;
  }
}

/**
 * Coordinates warehouse/session-scoped overdue handover summary checks with strict abort/scope isolation.
 */
export function createScopedOverdueController(
  loader: (
    warehouseId: string,
    signal: AbortSignal,
  ) => Promise<OverdueHandoverCount | null> = fetchWarehouseOverdueHandoverSummary,
  onChange?: (state: ScopedOverdueHandoverState) => void,
) {
  let state: ScopedOverdueHandoverState = {
    scopeKey: '',
    status: 'idle',
    count: 0,
    hasMorePages: false,
  };
  let activeController: AbortController | null = null;
  let activeSeq = 0;

  const publish = (next: ScopedOverdueHandoverState) => {
    state = next;
    onChange?.(next);
  };

  const reset = () => {
    activeSeq += 1;
    activeController?.abort();
    activeController = null;
    publish({ scopeKey: '', status: 'idle', count: 0, hasMorePages: false });
  };

  return {
    getState: () => state,
    reset,
    async load(scopeKey: string, warehouseId: string): Promise<ScopedOverdueHandoverState> {
      activeSeq += 1;
      const seq = activeSeq;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      if (state.scopeKey !== scopeKey) {
        publish({ scopeKey, status: 'idle', count: 0, hasMorePages: false });
      }

      try {
        const result = await loader(warehouseId, controller.signal);
        if (seq !== activeSeq || controller.signal.aborted) return state;
        if (!result) {
          publish({ scopeKey, status: 'idle', count: 0, hasMorePages: false });
          return state;
        }
        publish({
          scopeKey,
          status: 'ready',
          count: result.count,
          hasMorePages: result.hasMorePages,
          ...(result.parcels && result.parcels.length > 0 ? { parcels: result.parcels } : {}),
        });
        return state;
      } catch (error) {
        if (seq !== activeSeq || controller.signal.aborted || isAbortError(error)) {
          return state;
        }
        publish({ scopeKey, status: 'idle', count: 0, hasMorePages: false });
        return state;
      }
    },
  };
}

export async function fetchFulfillmentSlaRisks(
  warehouseId: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<RiskFetchResult> {
  try {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/warehouse-ops/fulfillment-sla-risks',
      {
        params: { warehouseId, limit: String(limit), includeTargets: 'true' },
        signal,
        silent: true,
      },
    );
    const parsed = parseFulfillmentSlaRiskResponse(data);
    if (parsed.warehouseId !== warehouseId) return { kind: 'error' };
    return { kind: 'ok', data: parsed };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    if (error instanceof ApiError) {
      if (error.status === 404) return { kind: 'endpoint_unavailable' };
      if (error.status === 403) return { kind: 'forbidden' };
    }
    return { kind: 'error' };
  }
}

export async function fetchFulfillmentSlaRiskExplanation(
  warehouseId: string,
  fulfillmentOrderId: string,
  asOf: string,
  locale: FulfillmentSlaRiskExplanationLocale,
  signal?: AbortSignal,
  options?: { readonly regenerate?: boolean },
): Promise<ExplanationFetchResult> {
  try {
    const body = options?.regenerate ? { asOf, locale, regenerate: true } : { asOf, locale };
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/warehouse-ops/fulfillment-sla-risks/${encodeURIComponent(fulfillmentOrderId)}/explanation`,
      body,
      {
        params: { warehouseId },
        signal,
        silent: true,
      },
    );
    const parsed = parseFulfillmentSlaRiskExplanationResponse(data);
    if (
      parsed.warehouseId !== warehouseId ||
      parsed.fulfillmentOrderId !== fulfillmentOrderId ||
      Date.parse(parsed.asOf) !== Date.parse(asOf)
    ) {
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', data: parsed };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    if (error instanceof ApiError) {
      if (error.status === 403) return { kind: 'forbidden' };
      // Medium #3: Only hide the parcel when backend explicitly reports SLA_RISK.PARCEL_UNAVAILABLE;
      // treat generic 404 (e.g. undeployed explanation route) as unavailable without hiding valid rows.
      if (error.status === 404) {
        return error.code === 'SLA_RISK.PARCEL_UNAVAILABLE'
          ? { kind: 'parcel_unavailable' }
          : { kind: 'unavailable' };
      }
      if (error.status === 409) return { kind: 'conflict' };
    }
    return { kind: 'unavailable' };
  }
}

/**
 * Coordinates warehouse/session-scoped fetches without leaking stale rows across switches,
 * regressing to older asOf snapshots, or preserving rows after HTTP 403 / TTL expiry.
 * Supports `preserveOnError` for batch-of-10 load-more and foreground auto-refresh (UI2, UI4).
 */
export function createScopedRiskController(
  loader: (
    warehouseId: string,
    limit: number,
    signal: AbortSignal,
  ) => Promise<RiskFetchResult> = fetchFulfillmentSlaRisks,
  onChange?: (snapshot: ScopedRiskSnapshot) => void,
  now: () => number = () => Date.now(),
) {
  let state: ScopedRiskSnapshot = {
    scopeKey: '',
    loading: false,
    loadMoreLoading: false,
    loadMoreError: false,
    loadMoreSucceeded: false,
    result: null,
  };
  let activeController: AbortController | null = null;
  let activeSeq = 0;

  const publish = (next: ScopedRiskSnapshot) => {
    state = next;
    onChange?.(next);
  };

  return {
    getState: () => state,
    cancel: () => {
      activeSeq += 1;
      activeController?.abort();
      activeController = null;
    },
    clearForbidden: (scopeKey: string) => {
      activeSeq += 1;
      activeController?.abort();
      activeController = null;
      publish({
        scopeKey,
        loading: false,
        loadMoreLoading: false,
        loadMoreError: false,
        loadMoreSucceeded: false,
        result: { kind: 'forbidden' },
      });
    },
    async load(
      scopeKey: string,
      warehouseId: string,
      limit = 20,
      options?: { readonly isLoadMore?: boolean; readonly preserveOnError?: boolean },
    ): Promise<ScopedRiskSnapshot> {
      activeSeq += 1;
      const seq = activeSeq;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      const isLoadMore = Boolean(options?.isLoadMore);
      const preserveOnError = Boolean(options?.preserveOnError || isLoadMore);
      const scopeChanged = state.scopeKey !== scopeKey;
      const existingOk = !scopeChanged && state.result?.kind === 'ok' ? state.result.data : null;
      const keepExisting =
        existingOk !== null &&
        existingOk.state === 'READY' &&
        !isRiskSnapshotExpired(existingOk.validUntil, now());

      publish({
        scopeKey,
        loading: !isLoadMore,
        loadMoreLoading: isLoadMore,
        loadMoreError: false,
        loadMoreSucceeded: false,
        result: scopeChanged ? null : keepExisting ? state.result : null,
      });

      try {
        const result = await loader(warehouseId, limit, controller.signal);
        if (seq !== activeSeq || controller.signal.aborted) {
          return { ...state, loadMoreSucceeded: false };
        }

        // Always fail closed on 403 / 404 even when preserveOnError is true.
        if (result.kind === 'forbidden' || result.kind === 'endpoint_unavailable') {
          publish({
            scopeKey,
            loading: false,
            loadMoreLoading: false,
            loadMoreError: false,
            loadMoreSucceeded: false,
            result,
          });
          return state;
        }

        // Preserve still-valid READY rows when load-more or background refresh encounters a transient error (UI4).
        if (
          result.kind === 'error' &&
          preserveOnError &&
          keepExisting &&
          existingOk &&
          !isRiskSnapshotExpired(existingOk.validUntil, now())
        ) {
          publish({
            scopeKey,
            loading: false,
            loadMoreLoading: false,
            loadMoreError: isLoadMore,
            loadMoreSucceeded: false,
            result: { kind: 'ok', data: existingOk },
          });
          return state;
        }

        // Ignore out-of-order response with an older asOf than an already-accepted newer snapshot on the same scope.
        if (
          !scopeChanged &&
          result.kind === 'ok' &&
          existingOk &&
          existingOk.asOf &&
          result.data.asOf &&
          Date.parse(result.data.asOf) < Date.parse(existingOk.asOf) &&
          !isRiskSnapshotExpired(existingOk.validUntil, now())
        ) {
          publish({
            scopeKey,
            loading: false,
            loadMoreLoading: false,
            loadMoreError: false,
            loadMoreSucceeded: false,
            result: { kind: 'ok', data: existingOk },
          });
          return state;
        }

        publish({
          scopeKey,
          loading: false,
          loadMoreLoading: false,
          loadMoreError: false,
          loadMoreSucceeded: isLoadMore && result.kind === 'ok',
          result,
        });
        return state;
      } catch (error) {
        if (seq !== activeSeq || controller.signal.aborted || isAbortError(error)) {
          return { ...state, loadMoreSucceeded: false };
        }
        if (
          preserveOnError &&
          keepExisting &&
          existingOk &&
          !isRiskSnapshotExpired(existingOk.validUntil, now())
        ) {
          publish({
            scopeKey,
            loading: false,
            loadMoreLoading: false,
            loadMoreError: isLoadMore,
            loadMoreSucceeded: false,
            result: { kind: 'ok', data: existingOk },
          });
          return state;
        }
        publish({
          scopeKey,
          loading: false,
          loadMoreLoading: false,
          loadMoreError: false,
          loadMoreSucceeded: false,
          result: { kind: 'error' },
        });
        return state;
      }
    },
  };
}

/**
 * Coordinates per-parcel explanation requests keyed strictly by session/warehouse/snapshot/parcel UUID.
 * Aborts & clears immediately on warehouse switch, auth change, 403, or parcel expiry during load.
 */
export function createScopedExplanationController(
  fetcher: (
    warehouseId: string,
    fulfillmentOrderId: string,
    asOf: string,
    locale: FulfillmentSlaRiskExplanationLocale,
    signal: AbortSignal,
    options?: { readonly regenerate?: boolean },
  ) => Promise<ExplanationFetchResult> = fetchFulfillmentSlaRiskExplanation,
  callbacks?: {
    readonly onChange?: (entries: Readonly<Record<string, ScopedExplanationEntry>>) => void;
    readonly onConflict?: () => void;
    readonly onForbidden?: () => void;
    readonly onParcelUnavailable?: (fulfillmentOrderId: string) => void;
  },
  now: () => number = () => Date.now(),
) {
  let activeScopePrefix = '';
  let entries: Record<string, ScopedExplanationEntry> = {};
  const controllers = new Map<string, AbortController>();

  const emit = () => {
    callbacks?.onChange?.({ ...entries });
  };

  const reset = (nextScopePrefix = '') => {
    activeScopePrefix = nextScopePrefix;
    for (const ctrl of controllers.values()) {
      ctrl.abort();
    }
    controllers.clear();
    entries = {};
    emit();
  };

  const evictExpired = (nowMs: number = now()) => {
    let changed = false;
    for (const [key, entry] of Object.entries(entries)) {
      if (entry.expiresAtMs <= nowMs) {
        controllers.get(key)?.abort();
        controllers.delete(key);
        delete entries[key];
        changed = true;
      }
    }
    if (changed) emit();
  };

  /**
   * Medium #1: Evicts cached POST entries whose GET target/evidence changed within the same asOf
   * (e.g. a shortage was replaced on a refresh before the next worker tick) so old POST cache
   * never overrides a newer verified GET target.
   */
  const reconcileItems = (
    scopePrefix: string,
    signaturesByParcelId: Readonly<Record<string, string>>,
  ) => {
    if (!scopePrefix || activeScopePrefix !== scopePrefix) return;
    let changed = false;
    for (const [key, entry] of Object.entries(entries)) {
      const prefix = `${scopePrefix}:`;
      if (!key.startsWith(prefix)) continue;
      const parcelId = key.slice(prefix.length);
      const nextSig = signaturesByParcelId[parcelId];
      if (
        nextSig === undefined ||
        (entry.targetSignature !== undefined && entry.targetSignature !== nextSig)
      ) {
        controllers.get(key)?.abort();
        controllers.delete(key);
        delete entries[key];
        changed = true;
      }
    }
    if (changed) emit();
  };

  return {
    getEntries: () => ({ ...entries }),
    reset,
    evictExpired,
    reconcileItems,
    async request(input: {
      readonly scopePrefix: string;
      readonly warehouseId: string;
      readonly fulfillmentOrderId: string;
      readonly asOf: string;
      readonly expiresAtMs: number;
      readonly locale: FulfillmentSlaRiskExplanationLocale;
      readonly targetSignature?: string;
      readonly forceRefresh?: boolean;
    }): Promise<ScopedExplanationEntry | null> {
      if (input.expiresAtMs <= now()) {
        evictExpired(now());
        return null;
      }
      if (activeScopePrefix !== input.scopePrefix) {
        reset(input.scopePrefix);
      }
      const entryKey = `${input.scopePrefix}:${input.fulfillmentOrderId}`;
      const existing = entries[entryKey];
      const signatureMatches =
        existing !== undefined &&
        (input.targetSignature === undefined || existing.targetSignature === input.targetSignature);
      const forceRefresh = Boolean(input.forceRefresh);
      // Cache verified GEMINI selections within the snapshot/signature scope,
      // while allowing explicit re-open (`Thu gọn` -> `Vì sao?`) to retry transient TEMPLATE fallbacks
      // and explicit `forceRefresh` ("Diễn đạt lại") to request a fresh grounded wording from Gemini.
      if (
        existing &&
        signatureMatches &&
        (existing.loading || (!forceRefresh && existing.data?.source === 'GEMINI'))
      ) {
        return existing;
      }
      const preservedData =
        existing &&
        signatureMatches &&
        (existing.data?.source === 'TEMPLATE' ||
          (forceRefresh && existing.data?.source === 'GEMINI'))
          ? existing.data
          : null;
      if (existing && !signatureMatches) {
        controllers.get(entryKey)?.abort();
        controllers.delete(entryKey);
        delete entries[entryKey];
      }

      const controller = new AbortController();
      controllers.set(entryKey, controller);
      entries[entryKey] = {
        entryKey,
        loading: true,
        data: preservedData,
        expiresAtMs: input.expiresAtMs,
        targetSignature: input.targetSignature,
      };
      emit();

      try {
        const result = await fetcher(
          input.warehouseId,
          input.fulfillmentOrderId,
          input.asOf,
          input.locale,
          controller.signal,
          forceRefresh ? { regenerate: true } : undefined,
        );
        if (controller.signal.aborted || activeScopePrefix !== input.scopePrefix) {
          return null;
        }
        controllers.delete(entryKey);

        if (result.kind === 'forbidden') {
          reset('');
          callbacks?.onForbidden?.();
          return null;
        }
        if (result.kind === 'conflict') {
          delete entries[entryKey];
          emit();
          callbacks?.onConflict?.();
          return null;
        }
        if (result.kind === 'parcel_unavailable') {
          delete entries[entryKey];
          emit();
          callbacks?.onParcelUnavailable?.(input.fulfillmentOrderId);
          return null;
        }
        if (input.expiresAtMs <= now()) {
          delete entries[entryKey];
          emit();
          return null;
        }
        if (result.kind === 'ok') {
          const updated: ScopedExplanationEntry = {
            entryKey,
            loading: false,
            data: result.data,
            expiresAtMs: input.expiresAtMs,
            targetSignature: input.targetSignature,
          };
          entries[entryKey] = updated;
          emit();
          return updated;
        }
        if (forceRefresh && preservedData) {
          const restored: ScopedExplanationEntry = {
            entryKey,
            loading: false,
            data: preservedData,
            expiresAtMs: input.expiresAtMs,
            targetSignature: input.targetSignature,
          };
          entries[entryKey] = restored;
          emit();
          return restored;
        }
        delete entries[entryKey];
        emit();
        return null;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return null;
        }
        controllers.delete(entryKey);
        if (forceRefresh && preservedData && input.expiresAtMs > now()) {
          const restored: ScopedExplanationEntry = {
            entryKey,
            loading: false,
            data: preservedData,
            expiresAtMs: input.expiresAtMs,
            targetSignature: input.targetSignature,
          };
          entries[entryKey] = restored;
          emit();
          return restored;
        }
        delete entries[entryKey];
        emit();
        return null;
      }
    },
  };
}
