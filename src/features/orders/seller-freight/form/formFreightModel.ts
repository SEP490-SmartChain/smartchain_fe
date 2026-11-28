import {
  calculateOrderPayment,
  normalizeOrderMoneyInput,
  type ManualDraft,
} from '../../api/ordersApi';
import {
  DEFAULT_QUICK_PARCEL,
  summarizeSkuLinesForParcel,
  type QuickParcelSkuOption,
} from '../lookup/model/quickLookupController';
import {
  canApplyQuote,
  estimateInputSchema,
  quoteInputKey,
  validateOptionalVndField,
  type EstimateInput,
  type EstimateResult,
  type FreightDraftSeed,
  type ParcelDimensions,
  type Tier,
} from '../shared';

export interface FormParcelAssumptions {
  readonly weightG: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly itemCount: number;
}

export interface DerivedFormFreightContext {
  readonly goodsTotalVnd: string | null;
  readonly codVnd: string | null;
  readonly declaredValueVnd: string | null;
  readonly invalidDeclaredValue: boolean;
  readonly parcel: ParcelDimensions;
  readonly needsParcelBoxReview: boolean;
  readonly skuSummaryReason:
    | 'NO_LINES'
    | 'MISSING_PRODUCT_DIMENSIONS'
    | 'MULTI_ITEM_NEEDS_BOX'
    | 'OK';
  readonly estimateInput: EstimateInput | null;
  readonly inputKey: string | null;
}

export function createInitialFormParcel(seed: FreightDraftSeed | null): FormParcelAssumptions {
  if (seed) {
    return { ...seed.assumedParcel };
  }
  return { ...DEFAULT_QUICK_PARCEL };
}

export function deriveFormGoodsTotal(draft: Pick<ManualDraft, 'items'>): string | null {
  let total = BigInt(0);
  for (const item of draft.items) {
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty < 1) return null;
    const price = normalizeOrderMoneyInput(String(item.unitPrice ?? ''));
    if (!/^(0|[1-9]\d{0,11})$/.test(price)) return null;
    total += BigInt(qty) * BigInt(price);
  }
  return total <= BigInt('999999999999') ? total.toString() : null;
}

const FORM_MONEY_REGEX = /^(0|[1-9]\d{0,11})$/;

export function deriveFormCodVnd(
  draft: Pick<
    ManualDraft,
    | 'entryMode'
    | 'collectionAmount'
    | 'paymentBreakdown'
    | 'goodsPaymentMode'
    | 'shippingFeePayer'
    | 'items'
  >,
  goodsTotalVnd: string | null,
): string | null {
  if (draft.entryMode === 'DIRECT') {
    const raw = normalizeOrderMoneyInput(draft.collectionAmount ?? '');
    return FORM_MONEY_REGEX.test(raw) ? raw : null;
  }
  if (!goodsTotalVnd || !draft.paymentBreakdown) return null;
  const discountAmount = normalizeOrderMoneyInput(draft.paymentBreakdown.discountAmount || '0');
  const goodsPaidAmount = normalizeOrderMoneyInput(draft.paymentBreakdown.goodsPaidAmount || '0');
  const shippingChargeAmount = normalizeOrderMoneyInput(
    draft.paymentBreakdown.shippingChargeAmount || '0',
  );
  const shippingPaidAmount = normalizeOrderMoneyInput(
    draft.paymentBreakdown.shippingPaidAmount || '0',
  );
  if (
    !FORM_MONEY_REGEX.test(discountAmount) ||
    !FORM_MONEY_REGEX.test(goodsPaidAmount) ||
    !FORM_MONEY_REGEX.test(shippingChargeAmount) ||
    !FORM_MONEY_REGEX.test(shippingPaidAmount)
  ) {
    return null;
  }
  const payer = BigInt(shippingChargeAmount) > BigInt(0) ? 'RECIPIENT' : 'SENDER';
  try {
    const calc = calculateOrderPayment(
      goodsTotalVnd,
      {
        discountAmount,
        goodsPaidAmount,
        shippingChargeAmount,
        shippingPaidAmount,
      },
      payer,
      draft.goodsPaymentMode,
    );
    return (BigInt(calc.codAmount) + BigInt(calc.customerShippingFee)).toString();
  } catch {
    return null;
  }
}

export function deriveFormFreightContext(params: {
  readonly scope: string;
  readonly originWarehouseId: string;
  readonly draft: Pick<
    ManualDraft,
    | 'entryMode'
    | 'collectionAmount'
    | 'paymentBreakdown'
    | 'goodsPaymentMode'
    | 'shippingFeePayer'
    | 'toProvinceCode'
    | 'toWardCode'
    | 'declaredValue'
    | 'items'
  >;
  readonly products: readonly QuickParcelSkuOption[];
  readonly manualParcel: FormParcelAssumptions;
  readonly useCustomParcelOverride: boolean;
}): DerivedFormFreightContext {
  const productById = new Map(params.products.map((p) => [p.id, p]));
  const skuLines = params.draft.items.flatMap((item) => {
    const product = productById.get(item.productId);
    if (!product || item.qty < 1) return [];
    return [{ product, qty: item.qty }];
  });

  const skuSummary = summarizeSkuLinesForParcel(skuLines);
  const totalDraftItemCount = Math.max(
    1,
    params.draft.items.reduce(
      (sum, item) => sum + Math.max(0, Math.trunc(Number(item.qty) || 0)),
      0,
    ),
  );

  const resolvedParcel: ParcelDimensions =
    !params.useCustomParcelOverride && skuSummary.parcel
      ? { ...skuSummary.parcel, itemCount: totalDraftItemCount }
      : { ...params.manualParcel, itemCount: totalDraftItemCount };

  const goodsTotalVnd =
    params.draft.entryMode === 'DIRECT'
      ? skuSummary.totalDeclaredValueVnd
      : deriveFormGoodsTotal(params.draft);
  const codVnd = deriveFormCodVnd(params.draft, goodsTotalVnd);

  const rawDeclared = params.draft.declaredValue ?? '';
  const declaredCheck = validateOptionalVndField(rawDeclared, 'giá trị khai báo');
  const invalidDeclaredValue = rawDeclared.trim().length > 0 && declaredCheck.value === null;
  const declaredValueVnd = invalidDeclaredValue
    ? null
    : (declaredCheck.value ?? goodsTotalVnd ?? skuSummary.totalDeclaredValueVnd);

  let estimateInput: EstimateInput | null = null;
  let inputKey: string | null = null;

  if (codVnd !== null && declaredValueVnd !== null) {
    const parsed = estimateInputSchema.safeParse({
      originWarehouseId: params.originWarehouseId,
      toProvinceCode: params.draft.toProvinceCode,
      toWardCode: params.draft.toWardCode,
      parcel: resolvedParcel,
      declaredValueVnd,
      codVnd,
    });
    if (parsed.success) {
      estimateInput = parsed.data;
      inputKey = quoteInputKey(params.scope, parsed.data);
    }
  }

  return {
    goodsTotalVnd,
    codVnd,
    declaredValueVnd,
    invalidDeclaredValue,
    parcel: resolvedParcel,
    needsParcelBoxReview: skuSummary.needsManualReview,
    skuSummaryReason: skuSummary.reason,
    estimateInput,
    inputKey,
  };
}

export function evaluateFormQuoteApply(params: {
  readonly scope: string;
  readonly activeScope: string;
  readonly currentKey: string | null;
  readonly quoteKey: string | null;
  readonly result: EstimateResult | null;
  readonly selectedTier: Tier;
  readonly entryMode: 'DIRECT' | 'CALCULATED';
  readonly shippingPaidAmount: string;
  readonly nowMs?: number;
}) {
  if (!FORM_MONEY_REGEX.test(params.shippingPaidAmount)) {
    return { allowed: false, reason: 'INPUT_CHANGED' as const };
  }
  return canApplyQuote(params);
}
