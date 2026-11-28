import { z } from 'zod';
import { orderLookupItemSchema, recordedVndSchema, tierSchema } from './schema';

const id = z.uuid({ version: 'v4' });
const parcelOffer = z.strictObject({
  parcelRef: z.string().min(1),
  carrierName: z.string().min(1),
  serviceName: z.string().min(1),
  amountVnd: recordedVndSchema,
});
const orderOption = z.strictObject({
  optionRef: id,
  parcels: z.array(parcelOffer).min(1),
  totalVnd: recordedVndSchema,
});

export const dispatchReviewInputSchema = z.strictObject({
  items: z.array(orderLookupItemSchema).min(1).max(10),
  deliveryTier: tierSchema,
  includeQuoteValidity: z.boolean().optional(),
});
export const dispatchReviewRowSchema = z.discriminatedUnion('state', [
  z.strictObject({
    orderId: id,
    state: z.literal('QUOTED'),
    recommendedRef: id,
    expiresAt: z.iso.datetime().optional(),
    sourceRevision: z.string().min(1).optional(),
    options: z.array(orderOption).min(1),
  }),
  z.strictObject({ orderId: id, state: z.literal('UNAVAILABLE'), reason: z.string().min(1) }),
]);
export const selectedOrderOptionSchema = z.strictObject({ orderId: id, optionRef: id });
export const dispatchConfirmRowSchema = z.discriminatedUnion('state', [
  z.strictObject({ orderId: id, state: z.literal('ACCEPTED') }),
  z.strictObject({ orderId: id, state: z.literal('REJECTED'), reason: z.string().min(1) }),
]);
export type DispatchReviewRow = z.infer<typeof dispatchReviewRowSchema>;
export type DispatchReviewInput = z.infer<typeof dispatchReviewInputSchema>;
export type SelectedOrderOption = z.infer<typeof selectedOrderOptionSchema>;
export type DispatchConfirmRow = z.infer<typeof dispatchConfirmRowSchema>;

export type DispatchFreightEstimate = {
  amountVnd: string;
  expiresAt: string;
  sourceRevision: string;
};

export function selectedDispatchEstimate(
  row: DispatchReviewRow,
  selectedRef: string,
): DispatchFreightEstimate | undefined {
  if (row.state !== 'QUOTED' || !row.expiresAt || !row.sourceRevision) return undefined;
  const option = row.options.find(({ optionRef }) => optionRef === selectedRef);
  return (
    option && {
      amountVnd: option.totalVnd,
      expiresAt: row.expiresAt,
      sourceRevision: row.sourceRevision,
    }
  );
}
