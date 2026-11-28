import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  dispatchConfirmRowSchema,
  dispatchReviewInputSchema,
  dispatchReviewRowSchema,
  selectedOrderOptionSchema,
  type DispatchReviewInput,
  type SelectedOrderOption,
} from '../seller-freight/shared/dispatchReview';
import { recordedVndSchema } from '../seller-freight/shared/schema';

const base = '/v1/seller/dispatch-review';
const uuid = z.uuid({ version: 'v4' });
export const suggestionResponseSchema = z.strictObject({ items: z.array(dispatchReviewRowSchema) });
export const confirmationResponseSchema = z.strictObject({
  items: z.array(dispatchConfirmRowSchema),
});
export const packedDispatchReviewSchema = z.strictObject({
  awaitingInitial: z.boolean(),
  parcels: z.array(
    z.strictObject({
      fulfillmentOrderId: uuid,
      parcelNumber: z.number().int().positive(),
      reviewRef: uuid,
      reason: z.enum(['PRICE_CHANGED', 'SERVICE_UNAVAILABLE']),
      previousAmountVnd: recordedVndSchema.nullable(),
      previousServiceName: z.string().min(1).nullable().optional(),
      previousCarrierName: z.string().min(1).nullable().optional(),
      options: z.array(
        z.strictObject({
          optionRef: uuid,
          carrierName: z.string().min(1),
          serviceName: z.string().min(1),
          amountVnd: recordedVndSchema,
          codVnd: recordedVndSchema.nullable(),
        }),
      ),
      expiresAt: z.iso.datetime(),
    }),
  ),
});
const confirmationRequestSchema = z.strictObject({
  items: z.array(selectedOrderOptionSchema).min(1).max(100),
});
const packedSelectionSchema = z.strictObject({ reviewRef: uuid, optionRef: uuid });
const packedAcceptedSchema = z.strictObject({ accepted: z.literal(true) });
export type PackedDispatchReview = z.infer<typeof packedDispatchReviewSchema>;

export const dispatchReviewApi = {
  async suggest(input: DispatchReviewInput, signal?: AbortSignal) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/suggestions`,
      dispatchReviewInputSchema.parse({ ...input, includeQuoteValidity: true }),
      { signal, silent: true },
    );
    return suggestionResponseSchema.parse(response.data).items;
  },
  async confirm(items: SelectedOrderOption[], key: string, signal?: AbortSignal) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/confirm`,
      confirmationRequestSchema.parse({ items }),
      { headers: { 'Idempotency-Key': key }, signal, silent: true },
    );
    return confirmationResponseSchema.parse(response.data).items;
  },
  async packed(orderId: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${base}/orders/${uuid.parse(orderId)}`,
      { signal, silent: true },
    );
    return packedDispatchReviewSchema.parse(response.data);
  },
  async confirmPacked(
    orderId: string,
    input: z.infer<typeof packedSelectionSchema>,
    signal?: AbortSignal,
  ) {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${base}/orders/${uuid.parse(orderId)}/packed-confirm`,
      packedSelectionSchema.parse(input),
      { signal, silent: true },
    );
    return packedAcceptedSchema.parse(response.data);
  },
};
