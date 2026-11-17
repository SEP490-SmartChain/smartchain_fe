import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const forecastFormSchema = z.object({
  productId: z.string().uuid(),
  region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']),
});
export type ForecastForm = z.infer<typeof forecastFormSchema>;
const point = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.number().finite().nonnegative(),
});
const status = z.enum([
  'QUEUED',
  'RUNNING',
  'PREDICTED',
  'DISABLED',
  'INSUFFICIENT_DATA',
  'PROVIDER_UNAVAILABLE',
  'FAILED',
]);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));
const marketSchema = z.object({
  // Older runs predate the field and were always grounded by web search.
  mode: z.enum(['WEB_SEARCH', 'KNOWLEDGE']).default('WEB_SEARCH'),
  adjustmentPct: z.number().int().min(-50).max(50),
  summary: z.string().min(1).max(600),
  analysis: z.string().min(1).max(1500).optional(),
  factors: z
    .array(z.object({ text: z.string().max(300), impact: z.enum(['UP', 'DOWN', 'NEUTRAL']) }))
    .max(6),
  sources: z.array(z.object({ title: z.string().max(300), uri: httpsUrl })).max(8),
  searchSuggestionsHtml: z.string().max(65536).nullable(),
});
export type ForecastMarketInsight = z.infer<typeof marketSchema>;
export const forecastRunSchema = z.object({
  jobId: z.string().uuid(),
  productId: z.string().uuid(),
  region: forecastFormSchema.shape.region,
  status,
  attempts: z.number().int().min(1).max(3),
  forecastStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string().datetime(),
  result: z
    .object({
      status,
      modelVersion: z.string().optional(),
      forecast: z.array(point).length(30).optional(),
      history: z.array(point).length(90).optional(),
      baseline: z.array(point).length(30).optional(),
      fallback: z.enum(['FORMULA_30D', 'WEEKDAY_TREND_V1']).optional(),
      market: marketSchema.optional(),
    })
    .nullable(),
});
export type ForecastRun = z.infer<typeof forecastRunSchema>;
export const FORECAST_MAX_ATTEMPTS = 3;
export const isForecastPending = (run: ForecastRun | null) =>
  run?.status === 'QUEUED' || run?.status === 'RUNNING';
/** Mirrors the server retry rule; the API still decides and returns 409/429 otherwise. */
export const canRetryForecast = (run: ForecastRun | null) =>
  (run?.status === 'FAILED' || run?.status === 'PROVIDER_UNAVAILABLE') &&
  run.attempts < FORECAST_MAX_ATTEMPTS;
const endpoint = '/v1/inventory/demand-forecasts';
export const demandForecastApi = {
  async create(input: ForecastForm, signal: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(endpoint, input, {
      silent: true,
      signal,
    });
    return forecastRunSchema.parse(data);
  },
  async get(id: string, signal: AbortSignal) {
    z.string().uuid().parse(id);
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${endpoint}/${id}`, {
      silent: true,
      signal,
    });
    return forecastRunSchema.parse(data);
  },
  async retry(id: string, signal: AbortSignal) {
    z.string().uuid().parse(id);
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${endpoint}/${id}/retry`,
      undefined,
      {
        silent: true,
        signal,
      },
    );
    return forecastRunSchema.parse(data);
  },
  async list(signal: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(endpoint, { silent: true, signal });
    return z.array(forecastRunSchema).parse(data);
  },
};
