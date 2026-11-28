import {
  estimateInputSchema,
  estimateResultSchema,
  orderFreightListResponseSchema,
  originsResponseSchema,
  type EstimateInput,
  type EstimateResult,
  type Origin,
} from './schema';

export function makeOriginFixture(overrides: Partial<Origin> = {}): Origin {
  return {
    id: '00000400-0000-4000-8000-000000000001',
    code: 'HCM-01',
    name: 'Kho Thủ Đức',
    ...overrides,
  };
}

export function makeEstimateInputFixture(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return estimateInputSchema.parse({
    originWarehouseId: '00000400-0000-4000-8000-000000000001',
    toProvinceCode: '01',
    toWardCode: '01001',
    parcel: {
      weightG: 500,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
      itemCount: 1,
      ...overrides.parcel,
    },
    declaredValueVnd: '200000',
    codVnd: '200000',
    ...overrides,
  });
}

export function makeEstimateResultFixture(overrides: Partial<EstimateResult> = {}): EstimateResult {
  const input = makeEstimateInputFixture(overrides.input);
  const origin = makeOriginFixture(overrides.origin);
  return estimateResultSchema.parse({
    basis: 'ONE_PARCEL_ASSUMPTION',
    origin,
    input,
    quotedAt: '2026-11-28T03:35:00.000Z',
    refreshAfter: '2026-11-28T03:40:00.000Z',
    tiers: [
      { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '32000', deliveryDays: 3 },
      { tier: 'BALANCED', status: 'QUOTED', amountVnd: '32000', deliveryDays: 2 },
      { tier: 'EXPRESS', status: 'UNAVAILABLE', reason: 'ETA_UNAVAILABLE' },
    ],
    ...overrides,
  });
}

export { originsResponseSchema, orderFreightListResponseSchema };
