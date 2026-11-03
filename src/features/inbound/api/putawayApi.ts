import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';
const version = z.number().int().positive().max(2147483646);
const scan = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => v.trim() === v);
export const putawayAssignmentSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: version,
    assigneeId: z.string().uuid(),
  })
  .strict();
export const putawayConfirmationSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: version,
    fromBinScan: scan,
    toBinScan: scan,
    skuScan: scan,
    lotScan: scan,
    qty: version,
  })
  .strict();
export type PutawayAssignment = z.infer<typeof putawayAssignmentSchema>;
export type PutawayConfirmation = z.infer<typeof putawayConfirmationSchema>;
export const putawayTaskSchema = z
  .object({
    id: z.string().uuid(),
    version,
    status: z.enum(['OPEN', 'ASSIGNED', 'COMPLETED', 'CANCELLED']),
    qty: version,
    confirmedQty: z.number().int().nonnegative(),
    assigneeId: z.string().uuid().nullable(),
    fromBinCode: scan,
    toBinCode: scan,
    sku: scan,
    productName: z.string().min(1),
    lotCode: scan,
  })
  .strict()
  .refine(
    (v) =>
      v.confirmedQty <= v.qty &&
      (v.status !== 'COMPLETED' || v.confirmedQty === v.qty) &&
      (v.status !== 'ASSIGNED' || v.assigneeId !== null) &&
      (v.status !== 'OPEN' || (v.assigneeId === null && v.confirmedQty === 0)),
  );
export type PutawayTask = z.infer<typeof putawayTaskSchema>;
const waitingItemSchema = z
  .object({
    receivingRecordId: z.string().uuid(),
    asnCode: z.string().min(1).max(128),
    sku: scan,
    productName: z.string().min(1).max(255),
    lotCode: scan,
    quantity: version,
    weightG: z.string().regex(/^[1-9]\d{0,24}$/),
    volumeM3: z.string().regex(/^(?:0|[1-9]\d{0,24})(?:\.\d{1,6})?$/),
    fromBinCode: scan.nullable(),
    reason: z.enum([
      'STOCK_REQUIRED',
      'CAPACITY_REQUIRED',
      'PLANNING',
      'QUARANTINED',
      'INELIGIBLE',
      'SOURCE_UNAVAILABLE',
    ]),
  })
  .strict()
  .refine((v) => v.reason === 'INELIGIBLE' || Number(v.volumeM3) > 0);
export type PutawayWaitingItem = z.infer<typeof waitingItemSchema>;
const waitingSchema = z
  .object({
    items: z.array(waitingItemSchema).max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.receivingRecordId)).size === v.items.length &&
      (v.nextCursor === null ||
        (v.items.length === 100 && v.nextCursor === v.items.at(-1)?.receivingRecordId)),
  );
const listSchema = z
  .object({
    items: z.array(putawayTaskSchema).max(100),
    moreTasks: z.boolean(),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.id)).size === v.items.length &&
      (v.moreTasks
        ? v.items.length === 100 && v.nextCursor === v.items.at(-1)?.id
        : v.nextCursor === null),
  );
const resultSchema = z
  .object({
    taskId: z.string().uuid(),
    version,
    status: z.enum(['ASSIGNED', 'COMPLETED']),
    confirmedQty: z.number().int().nonnegative(),
    assigneeId: z.string().uuid(),
  })
  .strict();
const staffSchema = z
  .array(z.object({ id: z.string().uuid(), fullName: z.string().min(1) }).strict())
  .max(500)
  .refine((v) => new Set(v.map((i) => i.id)).size === v.length);
const path = (w: string) => `/v1/warehouses/${encodeURIComponent(w)}/putaway`;
export const putawayApi = {
  async waiting(w: string, cursor: string | null, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w)}/waiting${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal, silent: true },
    );
    return waitingSchema.parse(data);
  },
  async list(w: string, cursor: string | null, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal, silent: true },
    );
    return listSchema.parse(data);
  },
  async staff(w: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${path(w)}/staff`, {
      signal,
      silent: true,
    });
    return staffSchema.parse(data);
  },
  async assign(w: string, task: PutawayTask, input: PutawayAssignment, signal?: AbortSignal) {
    const command = putawayAssignmentSchema.parse(input);
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(w)}/${encodeURIComponent(task.id)}/assignment`,
      command,
      { signal, silent: true },
    );
    const result = resultSchema.parse(data);
    if (
      result.taskId !== task.id ||
      result.version !== command.expectedVersion + 1 ||
      result.status !== 'ASSIGNED' ||
      result.confirmedQty !== 0 ||
      result.assigneeId !== command.assigneeId
    ) {
      throw new Error('Assignment result differs from the attempted task');
    }
    return result;
  },
  async confirm(
    w: string,
    task: PutawayTask,
    actorId: string,
    input: PutawayConfirmation,
    signal?: AbortSignal,
  ) {
    const command = putawayConfirmationSchema.parse(input);
    if (command.qty !== task.qty) throw new Error('Confirm the full assigned task quantity');
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(w)}/${encodeURIComponent(task.id)}/confirmation`,
      command,
      { signal, silent: true },
    );
    const result = resultSchema.parse(data);
    if (
      result.taskId !== task.id ||
      result.version !== command.expectedVersion + 1 ||
      result.status !== 'COMPLETED' ||
      result.confirmedQty !== command.qty ||
      result.assigneeId !== actorId
    ) {
      throw new Error('Physical result differs from the attempted task');
    }
    return result;
  },
};
