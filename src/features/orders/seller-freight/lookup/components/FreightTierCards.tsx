import { useRef, type ReactNode } from 'react';

import { Alert, Button } from '@/components/Common';

import type { EstimateResult, QuoteReason, Tier } from '../../shared';

export function formatOriginDisplayName(name: string, code: string): string {
  const trimmed = name.trim();
  const label = /^kho\b/i.test(trimmed) ? trimmed : `Kho ${trimmed}`;
  return `${label} (${code})`;
}

export interface FreightTierCardCopy {
  readonly tierLabels: Record<Tier, string>;
  readonly reasonLabels: Record<QuoteReason, string>;
  readonly etaDays: (days: number) => string;
  readonly etaUnavailable: string;
  readonly staleNotice: string;
  readonly expiredNotice: string;
  readonly oneParcelNotice: (originName: string, originCode: string) => string;
  readonly quotedAtLabel: (formattedTime: string) => string;
}

export const DEFAULT_FREIGHT_TIER_COPY: FreightTierCardCopy = {
  tierLabels: {
    ECONOMY: 'Tiết kiệm',
    BALANCED: 'Cân bằng',
    EXPRESS: 'Nhanh',
  },
  reasonLabels: {
    TEMPORARY: 'Nhà vận chuyển tạm thời không phản hồi. Hãy thử lại.',
    ADDRESS_UNMAPPED: 'Tuyến/phường nhận chưa hỗ trợ dịch vụ này.',
    ETA_UNAVAILABLE: 'Chưa đủ thông tin thời gian giao dự kiến cho gói này.',
    NO_QUOTE: 'Chưa có báo giá phù hợp từ đơn vị vận chuyển.',
    UNSERVICEABLE: 'Kiện vượt quá giới hạn kích thước hoặc cân nặng của dịch vụ.',
  },
  etaDays: (days) => `Dự kiến ~${days} ngày`,
  etaUnavailable: 'Chưa có ước tính số ngày',
  staleNotice: 'Thông tin kiện, địa chỉ hoặc COD vừa thay đổi. Bấm tra lại để cập nhật giá.',
  expiredNotice: 'Báo giá đã quá 5 phút. Vui lòng tra lại để lấy mức mới nhất.',
  oneParcelNotice: (name, code) => `Dự kiến cho 1 kiện · Từ ${formatOriginDisplayName(name, code)}`,
  quotedAtLabel: (time) => `Cập nhật lúc ${time}`,
};

export function formatFreightVnd(amountVnd: string): string {
  const numeric = Number(amountVnd);
  if (Number.isSafeInteger(numeric)) {
    return `${numeric.toLocaleString('vi-VN')} ₫`;
  }
  return `${amountVnd} ₫`;
}

export function formatVietnamTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function FreightTierCards({
  result,
  selectedTier,
  onSelectTier,
  freshnessReason = 'OK',
  onApplyTier,
  applyLabel,
  applyDisabledReason,
  copy = DEFAULT_FREIGHT_TIER_COPY,
  footerSlot,
}: {
  readonly result: EstimateResult;
  readonly selectedTier: Tier;
  readonly onSelectTier: (tier: Tier) => void;
  readonly freshnessReason?: 'OK' | 'EMPTY' | 'INPUT_CHANGED' | 'SCOPE_CHANGED' | 'EXPIRED';
  readonly onApplyTier?: (tier: Tier, amountVnd: string) => void;
  readonly applyLabel?: string;
  readonly applyDisabledReason?: string | null;
  readonly copy?: FreightTierCardCopy;
  readonly footerSlot?: ReactNode;
}) {
  const isStale = freshnessReason !== 'OK';
  const tierRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hasSelectedInTiers = result.tiers.some((t) => t.tier === selectedTier);

  return (
    <div className="space-y-3" data-testid="freight-tier-cards">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--sc-text-secondary)]">
        <span className="font-medium text-[var(--sc-text-primary)]">
          {copy.oneParcelNotice(result.origin.name, result.origin.code)}
        </span>
        <span className="tabular-nums">
          {copy.quotedAtLabel(formatVietnamTime(result.quotedAt))}
        </span>
      </div>

      {freshnessReason === 'EXPIRED' && <Alert variant="warning">{copy.expiredNotice}</Alert>}
      {freshnessReason === 'INPUT_CHANGED' && <Alert variant="warning">{copy.staleNotice}</Alert>}

      <div
        role="radiogroup"
        aria-label="Mức giao hàng dự kiến"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {result.tiers.map((tierItem, index) => {
          const isSelected = tierItem.tier === selectedTier;
          const isQuoted = tierItem.status === 'QUOTED';

          return (
            <div
              key={tierItem.tier}
              ref={(el) => {
                tierRefs.current[index] = el;
              }}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!hasSelectedInTiers && index === 0) ? 0 : -1}
              onClick={() => onSelectTier(tierItem.tier)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTier(tierItem.tier);
                  return;
                }
                let nextIndex: number | null = null;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  nextIndex = (index + 1) % result.tiers.length;
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  nextIndex = (index - 1 + result.tiers.length) % result.tiers.length;
                }
                if (nextIndex !== null) {
                  event.preventDefault();
                  const nextTier = result.tiers[nextIndex]?.tier;
                  if (nextTier) {
                    onSelectTier(nextTier);
                    tierRefs.current[nextIndex]?.focus();
                  }
                }
              }}
              className={[
                'flex cursor-pointer flex-col justify-between gap-2 rounded-lg border p-3.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--sc-accent)]',
                isSelected
                  ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)] shadow-sm'
                  : isQuoted
                    ? 'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] hover:border-[var(--sc-border-strong)]'
                    : 'border-dashed border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] hover:border-[var(--sc-border-strong)]',
                isStale ? 'opacity-75' : '',
              ].join(' ')}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                    {copy.tierLabels[tierItem.tier]}
                  </span>
                  {isSelected && (
                    <span className="whitespace-nowrap rounded bg-[var(--sc-primary)] px-1.5 py-0.5 text-[11px] font-medium text-white">
                      Đang chọn
                    </span>
                  )}
                </div>

                {isQuoted ? (
                  <>
                    <p className="whitespace-nowrap text-lg font-bold tabular-nums text-[var(--sc-text-primary)]">
                      {formatFreightVnd(tierItem.amountVnd)}
                    </p>
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {tierItem.deliveryDays !== null
                        ? copy.etaDays(tierItem.deliveryDays)
                        : copy.etaUnavailable}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--sc-warning-dark)]">
                    {copy.reasonLabels[tierItem.reason]}
                  </p>
                )}
              </div>

              {isQuoted && isSelected && onApplyTier && applyLabel && (
                <div className="space-y-1 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isStale || Boolean(applyDisabledReason)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onApplyTier(tierItem.tier, tierItem.amountVnd);
                    }}
                  >
                    {applyLabel}
                  </Button>
                  {applyDisabledReason && (
                    <p className="text-[11px] text-[var(--sc-error-dark)]">{applyDisabledReason}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footerSlot}
    </div>
  );
}
