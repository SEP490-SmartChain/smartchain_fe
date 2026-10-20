import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const reasonSchema = z
  .string()
  .trim()
  .min(3)
  .max(1000)
  .refine((value) =>
    [...value].every(
      (c) =>
        c.charCodeAt(0) !== 127 && (c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
    ),
  );
export const cartonFormSchema = z.object({
  actualCartonCount: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,6})$/)
    .refine((v) => Number(v) <= 1000000),
  reason: reasonSchema,
});
export const cartonInputSchema = z
  .object({
    operationKey: z.string().uuid(),
    expectedVersion: z.number().int().min(1).max(2147483646),
    actualCartonCount: z.number().int().min(0).max(1000000),
    reason: reasonSchema,
  })
  .strict();
export type CartonInput = z.infer<typeof cartonInputSchema>;
export type CartonFormValues = z.infer<typeof cartonFormSchema>;
export const cartonConfirmationSchema = z
  .object({
    id: z.string().uuid(),
    reviewId: z.string().uuid(),
    actualCartonCount: z.number().int().min(0).max(1000000),
    reason: reasonSchema,
    confirmedAt: z.string().datetime(),
  })
  .strict();
export const cartonStateSchema = z
  .object({
    receiptId: z.string().uuid(),
    receiptVersion: z.number().int().positive(),
    canConfirm: z.boolean(),
    confirmation: cartonConfirmationSchema.nullable(),
  })
  .strict()
  .refine((state) => !state.canConfirm || !state.confirmation);
export type CartonState = z.infer<typeof cartonStateSchema>;
const path = (warehouseId: string, asnId: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns/${encodeURIComponent(asnId)}/receiving/cartons`;
export const receiptCartonApi = {
  async get(warehouseId: string, asnId: string, receiptId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(path(warehouseId, asnId), {
      silent: true,
      signal,
    });
    const result = cartonStateSchema.parse(data);
    if (result.receiptId !== receiptId) {
      throw new Error('Carton evidence belongs to another receipt');
    }
    return result;
  },
  async confirm(warehouseId: string, asnId: string, input: CartonInput, signal?: AbortSignal) {
    const command = cartonInputSchema.parse(input);
    const { data } = await apiClient.post<ApiResponse<unknown>>(path(warehouseId, asnId), command, {
      silent: true,
      signal,
    });
    const result = cartonConfirmationSchema.parse(data);
    if (
      result.actualCartonCount !== command.actualCartonCount ||
      result.reason !== command.reason
    ) {
      throw new Error('Carton evidence does not match the confirmation');
    }
    return result;
  },
};
