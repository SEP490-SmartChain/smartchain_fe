import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const quoteResponseSchema = z.object({
  columns: z.array(
    z.object({
      serviceId: z.string().uuid(),
      carrierName: z.string(),
      serviceName: z.string(),
      updatedAt: z.string().nullable(),
      isSample: z.boolean(),
      isComparable: z.boolean(),
    }),
  ),
  warehouses: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        code: z.string(),
        provinceCode: z.string(),
      }),
    )
    .default([]),
  rows: z.array(
    z.object({
      key: z.string(),
      originWarehouseId: z.string().uuid().nullable().default(null),
      provinceName: z.string(),
      weightG: z.number().int(),
      isCod: z.boolean(),
      quotes: z.array(
        z.object({
          serviceId: z.string().uuid(),
          priceVnd: z.number().nullable(),
          previousPriceVnd: z.number().nullable(),
          deltaPct: z.number().nullable(),
          deliveryDays: z.number().nullable(),
          expectedDeliveryAt: z
            .string()
            .datetime({ offset: true })
            .nullable()
            .optional()
            .default(null),
          isDeliverable: z.boolean(),
          cardPriceVnd: z.number().nullable().default(null),
          cardDeltaPct: z.number().nullable().default(null),
          zone: z.string().nullable().default(null),
        }),
      ),
    }),
  ),
  generatedAt: z.string(),
});

export type RateQuoteComparison = z.infer<typeof quoteResponseSchema>;
export type RateQuoteRow = RateQuoteComparison['rows'][number];
export type RateQuoteColumn = RateQuoteComparison['columns'][number];
export type RateQuoteWarehouse = RateQuoteComparison['warehouses'][number];

export const rateQuotesApi = {
  async latest(signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      '/v1/platform/rate-intelligence/quotes',
      { signal, silent: true },
    );
    return quoteResponseSchema.parse(response.data);
  },
};
