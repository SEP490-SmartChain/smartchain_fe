import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const webhookStatus = z.enum(['PENDING', 'DELIVERED', 'FAILED', 'EXHAUSTED']);
export const webhookFilters = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    status: z.union([webhookStatus, z.literal('')]),
  })
  .refine((v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) < 92 * 86400000);
export type WebhookFilters = z.infer<typeof webhookFilters>;
const row = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    endpointId: z.uuid(),
    status: webhookStatus,
    attempts: z.number().int().nonnegative(),
    responseCode: z.number().int().nullable(),
    nextAttemptAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type WebhookReportRow = z.infer<typeof row>;
const count = z.string().regex(/^(0|[1-9]\d*)$/);
const summary = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    total: count,
    counts: z
      .object({ PENDING: count, DELIVERED: count, FAILED: count, EXHAUSTED: count })
      .strict(),
  })
  .strict();
const pagination = z
  .object({
    limit: z.number().int().positive().max(100),
    hasNext: z.boolean(),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const webhookReportApi = {
  async read(filters: WebhookFilters, cursor?: string, signal?: AbortSignal) {
    const valid = webhookFilters.parse(filters);
    const params = {
      from: valid.from,
      to: valid.to,
      ...(valid.status ? { status: valid.status } : {}),
      ...(cursor ? { cursor } : {}),
      limit: '50',
    };
    const [totals, page] = await Promise.all([
      apiClient.get<ApiResponse<unknown>>('/v1/reports/webhooks/summary', {
        params: { from: valid.from, to: valid.to },
        signal,
        silent: true,
      }),
      apiClient.get<ApiResponse<unknown>>('/v1/reports/webhooks', { params, signal, silent: true }),
    ]);
    return {
      summary: summary.parse(totals.data),
      items: z.array(row).parse(page.data),
      pagination: pagination.parse(page.meta.pagination),
    };
  },
};
