import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  optionsSchema,
  reportKindSchema,
  reportSchema,
  auditSchema,
  technicalSchema,
  pagination,
  type ReportKind,
  type ReportFilters,
  type ReportOptions,
  type ReportView,
} from '../schemas/reportSchema';
export const reportApi = {
  async options(signal?: AbortSignal): Promise<ReportOptions> {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/reports/options', {
      signal,
      silent: true,
    });
    return optionsSchema.parse(data);
  },
  async read(
    kind: Exclude<ReportKind, 'audit' | 'logs'>,
    filters: ReportFilters,
    signal?: AbortSignal,
  ): Promise<ReportView> {
    reportKindSchema.parse(kind);
    const params: Record<string, string> = {};
    if (kind !== 'health') {
      params.from = filters.from;
      params.to = filters.to;
      if (filters.warehouseId) params.warehouseId = filters.warehouseId;
    }
    const { data } = await apiClient.get<ApiResponse<unknown>>(`/v1/reports/${kind}`, {
      params,
      signal,
      silent: true,
    });
    return reportSchema.refine((report) => report.kind === kind).parse(data);
  },
  async logs(
    kind: 'audit' | 'logs',
    filters: ReportFilters,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const params: Record<string, string> = { from: filters.from, to: filters.to, limit: '50' };
    if (cursor) params.cursor = cursor;
    if (filters.actorId) params.actorId = filters.actorId;
    if (kind === 'logs') {
      if (filters.warehouseId) params.warehouseId = filters.warehouseId;
      if (filters.kind) params.kind = filters.kind;
    } else {
      if (filters.action) params.action = filters.action;
      if (filters.entityId) params.entityId = filters.entityId;
    }
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(`/v1/reports/${kind}`, {
      params,
      signal,
      silent: true,
    });
    return {
      items:
        kind === 'audit' ? z.array(auditSchema).parse(data) : z.array(technicalSchema).parse(data),
      pagination: pagination.parse(meta.pagination),
    };
  },
};
