import { estimateInputSchema, type EstimateInput, type EstimateResult, type Tier } from './schema';

export function roundSkuDimensionCm(value: string | number): number | null {
  const numeric = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.ceil(numeric);
  return rounded >= 1 && rounded <= 1000 ? rounded : null;
}

export function normalizeMoneyForQuote(value: string): string {
  const trimmed = value.trim();
  const digits = /^\d{1,3}([., \u00a0\u202f])\d{3}(?:\1\d{3})*$/.test(trimmed)
    ? trimmed.replace(/[., \u00a0\u202f]/g, '')
    : trimmed;
  return /^\d+$/.test(digits) ? digits.replace(/^0+(?=\d)/, '') : trimmed;
}

export function normalizeInput(input: EstimateInput): EstimateInput {
  return estimateInputSchema.parse({
    originWarehouseId: input.originWarehouseId.trim(),
    toProvinceCode: input.toProvinceCode.trim(),
    toWardCode: input.toWardCode.trim(),
    parcel: {
      weightG: Math.trunc(input.parcel.weightG),
      lengthCm: Math.trunc(input.parcel.lengthCm),
      widthCm: Math.trunc(input.parcel.widthCm),
      heightCm: Math.trunc(input.parcel.heightCm),
      itemCount: Math.trunc(input.parcel.itemCount),
    },
    declaredValueVnd: normalizeMoneyForQuote(input.declaredValueVnd),
    codVnd: normalizeMoneyForQuote(input.codVnd),
  });
}

export function quoteInputKey(scope: string, input: EstimateInput): string {
  const normalized = normalizeInput(input);
  return JSON.stringify([
    scope,
    normalized.originWarehouseId,
    normalized.toProvinceCode,
    normalized.toWardCode,
    normalized.parcel.weightG,
    normalized.parcel.lengthCm,
    normalized.parcel.widthCm,
    normalized.parcel.heightCm,
    normalized.parcel.itemCount,
    normalized.declaredValueVnd,
    normalized.codVnd,
  ]);
}

export function isQuoteExpired(
  result: Pick<EstimateResult, 'refreshAfter'>,
  nowMs = Date.now(),
): boolean {
  const expiresAt = Date.parse(result.refreshAfter);
  return !Number.isFinite(expiresAt) || nowMs >= expiresAt;
}

export function canApplyQuote(params: {
  readonly scope: string;
  readonly activeScope: string;
  readonly currentKey: string | null;
  readonly quoteKey: string | null;
  readonly result: EstimateResult | null;
  readonly selectedTier: Tier;
  readonly entryMode: 'DIRECT' | 'CALCULATED';
  readonly shippingPaidAmount: string;
  readonly nowMs?: number;
}):
  | { readonly allowed: true; readonly amountVnd: string }
  | { readonly allowed: false; readonly reason: string } {
  if (params.entryMode !== 'CALCULATED') {
    return { allowed: false, reason: 'DIRECT_MODE' };
  }
  if (!params.result || !params.currentKey || !params.quoteKey) {
    return { allowed: false, reason: 'MISSING_QUOTE' };
  }
  if (params.scope !== params.activeScope || params.currentKey !== params.quoteKey) {
    return { allowed: false, reason: 'STALE_INPUT' };
  }
  if (isQuoteExpired(params.result, params.nowMs)) {
    return { allowed: false, reason: 'EXPIRED' };
  }
  const tierResult = params.result.tiers.find((item) => item.tier === params.selectedTier);
  if (!tierResult || tierResult.status !== 'QUOTED') {
    return { allowed: false, reason: 'TIER_UNAVAILABLE' };
  }
  const normalizedPaid = normalizeMoneyForQuote(params.shippingPaidAmount || '0');
  if (!/^(0|[1-9]\d{0,11})$/.test(normalizedPaid)) {
    return { allowed: false, reason: 'INVALID_SHIPPING_PAID' };
  }
  if (BigInt(normalizedPaid) > BigInt(tierResult.amountVnd)) {
    return { allowed: false, reason: 'PAID_EXCEEDS_QUOTE' };
  }
  return { allowed: true, amountVnd: tierResult.amountVnd };
}
