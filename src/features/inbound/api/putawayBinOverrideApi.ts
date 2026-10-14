import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import type { PutawayTask } from './putawayApi';
const uuid = z.string().uuid();
const version = z.number().int().min(1).max(2147483646);
const reason = z
  .string()
  .min(3)
  .max(500)
  .refine((v) => v === v.trim());
const code = z.string().min(1).max(128);
export const putawayBinOverrideSchema = z
  .object({
    operationKey: uuid,
    expectedVersion: version,
    toBinId: uuid,
    reason,
  })
  .strict();
export type PutawayBinOverrideInput = z.infer<typeof putawayBinOverrideSchema>;
const resultSchema = z
  .object({
    id: uuid,
    taskId: uuid,
    version: z.number().int().min(2).max(2147483647),
    fromBinId: uuid,
    toBinId: uuid,
    fromBinCode: code,
    toBinCode: code,
    reason,
    actorId: uuid,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((v) => v.fromBinId !== v.toBinId);
export type PutawayBinOverrideResult = z.infer<typeof resultSchema>;
const optionsSchema = z
  .object({
    taskId: uuid,
    version,
    items: z.array(z.object({ id: uuid, code }).strict()).max(100),
    moreBins: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.id)).size === v.items.length &&
      (!v.moreBins || v.items.length === 100),
  );
const historySchema = z
  .array(resultSchema)
  .max(100)
  .refine(
    (v) =>
      new Set(v.map((i) => i.id)).size === v.length &&
      v.every((i, n) => n === 0 || v[n - 1]!.version > i.version),
  );
const path = (w: string, t: string) =>
  `/v1/warehouses/${encodeURIComponent(w)}/putaway/${encodeURIComponent(t)}`;
export const putawayBinOverrideApi = {
  async options(w: string, task: PutawayTask, search = '', signal?: AbortSignal) {
    if (search.length > 64) throw new Error('Use a bounded bin search');
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(w, task.id)}/bin-options?search=${encodeURIComponent(search)}`,
      { signal, silent: true },
    );
    const result = optionsSchema.parse(data);
    if (
      result.taskId !== task.id ||
      result.version !== task.version ||
      result.items.some((i) => i.code === task.toBinCode)
    ) {
      throw new Error('Reload the current task before choosing another bin');
    }
    return result;
  },
  async history(w: string, t: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${path(w, t)}/bin-overrides`, {
      signal,
      silent: true,
    });
    const rows = historySchema.parse(data);
    if (rows.some((i) => i.taskId !== t)) throw new Error('History is outside this task');
    return rows;
  },
  async overrideBin(
    w: string,
    task: PutawayTask,
    actorId: string,
    input: PutawayBinOverrideInput,
    signal?: AbortSignal,
  ) {
    const command = putawayBinOverrideSchema.parse(input);
    if (command.expectedVersion !== task.version) {
      throw new Error('Reload the current task revision');
    }
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(w, task.id)}/bin-override`,
      command,
      { signal, silent: true },
    );
    const result = resultSchema.parse(data);
    if (
      result.taskId !== task.id ||
      result.version !== command.expectedVersion + 1 ||
      result.toBinId !== command.toBinId ||
      result.fromBinCode !== task.toBinCode ||
      result.reason !== command.reason ||
      result.actorId !== actorId
    ) {
      throw new Error('Bin decision differs from the attempted operation');
    }
    return result;
  },
};
