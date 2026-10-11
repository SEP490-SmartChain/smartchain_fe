import { z } from 'zod';

import { apiClient, type ApiResponse, type ApiPaginationMeta } from '@/services/apiClient';

import {
  definitionSchema,
  paginationSchema,
  ruleSchema,
  targetSchema,
  versionSchema,
} from '../schemas/ruleSchema';

import type {
  RuleDefinition,
  RuleKind,
  RuleRecord,
  RuleTarget,
  RuleVersion,
  TargetKind,
} from '../types/rule.types';

const id = (value: string) => z.string().uuid().parse(value);
const version = (value: number) => z.number().int().min(1).max(2147483646).parse(value);
const reason = (value: string) => z.string().trim().min(3).max(500).parse(value);
export interface RulePage<T> {
  items: T[];
  pagination: ApiPaginationMeta;
}
export const ruleApi = {
  async list(kind: RuleKind, cursor?: string, signal?: AbortSignal): Promise<RulePage<RuleRecord>> {
    const params: Record<string, string> = {
      kind: z.enum(['ALLOCATION', 'CARRIER']).parse(kind),
      limit: '100',
    };
    if (cursor) params.cursor = id(cursor);
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/rules', {
      params,
      signal,
      silent: true,
    });
    return {
      items: z.array(ruleSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async get(ruleId: string): Promise<RuleRecord> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`/v1/rules/${id(ruleId)}`, {
      silent: true,
    });
    return ruleSchema.parse(data);
  },
  async targets(
    kind: TargetKind,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<RulePage<RuleTarget>> {
    const params: Record<string, string> = {
      kind: z.enum(['WAREHOUSE', 'CARRIER_SERVICE']).parse(kind),
      limit: '100',
    };
    if (cursor) params.cursor = id(cursor);
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>('/v1/rules/targets', {
      params,
      signal,
      silent: true,
    });
    return {
      items: z.array(targetSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async history(
    ruleId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<RulePage<RuleVersion>> {
    const params: Record<string, string> = { limit: '20' };
    if (cursor) params.cursor = id(cursor);
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/rules/${id(ruleId)}/versions`,
      { params, signal, silent: true },
    );
    return {
      items: z.array(versionSchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },
  async create(
    operationKey: string,
    definition: RuleDefinition,
    explanation: string,
  ): Promise<RuleRecord> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/rules',
      {
        operationKey: id(operationKey),
        definition: definitionSchema.parse(definition),
        reason: reason(explanation),
      },
      { silent: true },
    );
    return ruleSchema.parse(data);
  },
  async edit(
    rule: RuleRecord,
    definition: RuleDefinition,
    explanation: string,
  ): Promise<RuleRecord> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/rules/${id(rule.id)}`,
      {
        expectedVersion: version(rule.version),
        definition: definitionSchema.parse(definition),
        reason: reason(explanation),
      },
      { silent: true },
    );
    return ruleSchema.parse(data);
  },
  async command(
    rule: RuleRecord,
    operation: 'publish' | 'disable' | 'rollback' | 'delete',
    explanation: string,
    targetVersion?: number,
  ): Promise<RuleRecord> {
    const body = {
      expectedVersion: version(rule.version),
      reason: reason(explanation),
      ...(operation === 'rollback' ? { targetVersion: version(targetVersion ?? 0) } : {}),
    };
    const path = `/v1/rules/${id(rule.id)}`;
    const { data } =
      operation === 'delete'
        ? await apiClient.delete<ApiResponse<unknown>>(path, {
            body: JSON.stringify(body),
            silent: true,
          })
        : await apiClient.post<ApiResponse<unknown>>(`${path}/${operation}`, body, {
            silent: true,
          });
    return ruleSchema.parse(data);
  },
  async reorder(
    entries: { id: string; expectedVersion: number; priority: number }[],
    explanation: string,
  ): Promise<RuleRecord[]> {
    const checked = z
      .array(
        z
          .object({
            id: z.string().uuid(),
            expectedVersion: z.number().int().min(1).max(2147483646),
            priority: z.number().int().min(0).max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .parse(entries);
    if (new Set(checked.map((e) => e.id)).size !== checked.length) {
      throw new Error('Invalid duplicate reorder entry');
    }
    const { data } = await apiClient.put<ApiResponse<unknown>>(
      '/v1/rules/priority',
      { entries: checked, reason: reason(explanation) },
      { silent: true },
    );
    return z.array(ruleSchema).parse(data);
  },
};
