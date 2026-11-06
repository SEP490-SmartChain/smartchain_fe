import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  shipmentSchema,
  paginationSchema,
  breakerSchema,
  trackingEventSchema,
  cancelResultSchema,
  slaExceptionPageSchema,
} from '../schemas/shipmentSchema';

export const shipmentApi = {
  /** UC-104: SLA breaches of the warehouses the operator may access. */
  async slaExceptions(isOpenOnly: boolean, before: string | null, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/sla-exceptions', {
      params: { openOnly: String(isOpenOnly), limit: '50', ...(before ? { before } : {}) },
      signal,
      silent: true,
    });
    return slaExceptionPageSchema.parse({
      items: response.data,
      pagination: response.meta.pagination,
    });
  },
  async assignSlaException(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/sla-exceptions/${encodeURIComponent(id)}/assign`,
      {},
      { signal, silent: true },
    );
    return z.object({ id: z.string().uuid(), status: z.literal('ASSIGNED') }).parse(data);
  },
  async retryLabelException(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/sla-exceptions/${encodeURIComponent(id)}/retry-label`,
      {},
      { signal, silent: true },
    );
    return z.object({ id: z.string().uuid(), status: z.literal('ASSIGNED') }).parse(data);
  },
  async timeline(id: string, cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/v1/shipments/${encodeURIComponent(id)}/timeline`,
      {
        params: { limit: '50', ...(cursor ? { cursor } : {}) },
        signal,
        silent: true,
      },
    );
    return {
      items: z.array(trackingEventSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta.pagination),
    };
  },
  async list(cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/shipments', {
      params: { limit: '20', ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return {
      items: z.array(shipmentSchema).parse(response.data),
      pagination: paginationSchema.parse(response.meta.pagination),
    };
  },
  async detail(id: string, signal?: AbortSignal) {
    return shipmentSchema.parse(
      (
        await apiClient.get<ApiResponse<unknown>>(`/v1/shipments/${encodeURIComponent(id)}`, {
          signal,
          silent: true,
        })
      ).data,
    );
  },
  label(id: string, signal?: AbortSignal) {
    return apiClient.downloadPdf(`/v1/shipments/${encodeURIComponent(id)}/label`, {
      signal,
      silent: true,
    });
  },
  async cancel(id: string, signal?: AbortSignal) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/v1/shipments/${encodeURIComponent(id)}/cancel`,
      {},
      { signal, silent: true },
    );
    return z.object({ result: cancelResultSchema }).parse(response.data).result;
  },
  async breakers(signal?: AbortSignal) {
    return z.array(breakerSchema).parse(
      (
        await apiClient.get<ApiResponse<unknown>>('/v1/platform/integrations/carrier-breakers', {
          signal,
          silent: true,
        })
      ).data,
    );
  },
};
