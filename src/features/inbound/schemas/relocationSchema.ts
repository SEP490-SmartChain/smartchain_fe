import { relocationInputSchema, type RelocationPosition } from '../api/relocationApi';

export function createRelocationFormSchema(
  source: Pick<RelocationPosition, 'availableQty' | 'fromBinId'>,
) {
  return relocationInputSchema
    .extend({ qty: relocationInputSchema.shape.qty.max(source.availableQty) })
    .refine((value) => value.toBinId !== source.fromBinId, { path: ['toBinId'] });
}
