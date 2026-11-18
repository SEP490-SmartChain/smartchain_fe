import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const root = '/v1/platform/rate-intelligence';

const namedSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const objectiveSchema = z.enum(['CHEAPEST', 'FASTEST', 'BALANCED']);
export const RATE_PROPOSAL_OBJECTIVES = objectiveSchema.options;
const summarySchema = z
  .object({
    groups: z.number().int(),
    covered: z.number().int(),
    uncovered: z.number().int(),
    rules: z.number().int(),
    servicesCompared: z.number().int(),
    notes: z.array(z.string()),
    serviceNames: z.record(z.string(), z.string()),
    /** Day limit the run applied; absent on proposals created before it was recorded. */
    maxDeliveryDays: z.number().int().positive().nullable().optional(),
  })
  .passthrough();
const alertSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  carrier: namedSchema.nullable(),
  service: namedSchema.nullable(),
  oldPriceVnd: z.number(),
  newPriceVnd: z.number(),
  deltaPct: z.number(),
  thresholdPct: z.number(),
  status: z.enum(['OPEN', 'PROPOSED', 'DISMISSED']),
  proposalId: z.string().uuid().nullable(),
  isSample: z.boolean(),
  createdAt: z.string(),
});
const proposalListItemSchema = z.object({
  id: z.string().uuid(),
  objective: objectiveSchema,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  scenarioCount: z.number().int(),
  expectedSavingPct: z.number().nullable(),
  summary: summarySchema,
  isSample: z.boolean(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
});
const proposedRuleSchema = z.object({
  name: z.string(),
  priority: z.number().int(),
  action: z.object({
    carrierServiceId: z.string().uuid(),
    fallbackServiceIds: z.array(z.string().uuid()),
  }),
  scenarioIds: z.array(z.string()),
  coverage: z
    .object({
      provinceCodes: z.array(z.string()),
      weightMinExclusiveG: z.number().int(),
      weightMaxG: z.number().int(),
      isCod: z.boolean(),
    })
    .optional(),
});
const proposalDetailSchema = proposalListItemSchema.extend({
  proposedRules: z.array(
    proposedRuleSchema.extend({
      warehouseId: z.string().uuid().nullable().optional(),
    }),
  ),
  publishedRuleIds: z.array(z.string()),
  serviceIdentities: z
    .record(z.string(), z.object({ carrierName: z.string(), serviceName: z.string() }))
    .default({}),
});

export type RatePriceAlert = z.infer<typeof alertSchema>;
export type RateProposalListItem = z.infer<typeof proposalListItemSchema>;
export type RateProposalDetail = z.infer<typeof proposalDetailSchema>;
export type RateProposalObjective = z.infer<typeof objectiveSchema>;

export const rateProposalApi = {
  async alerts(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/alerts`, {
      params: { limit: '50' },
      signal,
      silent: true,
    });
    return z.array(alertSchema).parse(response.data);
  },
  async list(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/proposals`, {
      params: { limit: '30' },
      signal,
      silent: true,
    });
    return z.array(proposalListItemSchema).parse(response.data);
  },
  async get(id: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/proposals/${id}`, {
      signal,
      silent: true,
    });
    return proposalDetailSchema.parse(response.data);
  },
  async generate(objective: RateProposalObjective, maxDeliveryDays?: number) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${root}/proposals`,
      { objective, ...(objective === 'CHEAPEST' && maxDeliveryDays ? { maxDeliveryDays } : {}) },
      { silent: true },
    );
    return proposalDetailSchema.parse(response.data);
  },
  async approve(id: string, note: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${root}/proposals/${id}/approve`,
      { note },
      { silent: true },
    );
    return proposalDetailSchema.parse(response.data);
  },
  async reject(id: string, note: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${root}/proposals/${id}/reject`,
      { note },
      { silent: true },
    );
    return proposalDetailSchema.parse(response.data);
  },
  async remove(id: string) {
    await apiClient.delete<ApiResponse<unknown>>(`${root}/proposals/${id}`, { silent: true });
  },
};
