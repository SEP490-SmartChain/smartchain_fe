import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { withdrawalAddressFormSchema, withdrawalCommandSchema } from '../schemas/withdrawalSchema';

export const withdrawalAddressSchema = withdrawalAddressFormSchema
  .extend({ version: z.number().int().positive() })
  .strict();
export const withdrawalOptionsSchema = z
  .object({
    address: withdrawalAddressSchema.nullable(),
    items: z
      .array(
        z
          .object({
            warehouseId: z.uuid(),
            warehouseName: z.string(),
            productId: z.uuid(),
            sku: z.string(),
            productName: z.string(),
            lotId: z.uuid(),
            lotCode: z.string(),
            availableQty: z.number().int().positive(),
          })
          .strict(),
      )
      .max(200),
    nextCursor: z.string().max(110).nullable(),
  })
  .strict();
const locationsSchema = z
  .array(
    z
      .object({
        code: z.string(),
        name: z.string(),
        type: z.enum(['PROVINCE', 'WARD']),
        parentCode: z.string().nullable(),
      })
      .strict(),
  )
  .max(20000);
export type WithdrawalOptions = z.infer<typeof withdrawalOptionsSchema>;
const base = '/v1/orders/withdrawals';
export const withdrawalApi = {
  async options(signal?: AbortSignal, cursor?: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/options`, {
      signal,
      silent: true,
      params: cursor ? { cursor } : undefined,
    });
    return withdrawalOptionsSchema.parse(data);
  },
  async locations(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/locations`, {
      signal,
      silent: true,
    });
    return locationsSchema.parse(data);
  },
  async register(
    input: z.infer<typeof withdrawalAddressFormSchema> & { expectedVersion: number },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.put<ApiResponse<unknown>>(`${base}/address`, input, {
      signal,
      silent: true,
    });
    return withdrawalAddressSchema.parse(data);
  },
  async create(input: z.infer<typeof withdrawalCommandSchema>, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      base,
      withdrawalCommandSchema.parse(input),
      { signal, silent: true },
    );
    return z
      .object({
        orderId: z.uuid(),
        status: z.literal('VALIDATED'),
        replayed: z.boolean().optional(),
      })
      .strict()
      .parse(data);
  },
};
