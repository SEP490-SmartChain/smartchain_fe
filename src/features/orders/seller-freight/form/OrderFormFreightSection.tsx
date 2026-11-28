import { useEffect, useMemo, useState } from 'react';

import { Alert, Button, Input, Select } from '@/components/Common';

import { FreightTierCards, formatFreightVnd } from '../lookup/components/FreightTierCards';
import { useQuickFreightLookup } from '../lookup/hooks/useQuickFreightLookup';
import type { QuickParcelSkuOption } from '../lookup/model/quickLookupController';
import {
  preventInvalidIntegerKeyDown,
  validateParcelIntegerField,
  type FreightDraftSeed,
  type Tier,
} from '../shared';
import type { ManualDraft } from '../../api/ordersApi';
import {
  createInitialFormParcel,
  deriveFormFreightContext,
  evaluateFormQuoteApply,
  type FormParcelAssumptions,
} from './formFreightModel';

interface ManualParcelRaw {
  readonly weightG: string;
  readonly lengthCm: string;
  readonly widthCm: string;
  readonly heightCm: string;
}

function parcelToRaw(parcel: FormParcelAssumptions): ManualParcelRaw {
  return {
    weightG: String(parcel.weightG),
    lengthCm: String(parcel.lengthCm),
    widthCm: String(parcel.widthCm),
    heightCm: String(parcel.heightCm),
  };
}

export function OrderFormFreightSection({
  scope,
  isOpen,
  canQuote,
  draft,
  products,
  initialSeed,
  selectedTier,
  onSelectTier,
  onApplyCalculatedShippingCharge,
}: {
  readonly scope: string;
  readonly isOpen: boolean;
  readonly canQuote: boolean;
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
  readonly initialSeed: FreightDraftSeed | null;
  readonly selectedTier: Tier;
  readonly onSelectTier: (tier: Tier) => void;
  readonly onApplyCalculatedShippingCharge: (amountVnd: string) => void;
}) {
  const lookup = useQuickFreightLookup({ scope, isOpen, enabled: canQuote });
  const [manualParcel, setManualParcel] = useState<FormParcelAssumptions>(() =>
    createInitialFormParcel(initialSeed),
  );
  const [manualParcelRaw, setManualParcelRaw] = useState<ManualParcelRaw>(() =>
    parcelToRaw(createInitialFormParcel(initialSeed)),
  );
  const [parcelTouched, setParcelTouched] = useState<Record<string, boolean>>({});
  const [useCustomParcelOverride, setUseCustomParcelOverride] = useState(Boolean(initialSeed));
  const [appliedCodVnd, setAppliedCodVnd] = useState<string | null>(null);
  const [appliedQuoteAmount, setAppliedQuoteAmount] = useState<string | null>(null);

  const { setSelectedOrigin, setSelectedTier } = lookup;

  useEffect(() => {
    if (initialSeed) {
      setSelectedOrigin(initialSeed.assumedOriginWarehouseId);
      setManualParcel({ ...initialSeed.assumedParcel });
      setManualParcelRaw(parcelToRaw(initialSeed.assumedParcel));
      setUseCustomParcelOverride(true);
      setParcelTouched({});
    }
  }, [initialSeed, setSelectedOrigin]);

  useEffect(() => {
    setSelectedTier(selectedTier);
  }, [selectedTier, setSelectedTier]);

  const entryMode = draft.entryMode === 'DIRECT' ? 'DIRECT' : 'CALCULATED';
  const context = useMemo(
    () =>
      deriveFormFreightContext({
        scope,
        originWarehouseId: lookup.state.selectedOriginId,
        draft,
        products,
        manualParcel,
        useCustomParcelOverride,
      }),
    [scope, lookup.state.selectedOriginId, draft, products, manualParcel, useCustomParcelOverride],
  );

  const freshness = lookup.checkFreshness(context.estimateInput);
  const rawShippingPaid = draft.paymentBreakdown?.shippingPaidAmount || '0';
  const normalizedShippingPaid = rawShippingPaid.trim().replace(/[., \u00a0\u202f]/g, '');
  const isShippingPaidValid = /^(0|[1-9]\d{0,11})$/.test(normalizedShippingPaid);
  const applyCheck = useMemo(
    () =>
      evaluateFormQuoteApply({
        scope,
        activeScope: lookup.state.scope,
        currentKey: context.inputKey,
        quoteKey: lookup.state.quotedKey,
        result: lookup.state.result,
        selectedTier,
        entryMode,
        shippingPaidAmount: rawShippingPaid,
        nowMs: lookup.nowMs,
      }),
    [
      scope,
      lookup.state.scope,
      context.inputKey,
      lookup.state.quotedKey,
      lookup.state.result,
      selectedTier,
      entryMode,
      rawShippingPaid,
      lookup.nowMs,
    ],
  );

  const missingEstimateHint = useMemo(() => {
    if (context.estimateInput || lookup.state.origins.length === 0) return null;
    if (!draft.toProvinceCode.trim() || !draft.toWardCode.trim()) {
      return 'Chọn tỉnh/phường nhận ở mục Người nhận để bật Tra cước dự kiến.';
    }
    if (context.invalidDeclaredValue) {
      return 'Giá trị khai báo phải là số nguyên từ 0 đến 999.999.999.999 VND để tra cước dự kiến.';
    }
    if (context.codVnd === null) {
      return entryMode === 'DIRECT'
        ? 'Nhập tổng cần thu khi giao (nhập 0 nếu đơn 0đ) để bật Tra cước dự kiến.'
        : 'Nhập đủ số lượng, đơn giá sản phẩm và chi tiết thanh toán hợp lệ để bật Tra cước dự kiến.';
    }
    return 'Kiểm tra lại kích thước kiện (cân nặng 1–1.000.000 g; dài/rộng/cao 1–1.000 cm) để bật Tra cước dự kiến.';
  }, [
    context.estimateInput,
    context.invalidDeclaredValue,
    context.codVnd,
    lookup.state.origins.length,
    draft.toProvinceCode,
    draft.toWardCode,
    entryMode,
  ]);

  if (!canQuote) {
    return null;
  }

  const displayedRaw = useCustomParcelOverride
    ? manualParcelRaw
    : {
        weightG: String(context.parcel.weightG),
        lengthCm: String(context.parcel.lengthCm),
        widthCm: String(context.parcel.widthCm),
        heightCm: String(context.parcel.heightCm),
      };

  const weightCheck = validateParcelIntegerField(displayedRaw.weightG, {
    label: 'Cân nặng',
    min: 1,
    max: 1_000_000,
    unit: 'g',
  });
  const lengthCheck = validateParcelIntegerField(displayedRaw.lengthCm, {
    label: 'Chiều dài',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });
  const widthCheck = validateParcelIntegerField(displayedRaw.widthCm, {
    label: 'Chiều rộng',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });
  const heightCheck = validateParcelIntegerField(displayedRaw.heightCm, {
    label: 'Chiều cao',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });

  const showDimError = (
    key: keyof ManualParcelRaw,
    check: ReturnType<typeof validateParcelIntegerField>,
  ) => {
    if (!check.error) return undefined;
    if (!check.isEmpty || parcelTouched[key]) return check.error;
    return undefined;
  };

  const codStaleAfterApply =
    entryMode === 'CALCULATED' &&
    appliedCodVnd !== null &&
    context.codVnd !== null &&
    appliedCodVnd !== context.codVnd &&
    freshness.reason === 'INPUT_CHANGED';

  const applyDisabledReason =
    entryMode === 'CALCULATED' &&
    !applyCheck.allowed &&
    applyCheck.reason === 'PAID_EXCEEDS_QUOTE' &&
    isShippingPaidValid
      ? `Phí giao hàng khách đã trả (${formatFreightVnd(normalizedShippingPaid)}) lớn hơn cước dự kiến nên không thể áp dụng.`
      : null;

  const handleUpdateParcelDim = (field: keyof ManualParcelRaw, rawValue: string) => {
    const limits =
      field === 'weightG'
        ? { label: 'Cân nặng', min: 1, max: 1_000_000, unit: 'g' }
        : { label: field, min: 1, max: 1_000, unit: 'cm' };
    const check = validateParcelIntegerField(rawValue, limits);
    const baseParcel = useCustomParcelOverride ? manualParcel : context.parcel;
    const baseRaw = useCustomParcelOverride
      ? manualParcelRaw
      : {
          weightG: String(context.parcel.weightG),
          lengthCm: String(context.parcel.lengthCm),
          widthCm: String(context.parcel.widthCm),
          heightCm: String(context.parcel.heightCm),
        };
    setUseCustomParcelOverride(true);
    setManualParcelRaw({ ...baseRaw, [field]: rawValue });
    setManualParcel({
      ...baseParcel,
      [field]: check.value ?? 0,
    });
  };

  const handleEstimate = () => {
    if (!context.estimateInput) return;
    void lookup.runEstimate(context.estimateInput);
  };

  const handleApplyTier = (tier: Tier, amountVnd: string) => {
    if (entryMode !== 'CALCULATED' || !applyCheck.allowed || tier !== selectedTier) {
      return;
    }
    setAppliedQuoteAmount(amountVnd);
    setAppliedCodVnd(context.codVnd);
    onApplyCalculatedShippingCharge(amountVnd);
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4"
      data-testid="order-form-freight-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">
            Cước ORCA dự kiến
          </h3>
          <p className="text-xs text-[var(--sc-text-secondary)]">
            Dự kiến cho 1 kiện từ kho hợp đồng giả định. Số tiền này tách biệt với phí giao hàng thu
            khách.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          isLoading={lookup.state.loading}
          disabled={!context.estimateInput || lookup.state.origins.length === 0}
          onClick={handleEstimate}
        >
          {codStaleAfterApply ? 'Tra lại theo COD mới' : 'Tra cước dự kiến'}
        </Button>
      </div>

      {lookup.state.originsStatus === 'ERROR' && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Chưa tải được danh sách kho hợp đồng. Bạn vẫn có thể tiếp tục tạo đơn.</span>
            <Button type="button" variant="ghost" onClick={lookup.reloadOrigins}>
              Thử lại
            </Button>
          </div>
        </Alert>
      )}

      {lookup.state.originsStatus === 'READY' && lookup.state.origins.length === 0 && (
        <Alert variant="warning">
          Tài khoản chưa có kho hợp đồng hiệu lực để tra cước trước. Bạn vẫn có thể tạo đơn nếu dịch
          vụ đang hoạt động.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Kho gửi giả định (chỉ để tra cước)"
          value={lookup.state.selectedOriginId}
          onChange={(event) => lookup.setSelectedOrigin(event.target.value)}
          disabled={lookup.state.originsStatus !== 'READY' || lookup.state.origins.length === 0}
          options={lookup.state.origins.map((origin) => ({
            value: origin.id,
            label: `${origin.name} (${origin.code})`,
          }))}
        />
        <div className="rounded border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3 py-2 text-xs text-[var(--sc-text-secondary)]">
          <div>
            Kiện tạm tính:{' '}
            <span className="font-medium tabular-nums text-[var(--sc-text-primary)]">
              {context.parcel.weightG}g
            </span>{' '}
            ·{' '}
            <span className="tabular-nums">
              {context.parcel.lengthCm}×{context.parcel.widthCm}×{context.parcel.heightCm} cm
            </span>{' '}
            · <span>{context.parcel.itemCount} món</span>
          </div>
          <div>
            COD hỏi hãng:{' '}
            <span className="font-medium tabular-nums text-[var(--sc-text-primary)]">
              {context.codVnd !== null ? formatFreightVnd(context.codVnd) : 'Chưa đủ'}
            </span>
          </div>
        </div>
      </div>

      {(context.needsParcelBoxReview || useCustomParcelOverride) && (
        <div className="grid grid-cols-2 gap-2 rounded border border-[var(--sc-border-default)] p-2.5 sm:grid-cols-4">
          <Input
            label="Cân nặng (g)"
            isRequired
            type="text"
            inputMode="numeric"
            value={displayedRaw.weightG}
            error={showDimError('weightG', weightCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => setParcelTouched((p) => ({ ...p, weightG: true }))}
            onChange={(event) => handleUpdateParcelDim('weightG', event.target.value)}
          />
          <Input
            label="Dài (cm)"
            isRequired
            type="text"
            inputMode="numeric"
            value={displayedRaw.lengthCm}
            error={showDimError('lengthCm', lengthCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => setParcelTouched((p) => ({ ...p, lengthCm: true }))}
            onChange={(event) => handleUpdateParcelDim('lengthCm', event.target.value)}
          />
          <Input
            label="Rộng (cm)"
            isRequired
            type="text"
            inputMode="numeric"
            value={displayedRaw.widthCm}
            error={showDimError('widthCm', widthCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => setParcelTouched((p) => ({ ...p, widthCm: true }))}
            onChange={(event) => handleUpdateParcelDim('widthCm', event.target.value)}
          />
          <Input
            label="Cao (cm)"
            isRequired
            type="text"
            inputMode="numeric"
            value={displayedRaw.heightCm}
            error={showDimError('heightCm', heightCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => setParcelTouched((p) => ({ ...p, heightCm: true }))}
            onChange={(event) => handleUpdateParcelDim('heightCm', event.target.value)}
          />
        </div>
      )}

      {missingEstimateHint && (
        <p className="text-xs text-[var(--sc-text-secondary)]">{missingEstimateHint}</p>
      )}

      {lookup.state.errorKind === 'RATE_LIMITED' && (
        <Alert variant="warning">
          Đạt giới hạn tra cước tạm thời
          {lookup.state.retryAfterSeconds ? ` (${lookup.state.retryAfterSeconds}s)` : ''}. Form tạo
          đơn vẫn hoạt động bình thường.
        </Alert>
      )}
      {lookup.state.errorKind === 'TEMPORARILY_UNAVAILABLE' && (
        <Alert variant="warning">
          Không kết nối được dịch vụ báo giá tạm thời. Bạn vẫn có thể tiếp tục tạo đơn.
        </Alert>
      )}
      {lookup.state.errorKind === 'ORIGIN_UNAVAILABLE' && (
        <Alert variant="warning">Kho giả định hiện không đủ điều kiện tra cước.</Alert>
      )}

      {codStaleAfterApply && appliedQuoteAmount && (
        <Alert variant="info">
          Đã sao chép {formatFreightVnd(appliedQuoteAmount)} vào phí giao hàng thu khách; tiền thu
          hộ COD vừa cập nhật theo mức này. Bấm &ldquo;Tra lại theo COD mới&rdquo; nếu muốn xem báo
          giá ứng với COD mới (không tự sửa ô tiền bạn đang nhập).
        </Alert>
      )}

      {lookup.state.result && (
        <FreightTierCards
          result={lookup.state.result}
          selectedTier={selectedTier}
          onSelectTier={(tier) => {
            onSelectTier(tier);
            lookup.setSelectedTier(tier);
          }}
          freshnessReason={freshness.reason}
          onApplyTier={entryMode === 'CALCULATED' ? handleApplyTier : undefined}
          applyLabel={entryMode === 'CALCULATED' ? 'Dùng mức này' : undefined}
          applyDisabledReason={applyDisabledReason}
        />
      )}
    </section>
  );
}
