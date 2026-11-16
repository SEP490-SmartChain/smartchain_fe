import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const issueSchema = z.object({
  row: z.number().int(),
  field: z.string(),
  message: z.string(),
});
const snapshotSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  serviceId: z.string().uuid(),
  originZone: z.string(),
  destZone: z.string(),
  receiverArea: z.enum(['WARD', 'COMMUNE']),
  weightMinG: z.number().int(),
  weightMaxG: z.number().int(),
  baseWeightG: z.number().int(),
  basePriceVnd: z.union([z.string(), z.number()]),
  stepWeightG: z.number().int(),
  stepPriceVnd: z.union([z.string(), z.number()]),
  vatIncluded: z.boolean(),
  effectiveFrom: z.string(),
  recordedAt: z.string(),
  version: z.number().int().positive(),
  source: z.enum(['SANDBOX_API', 'PRODUCTION_API', 'CONTRACT_IMPORT']),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).nullable(),
  isSample: z.boolean(),
  carrier: z.object({ code: z.string(), name: z.string() }),
  service: z.object({ code: z.string(), name: z.string() }),
});
const jobSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(['SANDBOX_API', 'PRODUCTION_API', 'CONTRACT_IMPORT']),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).nullable(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED']),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  recordCount: z.number().int(),
  errorCode: z.string().nullable(),
  triggeredBy: z.enum(['MANUAL', 'SCHEDULE']),
  isSample: z.boolean(),
  carrier: z.object({ code: z.string(), name: z.string() }),
});
const scenarioSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  serviceId: z.string().uuid(),
  name: z.string(),
  originZone: z.string(),
  destZone: z.string(),
  receiverArea: z.enum(['WARD', 'COMMUNE']),
  originDivisionCode: z.string(),
  destinationDivisionCode: z.string(),
  weightG: z.number().int(),
  lengthCm: z.number().int(),
  widthCm: z.number().int(),
  heightCm: z.number().int(),
  declaredValueVnd: z.union([z.string(), z.number()]),
  codValueVnd: z.union([z.string(), z.number()]),
  isActive: z.boolean(),
  isSample: z.boolean(),
  sourceKind: z.enum(['AUTO', 'MANUAL']),
  sampleOrderCount: z.number().int(),
  originWarehouseId: z.string().uuid().nullable(),
  isCod: z.boolean(),
  updatedAt: z.string(),
  carrier: z.object({ code: z.string(), name: z.string() }),
  service: z.object({ code: z.string(), name: z.string() }),
  originWarehouseName: z.string().nullable().default(null),
  destinationProvinceName: z.string().nullable().default(null),
});
const previewSchema = z.object({
  carrierCode: z.string(),
  source: z.literal('CONTRACT_IMPORT'),
  isSample: z.boolean(),
  rowCount: z.number().int(),
  validCount: z.number().int(),
  issues: z.array(issueSchema),
  rows: z.array(
    z.object({
      serviceCode: z.string(),
      originZone: z.string(),
      destZone: z.string(),
      receiverArea: z.enum(['WARD', 'COMMUNE']),
      weightMinG: z.number().int(),
      weightMaxG: z.number().int(),
      baseWeightG: z.number().int(),
      basePriceVnd: z.string(),
      stepWeightG: z.number().int(),
      stepPriceVnd: z.string(),
      vatIncluded: z.boolean(),
      effectiveFrom: z.string().datetime({ offset: true }),
    }),
  ),
});

export type RateSnapshot = z.infer<typeof snapshotSchema>;
export type RateCollectionJob = z.infer<typeof jobSchema>;
export type RateImportPreview = z.infer<typeof previewSchema>;
export type RateScenario = z.infer<typeof scenarioSchema>;

const root = '/v1/platform/rate-intelligence';

function form(file: File, carrierCode: string, isSample: boolean) {
  const body = new FormData();
  body.set('file', file);
  body.set('carrierCode', carrierCode);
  body.set('isSample', String(isSample));
  return body;
}

export const rateIntelligenceApi = {
  async scenarios(carrierId?: string) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/scenarios`, {
      params: carrierId ? { carrierId } : undefined,
      silent: true,
    });
    return z.array(scenarioSchema).parse(response.data);
  },
  async createScenario(input: {
    serviceId: string;
    name: string;
    originZone: string;
    destZone: string;
    receiverArea: 'WARD';
    originDivisionCode: string;
    destinationDivisionCode: string;
    weightG: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    declaredValueVnd: number;
    codValueVnd: number;
  }) {
    const response = await apiClient.post<ApiResponse<unknown>>(`${root}/scenarios`, input, {
      silent: true,
    });
    return z.object({ id: z.string().uuid() }).passthrough().parse(response.data);
  },
  async setScenarioActive(id: string, isActive: boolean, expectedUpdatedAt: string) {
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `${root}/scenarios/${id}/status`,
      { isActive, expectedUpdatedAt },
      { silent: true },
    );
    return z
      .object({ id: z.string().uuid(), isActive: z.boolean(), updatedAt: z.string() })
      .passthrough()
      .parse(response.data);
  },
  async collect(carrierAccountId: string, idempotencyKey: string) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${root}/collect`,
      { carrierAccountId },
      {
        headers: { 'Idempotency-Key': idempotencyKey },
        silent: true,
      },
    );
    return z
      .object({ id: z.string().uuid(), queued: z.boolean(), replayed: z.boolean() })
      .parse(response.data);
  },
  async jobs(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/jobs`, {
      params: { limit: '100' },
      signal,
      silent: true,
    });
    return z.array(jobSchema).parse(response.data);
  },
  async snapshots(carrierId?: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(`${root}/snapshots`, {
      params: { limit: '500', ...(carrierId ? { carrierId } : {}) },
      signal,
      silent: true,
    });
    return z.array(snapshotSchema).parse(response.data);
  },
  async preview(file: File, carrierCode: string, isSample: boolean) {
    const response = await apiClient.uploadForm<ApiResponse<unknown>>(
      `${root}/imports/preview`,
      form(file, carrierCode, isSample),
      { silent: true },
    );
    return previewSchema.parse(response.data);
  },
  async import(file: File, carrierCode: string, isSample: boolean, idempotencyKey: string) {
    const response = await apiClient.uploadForm<ApiResponse<unknown>>(
      `${root}/imports`,
      form(file, carrierCode, isSample),
      { headers: { 'Idempotency-Key': idempotencyKey }, silent: true },
    );
    return z
      .object({
        id: z.string().uuid(),
        recordCount: z.number().int(),
        startedAt: z.string(),
        replayed: z.boolean(),
      })
      .parse(response.data);
  },
};
