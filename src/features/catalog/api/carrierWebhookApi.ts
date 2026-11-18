import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const settingsSchema = z
  .object({
    carrierCode: z.enum(['GHN', 'GHTK', 'VIETTEL_POST']),
    environment: z.enum(['SANDBOX', 'PRODUCTION']),
    publicBaseUrl: z.string().nullable(),
    callbackPath: z.string(),
    callbackUrl: z.string().nullable(),
    enabled: z.boolean(),
    hasToken: z.boolean(),
    source: z.enum(['DATABASE', 'ENVIRONMENT', 'NONE']),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type CarrierWebhookSettings = z.infer<typeof settingsSchema>;
export interface UpdateCarrierWebhook {
  publicBaseUrl: string;
  enabled: boolean;
  expectedVersion: number;
  token?: string;
}
const base = '/v1/platform/carrier-webhooks';
export const carrierWebhookApi = {
  async list(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(base, { signal, silent: true });
    return z.array(settingsSchema).max(3).parse(response.data);
  },
  async update(
    carrier: CarrierWebhookSettings['carrierCode'],
    input: UpdateCarrierWebhook,
    signal?: AbortSignal,
  ) {
    const response = await apiClient.patch<ApiResponse<unknown>>(`${base}/${carrier}`, input, {
      signal,
      silent: true,
    });
    return settingsSchema.parse(response.data);
  },
};
