import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  webhookEndpointSchema,
  webhookTestResultSchema,
} from '../schemas/webhook.schemas';
import type {
  CreateWebhookPayload,
  UpdateWebhookPayload,
  WebhookEndpoint,
  WebhookTestResult,
} from '../types/webhook.types';

export const webhookApi = {
  async list(includeInactive = true): Promise<WebhookEndpoint[]> {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/webhooks', {
      params: { includeInactive: String(includeInactive) },
      silent: true,
    });
    return z.array(webhookEndpointSchema).parse(data);
  },

  async get(id: string): Promise<WebhookEndpoint> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/webhooks/${encodeURIComponent(id)}`,
    );
    return webhookEndpointSchema.parse(data);
  },

  async create(payload: CreateWebhookPayload): Promise<WebhookEndpoint> {
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/webhooks', payload);
    return webhookEndpointSchema.parse(data);
  },

  async update(id: string, payload: UpdateWebhookPayload): Promise<WebhookEndpoint> {
    const { data } = await apiClient.put<ApiResponse<unknown>>(
      `/v1/webhooks/${encodeURIComponent(id)}`,
      payload,
    );
    return webhookEndpointSchema.parse(data);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<ApiResponse<null>>(`/v1/webhooks/${encodeURIComponent(id)}`);
  },

  async testPing(id: string): Promise<WebhookTestResult> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/webhooks/${encodeURIComponent(id)}/test`,
      {},
      { silent: true },
    );
    return webhookTestResultSchema.parse(data);
  },
};
