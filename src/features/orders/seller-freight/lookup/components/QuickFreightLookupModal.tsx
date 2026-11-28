import { useEffect, useMemo, useState } from 'react';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useProducts } from '@/features/catalog';

import { useOrderLocations } from '../../../hooks/useOrderLocations';
import {
  DEFAULT_FREIGHT_TIER_COPY,
  FreightTierCards,
  formatFreightVnd,
  type FreightTierCardCopy,
} from './FreightTierCards';
import { useQuickFreightLookup } from '../hooks/useQuickFreightLookup';
import {
  DEFAULT_QUICK_PARCEL,
  buildFreightDraftSeed,
  summarizeSkuLinesForParcel,
  type QuickLookupSkuLine,
  type QuickParcelSkuOption,
} from '../model/quickLookupController';
import {
  estimateInputSchema,
  preventInvalidIntegerKeyDown,
  validateExplicitVndField,
  validateParcelIntegerField,
  type FreightDraftSeed,
} from '../../shared';

export interface QuickLookupCopy {
  readonly title: string;
  readonly assumptionBanner: string;
  readonly emptyOriginsTitle: string;
  readonly originsError: string;
  readonly originLabel: string;
  readonly provinceLabel: string;
  readonly wardLabel: string;
  readonly parcelModeManual: string;
  readonly parcelModeSku: string;
  readonly searchSkuLabel: string;
  readonly weightLabel: string;
  readonly lengthLabel: string;
  readonly widthLabel: string;
  readonly heightLabel: string;
  readonly itemCountLabel: string;
  readonly declaredValueLabel: string;
  readonly codLabel: string;
  readonly submitLabel: string;
  readonly retryLabel: string;
  readonly createOrderLabel: string;
  readonly tierCopy: FreightTierCardCopy;
}

export const DEFAULT_QUICK_LOOKUP_COPY: QuickLookupCopy = {
  title: 'Tra cước dự kiến',
  assumptionBanner:
    'Tra cứu không tạo đơn, không giữ tồn và không cần tên hay số điện thoại người nhận. Kết quả tính cho giả định 1 kiện từ kho hợp đồng đã chọn.',
  emptyOriginsTitle:
    'Tài khoản chưa có kho ORCA hiệu lực trong hợp đồng hiện hành nên chưa thể tra cước.',
  originsError: 'Không tải được danh sách kho hợp đồng.',
  originLabel: 'Kho gửi giả định',
  provinceLabel: 'Tỉnh / Thành phố nhận',
  wardLabel: 'Phường / Xã nhận',
  parcelModeManual: 'Nhập thủ công',
  parcelModeSku: 'Chọn theo SKU',
  searchSkuLabel: 'Tìm SKU đang hoạt động',
  weightLabel: 'Cân nặng (g)',
  lengthLabel: 'Dài (cm)',
  widthLabel: 'Rộng (cm)',
  heightLabel: 'Cao (cm)',
  itemCountLabel: 'Số món',
  declaredValueLabel: 'Giá trị khai báo (đ)',
  codLabel: 'Thu hộ COD dự kiến (đ)',
  submitLabel: 'Tra cước',
  retryLabel: 'Thử lại',
  createOrderLabel: 'Tạo đơn với thông tin này',
  tierCopy: DEFAULT_FREIGHT_TIER_COPY,
};

interface QuickSkuRow {
  readonly product: QuickParcelSkuOption;
  readonly rawQty: string;
  readonly qty: number;
}

export function QuickFreightLookupModal({
  scope,
  isOpen,
  onClose,
  canQuote,
  canCreateOrder,
  onCreateOrderWithSeed,
  copy = DEFAULT_QUICK_LOOKUP_COPY,
}: {
  readonly scope: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly canQuote: boolean;
  readonly canCreateOrder: boolean;
  readonly onCreateOrderWithSeed: (seed: FreightDraftSeed) => void;
  readonly copy?: QuickLookupCopy;
}) {
  const lookup = useQuickFreightLookup({ scope, isOpen, enabled: canQuote });
  const locations = useOrderLocations(scope);

  const [toProvinceCode, setToProvinceCode] = useState('');
  const [toWardCode, setToWardCode] = useState('');
  const [parcelMode, setParcelMode] = useState<'MANUAL' | 'SKU'>('MANUAL');
  const [weightG, setWeightG] = useState(String(DEFAULT_QUICK_PARCEL.weightG));
  const [lengthCm, setLengthCm] = useState(String(DEFAULT_QUICK_PARCEL.lengthCm));
  const [widthCm, setWidthCm] = useState(String(DEFAULT_QUICK_PARCEL.widthCm));
  const [heightCm, setHeightCm] = useState(String(DEFAULT_QUICK_PARCEL.heightCm));
  const [itemCount, setItemCount] = useState(String(DEFAULT_QUICK_PARCEL.itemCount));
  const [declaredValueVnd, setDeclaredValueVnd] = useState('');
  const [codVnd, setCodVnd] = useState('');

  const [skuSearch, setSkuSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(skuSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [skuSearch]);
  const productFilters = useMemo(
    () => ({ search: debouncedSearch, isActive: 'true' as const }),
    [debouncedSearch],
  );
  const catalog = useProducts(productFilters);
  const [skuRows, setSkuRows] = useState<QuickSkuRow[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const markTouched = (field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  useEffect(() => {
    if (!isOpen) {
      setTouched({});
      setSubmitAttempted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setToProvinceCode('');
    setToWardCode('');
    setDeclaredValueVnd('');
    setCodVnd('');
    setSkuRows([]);
    setTouched({});
    setSubmitAttempted(false);
  }, [scope]);

  const validSkuLines: QuickLookupSkuLine[] = useMemo(
    () => skuRows.flatMap((row) => (row.qty >= 1 ? [{ product: row.product, qty: row.qty }] : [])),
    [skuRows],
  );

  const skuSummary = useMemo(
    () => (parcelMode === 'SKU' ? summarizeSkuLinesForParcel(validSkuLines) : null),
    [parcelMode, validSkuLines],
  );

  const handleApplySkuSummaryToInputs = (nextRows: readonly QuickSkuRow[]) => {
    const lines: QuickLookupSkuLine[] = nextRows.flatMap((row) =>
      row.qty >= 1 ? [{ product: row.product, qty: row.qty }] : [],
    );
    const summary = summarizeSkuLinesForParcel(lines);
    if (summary.totalWeightG > 0) setWeightG(String(Math.min(1_000_000, summary.totalWeightG)));
    if (summary.totalItemCount > 0) setItemCount(String(summary.totalItemCount));
    if (summary.parcel) {
      setLengthCm(String(summary.parcel.lengthCm));
      setWidthCm(String(summary.parcel.widthCm));
      setHeightCm(String(summary.parcel.heightCm));
    }
    setDeclaredValueVnd(lines.length > 0 ? summary.totalDeclaredValueVnd : '');
  };

  const handleAddSku = (product: QuickParcelSkuOption) => {
    setSkuRows((prev) => {
      const existing = prev.find((row) => row.product.id === product.id);
      const next = existing
        ? prev.map((row) =>
            row.product.id === product.id
              ? {
                  ...row,
                  qty: Math.min(100_000, row.qty + 1),
                  rawQty: String(Math.min(100_000, row.qty + 1)),
                }
              : row,
          )
        : [...prev, { product, qty: 1, rawQty: '1' }];
      handleApplySkuSummaryToInputs(next);
      return next;
    });
  };

  const handleUpdateSkuRawQty = (productId: string, rawValue: string) => {
    const check = validateParcelIntegerField(rawValue, {
      label: 'Số lượng SKU',
      min: 1,
      max: 100_000,
    });
    setSkuRows((prev) => {
      const next = prev.map((row) =>
        row.product.id === productId ? { ...row, rawQty: rawValue, qty: check.value ?? 0 } : row,
      );
      if (check.value !== null) {
        handleApplySkuSummaryToInputs(next);
      }
      return next;
    });
  };

  const handleRemoveSku = (productId: string) => {
    setSkuRows((prev) => {
      const next = prev.filter((row) => row.product.id !== productId);
      handleApplySkuSummaryToInputs(next);
      return next;
    });
  };

  const weightCheck = validateParcelIntegerField(weightG, {
    label: 'Cân nặng',
    min: 1,
    max: 1_000_000,
    unit: 'g',
  });
  const lengthCheck = validateParcelIntegerField(lengthCm, {
    label: 'Chiều dài',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });
  const widthCheck = validateParcelIntegerField(widthCm, {
    label: 'Chiều rộng',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });
  const heightCheck = validateParcelIntegerField(heightCm, {
    label: 'Chiều cao',
    min: 1,
    max: 1_000,
    unit: 'cm',
  });
  const itemCountCheck = validateParcelIntegerField(itemCount, {
    label: 'Số món',
    min: 1,
    max: 1_000_000,
  });
  const declaredCheck = validateExplicitVndField(declaredValueVnd, 'giá trị khai báo');
  const codCheck = validateExplicitVndField(codVnd, 'tiền thu hộ COD');

  const skuQtyErrors = useMemo(() => {
    const map: Record<string, string> = {};
    if (parcelMode !== 'SKU') return map;
    for (const row of skuRows) {
      const check = validateParcelIntegerField(row.rawQty, {
        label: `Số lượng ${row.product.sku}`,
        min: 1,
        max: 100_000,
      });
      if (check.error) map[row.product.id] = check.error;
    }
    return map;
  }, [parcelMode, skuRows]);

  const hasInvalidSkuRows =
    parcelMode === 'SKU' && (skuRows.length === 0 || Object.keys(skuQtyErrors).length > 0);
  const hasSkuWeightOverflow = parcelMode === 'SKU' && (skuSummary?.totalWeightG ?? 0) > 1_000_000;
  const hasSkuValueOverflow =
    parcelMode === 'SKU' &&
    skuSummary !== null &&
    BigInt(skuSummary.totalDeclaredValueVnd) > BigInt('999999999999');

  const originError =
    (touched.origin || submitAttempted) && !lookup.state.selectedOriginId
      ? 'Chọn kho hợp đồng để tra cước.'
      : undefined;
  const provinceError =
    (touched.province || submitAttempted) && !toProvinceCode
      ? 'Chọn tỉnh / thành phố nhận.'
      : undefined;
  const wardError =
    toProvinceCode && (touched.ward || submitAttempted) && !toWardCode
      ? 'Chọn phường / xã nhận.'
      : undefined;

  const showDimError = (key: string, check: ReturnType<typeof validateParcelIntegerField>) => {
    if (!check.error) return undefined;
    if (!check.isEmpty || touched[key] || submitAttempted) return check.error;
    return undefined;
  };
  const showMoneyError = (key: string, check: ReturnType<typeof validateExplicitVndField>) => {
    if (!check.error) return undefined;
    if (!check.isEmpty || touched[key] || submitAttempted) return check.error;
    return undefined;
  };

  const normalizedCandidateInput = useMemo(() => {
    if (
      hasInvalidSkuRows ||
      weightCheck.value === null ||
      lengthCheck.value === null ||
      widthCheck.value === null ||
      heightCheck.value === null ||
      itemCountCheck.value === null ||
      declaredCheck.value === null ||
      codCheck.value === null
    ) {
      return null;
    }
    const parsed = estimateInputSchema.safeParse({
      originWarehouseId: lookup.state.selectedOriginId,
      toProvinceCode,
      toWardCode,
      parcel: {
        weightG: weightCheck.value,
        lengthCm: lengthCheck.value,
        widthCm: widthCheck.value,
        heightCm: heightCheck.value,
        itemCount: itemCountCheck.value,
      },
      declaredValueVnd: declaredCheck.value,
      codVnd: codCheck.value,
    });
    return parsed.success ? parsed.data : null;
  }, [
    hasInvalidSkuRows,
    lookup.state.selectedOriginId,
    toProvinceCode,
    toWardCode,
    weightCheck.value,
    lengthCheck.value,
    widthCheck.value,
    heightCheck.value,
    itemCountCheck.value,
    declaredCheck.value,
    codCheck.value,
  ]);

  const freshness = lookup.checkFreshness(normalizedCandidateInput);

  const provinces = useMemo(
    () =>
      locations.locations
        .filter((loc) => loc.type === 'PROVINCE')
        .map((loc) => ({ value: loc.code, label: loc.name })),
    [locations.locations],
  );
  const wards = useMemo(
    () =>
      locations.locations
        .filter((loc) => loc.type === 'WARD' && loc.parentCode === toProvinceCode)
        .map((loc) => ({ value: loc.code, label: loc.name })),
    [locations.locations, toProvinceCode],
  );

  const handleEstimate = () => {
    setSubmitAttempted(true);
    if (!normalizedCandidateInput) {
      return;
    }
    setSubmitAttempted(false);
    void lookup.runEstimate(normalizedCandidateInput);
  };

  const handleCreateOrder = () => {
    const targetInput = normalizedCandidateInput ?? lookup.state.result?.input;
    if (!targetInput || !canCreateOrder) return;
    const seed = buildFreightDraftSeed({
      scope,
      seedId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      input: targetInput,
      deliveryTier: lookup.state.selectedTier,
      items: parcelMode === 'SKU' ? validSkuLines : [],
    });
    onClose();
    onCreateOrderWithSeed(seed);
  };

  const { state } = lookup;
  const showSummaryError = submitAttempted && normalizedCandidateInput === null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={copy.title} width="min(94vw, 720px)">
      <div className="w-full min-w-0 max-w-[calc(100vw-4.5rem)] space-y-4 overflow-x-hidden sm:max-w-full">
        <Alert variant="info">{copy.assumptionBanner}</Alert>

        {state.originsStatus === 'ERROR' && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{copy.originsError}</span>
              <Button type="button" variant="ghost" onClick={lookup.reloadOrigins}>
                {copy.retryLabel}
              </Button>
            </div>
          </Alert>
        )}

        {state.originsStatus === 'READY' && state.origins.length === 0 && (
          <Alert variant="warning">{copy.emptyOriginsTitle}</Alert>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={copy.originLabel}
            isRequired
            placeholder="Chọn kho hợp đồng"
            value={state.selectedOriginId}
            error={originError}
            onBlur={() => markTouched('origin')}
            onChange={(event) => {
              markTouched('origin');
              lookup.setSelectedOrigin(event.target.value);
            }}
            disabled={state.originsStatus !== 'READY' || state.origins.length === 0}
            options={state.origins.map((origin) => ({
              value: origin.id,
              label: `${origin.name} (${origin.code})`,
            }))}
          />
          <div className="min-w-0">
            <span className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]">
              Cách khai kiện
            </span>
            <div
              role="group"
              aria-label="Cách khai kiện"
              className="grid h-[42px] grid-cols-2 gap-1 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-1"
            >
              <button
                type="button"
                aria-pressed={parcelMode === 'MANUAL'}
                onClick={() => setParcelMode('MANUAL')}
                className={[
                  'whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors sm:text-sm',
                  parcelMode === 'MANUAL'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary-dark)] shadow-sm'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]',
                ].join(' ')}
              >
                {copy.parcelModeManual}
              </button>
              <button
                type="button"
                aria-pressed={parcelMode === 'SKU'}
                onClick={() => setParcelMode('SKU')}
                className={[
                  'whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors sm:text-sm',
                  parcelMode === 'SKU'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary-dark)] shadow-sm'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]',
                ].join(' ')}
              >
                {copy.parcelModeSku}
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={copy.provinceLabel}
            isRequired
            placeholder="Chọn tỉnh / thành phố"
            value={toProvinceCode}
            error={provinceError}
            onBlur={() => markTouched('province')}
            onChange={(event) => {
              markTouched('province');
              setToProvinceCode(event.target.value);
              setToWardCode('');
            }}
            disabled={locations.loading || locations.error}
            options={provinces}
          />
          <Select
            label={copy.wardLabel}
            isRequired
            placeholder={toProvinceCode ? 'Chọn phường / xã' : 'Chọn tỉnh / thành phố trước'}
            value={toWardCode}
            error={wardError}
            onBlur={() => markTouched('ward')}
            onChange={(event) => {
              markTouched('ward');
              setToWardCode(event.target.value);
            }}
            disabled={!toProvinceCode || locations.loading || locations.error}
            options={wards}
          />
        </div>

        {parcelMode === 'SKU' && (
          <div className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3">
            <Input
              label={copy.searchSkuLabel}
              type="search"
              value={skuSearch}
              onChange={(event) => setSkuSearch(event.target.value)}
              placeholder="Nhập tên hoặc mã SKU..."
            />
            {catalog.products.length > 0 && skuSearch.trim().length > 0 && (
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {catalog.products.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--sc-border-default)] px-2.5 py-1.5 text-sm"
                  >
                    <span className="truncate">
                      {product.name} ({product.sku})
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddSku(product)}
                    >
                      Chọn
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {skuRows.length === 0 && submitAttempted && (
              <Alert variant="error" compact>
                Chọn ít nhất 1 SKU trong danh mục hoặc chuyển sang &ldquo;{copy.parcelModeManual}
                &rdquo;.
              </Alert>
            )}

            {skuRows.length > 0 && (
              <ul className="space-y-2">
                {skuRows.map((row) => {
                  const qtyError = skuQtyErrors[row.product.id];
                  return (
                    <li key={row.product.id} className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {row.product.name} ({row.product.sku})
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Số lượng ${row.product.sku}`}
                            aria-invalid={qtyError ? true : undefined}
                            value={row.rawQty}
                            onKeyDown={preventInvalidIntegerKeyDown}
                            onChange={(event) =>
                              handleUpdateSkuRawQty(row.product.id, event.target.value)
                            }
                            className={[
                              'h-8 w-20 rounded border px-2 py-1 text-right text-sm tabular-nums outline-none',
                              qtyError
                                ? 'border-[var(--sc-error)]'
                                : 'border-[var(--sc-border-default)] focus:border-[var(--sc-primary)]',
                            ].join(' ')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Xóa ${row.product.sku}`}
                            onClick={() => handleRemoveSku(row.product.id)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </div>
                      {qtyError && (
                        <p className="text-xs text-[var(--sc-error-dark)]">{qtyError}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {hasSkuWeightOverflow && (
              <Alert variant="warning" compact>
                Tổng cân nặng từ danh sách SKU vượt mức tối đa 1.000.000 g. Kiểm tra lại số lượng
                hoặc số đo kiện.
              </Alert>
            )}
            {hasSkuValueOverflow && (
              <Alert variant="warning" compact>
                Tổng giá trị khai báo vượt 999.999.999.999 ₫. Vui lòng kiểm tra lại giá trị khai báo
                trước khi tra.
              </Alert>
            )}

            {skuSummary && skuSummary.needsManualReview && skuRows.length > 0 && (
              <Alert variant="warning">
                {skuSummary.reason === 'MISSING_PRODUCT_DIMENSIONS'
                  ? 'Một số SKU thiếu kích thước hoặc cân nặng. Vui lòng nhập số đo hộp dự kiến bên dưới.'
                  : 'Đơn nhiều sản phẩm: ORCA không tự cộng kích thước ba chiều. Vui lòng kiểm tra và chỉnh số đo kiện bên dưới.'}
              </Alert>
            )}
          </div>
        )}

        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-5">
          <Input
            label={copy.weightLabel}
            isRequired
            type="text"
            inputMode="numeric"
            value={weightG}
            error={showDimError('weightG', weightCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => markTouched('weightG')}
            onChange={(event) => setWeightG(event.target.value)}
          />
          <Input
            label={copy.lengthLabel}
            isRequired
            type="text"
            inputMode="numeric"
            value={lengthCm}
            error={showDimError('lengthCm', lengthCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => markTouched('lengthCm')}
            onChange={(event) => setLengthCm(event.target.value)}
          />
          <Input
            label={copy.widthLabel}
            isRequired
            type="text"
            inputMode="numeric"
            value={widthCm}
            error={showDimError('widthCm', widthCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => markTouched('widthCm')}
            onChange={(event) => setWidthCm(event.target.value)}
          />
          <Input
            label={copy.heightLabel}
            isRequired
            type="text"
            inputMode="numeric"
            value={heightCm}
            error={showDimError('heightCm', heightCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => markTouched('heightCm')}
            onChange={(event) => setHeightCm(event.target.value)}
          />
          <Input
            label={copy.itemCountLabel}
            isRequired
            type="text"
            inputMode="numeric"
            value={itemCount}
            error={showDimError('itemCount', itemCountCheck)}
            onKeyDown={preventInvalidIntegerKeyDown}
            onBlur={() => markTouched('itemCount')}
            onChange={(event) => setItemCount(event.target.value)}
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Input
              label={copy.declaredValueLabel}
              isRequired
              inputMode="numeric"
              placeholder="Nhập số tiền (nhập 0 nếu 0đ)"
              value={declaredValueVnd}
              onBlur={() => markTouched('declaredValue')}
              onChange={(event) => setDeclaredValueVnd(event.target.value)}
              error={showMoneyError('declaredValue', declaredCheck)}
              helperText={
                declaredCheck.value !== null
                  ? `Đã nhập: ${formatFreightVnd(declaredCheck.value)}`
                  : undefined
              }
            />
            {declaredValueVnd.trim().length === 0 && (
              <button
                type="button"
                onClick={() => {
                  markTouched('declaredValue');
                  setDeclaredValueVnd('0');
                }}
                className="text-xs font-medium text-[var(--sc-primary)] underline-offset-2 hover:underline"
              >
                Xác nhận giá trị khai báo 0 ₫
              </button>
            )}
          </div>
          <div className="space-y-1">
            <Input
              label={copy.codLabel}
              isRequired
              inputMode="numeric"
              placeholder="Nhập số tiền (nhập 0 nếu 0đ)"
              value={codVnd}
              onBlur={() => markTouched('cod')}
              onChange={(event) => setCodVnd(event.target.value)}
              error={showMoneyError('cod', codCheck)}
              helperText={
                codCheck.value !== null ? `Đã nhập: ${formatFreightVnd(codCheck.value)}` : undefined
              }
            />
            {codVnd.trim().length === 0 && (
              <button
                type="button"
                onClick={() => {
                  markTouched('cod');
                  setCodVnd('0');
                }}
                className="text-xs font-medium text-[var(--sc-primary)] underline-offset-2 hover:underline"
              >
                Không thu hộ (0 ₫)
              </button>
            )}
          </div>
        </div>

        {showSummaryError && (
          <Alert variant="error">
            Vui lòng kiểm tra các trường được đánh dấu lỗi hoặc còn trống trước khi tra cước.
          </Alert>
        )}

        {state.errorKind === 'RATE_LIMITED' && (
          <Alert variant="warning">
            Bạn đã đạt giới hạn tần suất tra cước
            {state.retryAfterSeconds ? `. Thử lại sau ${state.retryAfterSeconds}s.` : '.'}
          </Alert>
        )}
        {state.errorKind === 'TEMPORARILY_UNAVAILABLE' && (
          <Alert variant="error">
            Dịch vụ hãng vận chuyển tạm thời gián đoạn. Vui lòng thử lại sau ít phút.
          </Alert>
        )}
        {state.errorKind === 'ORIGIN_UNAVAILABLE' && (
          <Alert variant="error">
            Kho vừa chọn không còn nằm trong hợp đồng hiệu lực hoặc phiên không có quyền tra cước.
          </Alert>
        )}
        {(state.errorKind === 'INVALID_INPUT' || state.errorKind === 'UNKNOWN') && (
          <Alert variant="error">
            Không thể tra cước cho tuyến hoặc thông số kiện này. Vui lòng kiểm tra lại.
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            isLoading={state.loading}
            disabled={state.origins.length === 0 || !canQuote}
            onClick={handleEstimate}
          >
            {copy.submitLabel}
          </Button>
        </div>

        {state.result && (
          <FreightTierCards
            result={state.result}
            selectedTier={state.selectedTier}
            onSelectTier={lookup.setSelectedTier}
            freshnessReason={freshness.reason}
            copy={copy.tierCopy}
          />
        )}

        {canCreateOrder && state.result && (
          <div className="flex justify-end border-t border-[var(--sc-border-default)] pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!normalizedCandidateInput}
              onClick={handleCreateOrder}
            >
              {copy.createOrderLabel}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
