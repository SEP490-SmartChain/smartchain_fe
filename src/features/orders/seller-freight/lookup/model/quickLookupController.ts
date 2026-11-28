import {
  isQuoteExpired,
  normalizeInput,
  normalizeMoneyForQuote,
  quoteInputKey,
  roundSkuDimensionCm,
  type EstimateClient,
  type EstimateInput,
  type EstimateResult,
  type FreightDraftSeed,
  type Origin,
  type ParcelDimensions,
  type Tier,
} from '../../shared';

export interface QuickParcelSkuOption {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly weightG: number;
  readonly lengthCm: string | number;
  readonly widthCm: string | number;
  readonly heightCm: string | number;
  readonly declaredValue: string | number;
}

export interface QuickLookupSkuLine {
  readonly product: QuickParcelSkuOption;
  readonly qty: number;
}

export interface ComputedSkuParcelSummary {
  readonly parcel: ParcelDimensions | null;
  readonly totalWeightG: number;
  readonly totalDeclaredValueVnd: string;
  readonly totalItemCount: number;
  readonly needsManualReview: boolean;
  readonly reason: 'NO_LINES' | 'MISSING_PRODUCT_DIMENSIONS' | 'MULTI_ITEM_NEEDS_BOX' | 'OK';
}

export const DEFAULT_QUICK_PARCEL: ParcelDimensions = {
  weightG: 500,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 10,
  itemCount: 1,
};

const EXPLICIT_QUICK_MONEY_REGEX = /^(0|[1-9]\d{0,11})$/;

/**
 * Parses an explicitly entered/confirmed quick-lookup VND input without
 * defaulting blank values to `'0'` (D3).
 */
export function parseExplicitQuickMoneyInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalized = normalizeMoneyForQuote(trimmed);
  return EXPLICIT_QUICK_MONEY_REGEX.test(normalized) ? normalized : null;
}

/**
 * Summarizes weight, quantity, and declared value from selected SKUs.
 * - Single SKU with qty=1 rounds decimal cm up (`Math.ceil`) to integer adapter cm.
 * - Multiple SKUs or qty > 1 NEVER sums 3 dimensions linearly; pre-populates max single dimensions
 *   (or default box when missing) and marks `needsManualReview=true` so the seller verifies the outer parcel box.
 */
export function summarizeSkuLinesForParcel(
  lines: readonly QuickLookupSkuLine[],
): ComputedSkuParcelSummary {
  const validLines = lines.filter((line) => line.qty > 0);
  if (validLines.length === 0) {
    return {
      parcel: null,
      totalWeightG: 0,
      totalDeclaredValueVnd: '0',
      totalItemCount: 0,
      needsManualReview: true,
      reason: 'NO_LINES',
    };
  }

  let totalWeightG = 0;
  let totalItemCount = 0;
  let totalDeclaredValue = BigInt(0);
  let maxLength = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  let missingDim = false;

  for (const line of validLines) {
    const qty = Math.trunc(line.qty);
    totalItemCount += qty;
    const weight = Math.ceil(line.product.weightG);
    if (!Number.isFinite(weight) || weight <= 0) {
      missingDim = true;
    } else {
      totalWeightG += weight * qty;
    }

    const l = roundSkuDimensionCm(line.product.lengthCm);
    const w = roundSkuDimensionCm(line.product.widthCm);
    const h = roundSkuDimensionCm(line.product.heightCm);
    if (l === null || w === null || h === null) {
      missingDim = true;
    } else {
      maxLength = Math.max(maxLength, l);
      maxWidth = Math.max(maxWidth, w);
      maxHeight = Math.max(maxHeight, h);
    }

    const rawDeclared = normalizeMoneyForQuote(String(line.product.declaredValue || '0'));
    if (/^\d+$/.test(rawDeclared)) {
      totalDeclaredValue += BigInt(rawDeclared) * BigInt(qty);
    }
  }

  if (missingDim || totalWeightG <= 0 || maxLength <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return {
      parcel: null,
      totalWeightG: Math.max(0, totalWeightG),
      totalDeclaredValueVnd: totalDeclaredValue.toString(),
      totalItemCount,
      needsManualReview: true,
      reason: 'MISSING_PRODUCT_DIMENSIONS',
    };
  }

  const singleUnit = validLines.length === 1 && totalItemCount === 1;
  return {
    parcel: {
      weightG: Math.min(1_000_000, totalWeightG),
      lengthCm: maxLength,
      widthCm: maxWidth,
      heightCm: maxHeight,
      itemCount: totalItemCount,
    },
    totalWeightG,
    totalDeclaredValueVnd: totalDeclaredValue.toString(),
    totalItemCount,
    needsManualReview: !singleUnit,
    reason: singleUnit ? 'OK' : 'MULTI_ITEM_NEEDS_BOX',
  };
}

export type QuickLookupEstimateErrorKind =
  | 'ORIGIN_UNAVAILABLE'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'UNKNOWN';

export interface QuickLookupState {
  readonly scope: string;
  readonly originsStatus: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
  readonly origins: readonly Origin[];
  readonly selectedOriginId: string;
  readonly parcelMode: 'MANUAL' | 'SKU';
  readonly selectedTier: Tier;
  readonly requestSeq: number;
  readonly loading: boolean;
  readonly quotedKey: string | null;
  readonly result: EstimateResult | null;
  readonly errorKind: QuickLookupEstimateErrorKind | null;
  readonly retryAfterSeconds: number | null;
}

export function createQuickLookupState(scope: string): QuickLookupState {
  return {
    scope,
    originsStatus: 'IDLE',
    origins: [],
    selectedOriginId: '',
    parcelMode: 'MANUAL',
    selectedTier: 'BALANCED',
    requestSeq: 0,
    loading: false,
    quotedKey: null,
    result: null,
    errorKind: null,
    retryAfterSeconds: null,
  };
}

export function classifyEstimateError(error: unknown): {
  kind: QuickLookupEstimateErrorKind;
  retryAfterSeconds: number | null;
} {
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    const retryAfter = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (status === 429) {
      return {
        kind: 'RATE_LIMITED',
        retryAfterSeconds:
          typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? retryAfter : null,
      };
    }
    if (status === 503) {
      return { kind: 'TEMPORARILY_UNAVAILABLE', retryAfterSeconds: null };
    }
    if (status === 403 || status === 404) {
      return { kind: 'ORIGIN_UNAVAILABLE', retryAfterSeconds: null };
    }
    if (status === 400) {
      return { kind: 'INVALID_INPUT', retryAfterSeconds: null };
    }
  }
  return { kind: 'UNKNOWN', retryAfterSeconds: null };
}

export function isQuickResultFresh(
  state: QuickLookupState,
  currentInput: EstimateInput | null,
  nowMs = Date.now(),
): { fresh: boolean; reason: 'OK' | 'EMPTY' | 'INPUT_CHANGED' | 'SCOPE_CHANGED' | 'EXPIRED' } {
  if (!state.result || !state.quotedKey) {
    return { fresh: false, reason: 'EMPTY' };
  }
  if (!currentInput) {
    return { fresh: false, reason: 'INPUT_CHANGED' };
  }
  let currentKey: string;
  try {
    currentKey = quoteInputKey(state.scope, currentInput);
  } catch {
    return { fresh: false, reason: 'INPUT_CHANGED' };
  }
  if (currentKey !== state.quotedKey) {
    return { fresh: false, reason: 'INPUT_CHANGED' };
  }
  if (isQuoteExpired(state.result, nowMs)) {
    return { fresh: false, reason: 'EXPIRED' };
  }
  return { fresh: true, reason: 'OK' };
}

export function buildFreightDraftSeed(params: {
  readonly scope: string;
  readonly seedId: string;
  readonly input: EstimateInput;
  readonly deliveryTier: Tier;
  readonly items: readonly QuickLookupSkuLine[];
}): FreightDraftSeed {
  const normalized = normalizeInput(params.input);
  return {
    seedId: params.seedId,
    scope: params.scope,
    toProvinceCode: normalized.toProvinceCode,
    toWardCode: normalized.toWardCode,
    deliveryTier: params.deliveryTier,
    items: params.items
      .filter((line) => line.qty > 0)
      .map((line) => ({
        productId: line.product.id,
        qty: Math.trunc(line.qty),
      })),
    assumedParcel: normalized.parcel,
    assumedOriginWarehouseId: normalized.originWarehouseId,
    referenceCodVnd: normalized.codVnd,
    referenceDeclaredValueVnd: normalized.declaredValueVnd,
  };
}

export class QuickLookupController {
  private state: QuickLookupState;
  private originsAbort: AbortController | null = null;
  private estimateAbort: AbortController | null = null;
  private readonly listeners = new Set<(state: QuickLookupState) => void>();

  constructor(
    private readonly client: EstimateClient,
    scope: string,
  ) {
    this.state = createQuickLookupState(scope);
  }

  getState(): QuickLookupState {
    return this.state;
  }

  subscribe(listener: (state: QuickLookupState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  resetScope(nextScope: string): void {
    if (this.state.scope === nextScope) return;
    this.cancelInFlight();
    this.state = createQuickLookupState(nextScope);
    this.emit();
  }

  cancelInFlight(): void {
    this.originsAbort?.abort();
    this.originsAbort = null;
    this.estimateAbort?.abort();
    this.estimateAbort = null;
    if (this.state.loading) {
      this.state = { ...this.state, loading: false };
      this.emit();
    }
  }

  setSelectedOrigin(originId: string): void {
    if (this.state.selectedOriginId === originId) return;
    this.state = { ...this.state, selectedOriginId: originId };
    this.emit();
  }

  setSelectedTier(tier: Tier): void {
    if (this.state.selectedTier === tier) return;
    this.state = { ...this.state, selectedTier: tier };
    this.emit();
  }

  async loadOrigins(): Promise<void> {
    const scopeAtStart = this.state.scope;
    this.originsAbort?.abort();
    const abort = new AbortController();
    this.originsAbort = abort;
    this.state = { ...this.state, originsStatus: 'LOADING' };
    this.emit();

    try {
      const origins = await this.client.origins(abort.signal);
      if (abort.signal.aborted || this.state.scope !== scopeAtStart) {
        return;
      }
      const nextOriginId = origins.some((o) => o.id === this.state.selectedOriginId)
        ? this.state.selectedOriginId
        : origins.length === 1
          ? origins[0].id
          : (origins[0]?.id ?? '');
      this.state = {
        ...this.state,
        originsStatus: 'READY',
        origins,
        selectedOriginId: nextOriginId,
      };
      this.emit();
    } catch {
      if (abort.signal.aborted || this.state.scope !== scopeAtStart) {
        return;
      }
      this.state = {
        ...this.state,
        originsStatus: 'ERROR',
        origins: [],
        selectedOriginId: '',
      };
      this.emit();
    }
  }

  async estimate(rawInput: EstimateInput): Promise<void> {
    const normalized = normalizeInput(rawInput);
    const scopeAtStart = this.state.scope;
    const keyAtStart = quoteInputKey(scopeAtStart, normalized);
    const seq = this.state.requestSeq + 1;

    this.estimateAbort?.abort();
    const abort = new AbortController();
    this.estimateAbort = abort;

    this.state = {
      ...this.state,
      requestSeq: seq,
      loading: true,
      errorKind: null,
      retryAfterSeconds: null,
    };
    this.emit();

    try {
      const result = await this.client.estimate(normalized, abort.signal);
      if (
        abort.signal.aborted ||
        this.state.scope !== scopeAtStart ||
        this.state.requestSeq !== seq
      ) {
        return;
      }
      this.state = {
        ...this.state,
        loading: false,
        quotedKey: keyAtStart,
        result,
        errorKind: null,
        retryAfterSeconds: null,
      };
      this.emit();
    } catch (error) {
      if (
        abort.signal.aborted ||
        this.state.scope !== scopeAtStart ||
        this.state.requestSeq !== seq
      ) {
        return;
      }
      const classified = classifyEstimateError(error);
      this.state = {
        ...this.state,
        loading: false,
        errorKind: classified.kind,
        retryAfterSeconds: classified.retryAfterSeconds,
      };
      this.emit();
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
