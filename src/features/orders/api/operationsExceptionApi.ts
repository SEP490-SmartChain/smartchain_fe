import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const status = z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']);
const sourceType = z.enum(['ORDER', 'DISPATCH', 'PICK_WAVE', 'QUEUE', 'OTHER']);
const timestamp = z.string().datetime({ offset: true });
const option = z.object({ id: z.uuid(), name: z.string() }).strict();
const entry = z
  .object({
    id: z.uuid(),
    reference: z.string().max(160),
    sellerName: z.string().max(200).nullable(),
    sourceStatus: z.string().max(64).nullable(),
    warehouseId: z.uuid().nullable(),
    type: sourceType,
    reasonCode: z.string().regex(/^[A-Z0-9_.-]{1,80}$/),
    status,
    version: z.number().int().positive(),
    assignedToPlatformUserId: z.uuid().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
const operation = z
  .object({
    id: z.uuid(),
    operationId: z.uuid(),
    actorId: z.uuid(),
    kind: z.enum(['NOTE', 'ASSIGN', 'RESOLVE', 'RETRY', 'CORRECT']),
    note: z.string().max(2000),
    createdAt: timestamp,
  })
  .strict();
const collection = z
  .object({
    status: z.enum(['NOT_READY', 'AVAILABLE', 'UNAVAILABLE', 'PARTIAL']),
    queuesScanned: z.number().int().min(0).max(1000),
    checkedAt: timestamp.nullable(),
    lastSuccessAt: timestamp.nullable(),
  })
  .strict();
const page = z
  .object({
    items: z.array(entry).max(50),
    warehouses: z.array(option).max(1000),
    nextCursor: z.uuid().nullable(),
    collection,
  })
  .strict();
const detail = entry
  .extend({
    operations: z.array(operation).max(50),
    assignees: z.array(option).max(200),
    resolutionRef: z.string().nullable(),
    canRetry: z.boolean(),
    canResolve: z.boolean(),
    canCorrect: z.boolean(),
  })
  .strict();
const result = z
  .object({
    id: z.uuid(),
    operationId: z.uuid(),
    status,
    version: z.number().int().positive(),
    outcome: z.enum(['RECORDED', 'QUEUED']),
  })
  .strict();
export const exceptionFiltersSchema = z.object({
  status: z.enum(['', 'OPEN', 'ASSIGNED', 'RESOLVED']),
  type: z.enum(['', 'ORDER', 'DISPATCH', 'PICK_WAVE', 'QUEUE', 'OTHER']),
  warehouseId: z.union([z.literal(''), z.uuid()]),
});
export const exceptionCommandFormSchema = z.object({
  kind: z.enum(['NOTE', 'ASSIGN', 'RESOLVE', 'RETRY']),
  note: z.string().trim().min(1).max(2000),
  assignedToPlatformUserId: z.union([z.literal(''), z.uuid()]),
});
export type ExceptionFilters = z.infer<typeof exceptionFiltersSchema>;
export type ExceptionPage = z.infer<typeof page>;
export type ExceptionDetail = z.infer<typeof detail>;
export const exceptionCorrectionFormSchema = z.object({
  recipientAddress: z.string().trim().min(5).max(500),
  toProvinceCode: z.string().min(1).max(20),
  toWardCode: z.string().min(1).max(20),
  note: z.string().trim().min(1).max(2000),
});
const correctionInput = exceptionCorrectionFormSchema
  .omit({ note: true })
  .extend({ expectedOrderVersion: z.number().int().positive() })
  .strict();
const correctionSource = z
  .object({
    exceptionVersion: z.number().int().positive(),
    orderVersion: z.number().int().positive(),
    recipientAddress: z.string().max(500),
    toProvinceCode: z.string().max(20),
    toWardCode: z.string().max(20),
    locations: z
      .array(
        z
          .object({
            code: z.string().max(20),
            name: z.string().max(200),
            type: z.enum(['PROVINCE', 'WARD']),
            parentCode: z.string().nullable(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type ExceptionCorrectionSource = z.infer<typeof correctionSource>;
export type ExceptionCommand = {
  operationId: string;
  expectedVersion: number;
  kind: 'NOTE' | 'ASSIGN' | 'RESOLVE' | 'RETRY';
  note: string;
  assignedToPlatformUserId?: string | null;
  correction?: z.infer<typeof correctionInput>;
};
export const operationsExceptionApi = {
  async correctionSource(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/operations/exceptions/${z.uuid().parse(id)}/correction`,
      { signal, silent: true },
    );
    return correctionSource.parse(data);
  },
  async list(filters: ExceptionFilters, afterId?: string, signal?: AbortSignal) {
    const input = exceptionFiltersSchema.parse(filters);
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) if (value) params[key] = value;
    if (afterId) params.afterId = z.uuid().parse(afterId);
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/operations/exceptions', {
      params,
      signal,
      silent: true,
    });
    return page.parse(data);
  },
  async detail(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/operations/exceptions/${z.uuid().parse(id)}`,
      { signal, silent: true },
    );
    return detail.parse(data);
  },
  async command(id: string, input: ExceptionCommand, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/operations/exceptions/${z.uuid().parse(id)}/${input.correction ? 'correction' : 'operations'}`,
      input.correction
        ? {
            operationId: input.operationId,
            expectedVersion: input.expectedVersion,
            note: input.note,
            ...correctionInput.parse(input.correction),
          }
        : input,
      { signal, silent: true },
    );
    const parsed = result.parse(data);
    if (parsed.id !== id || parsed.operationId !== input.operationId) {
      throw new Error('Exception operation response does not match its request.');
    }
    return parsed;
  },
};
