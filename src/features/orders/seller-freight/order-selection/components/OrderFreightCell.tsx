import { Calculator, PackagePlus } from 'lucide-react';

import { Button } from '@/components/Common';

import {
  DEFAULT_FREIGHT_TIER_COPY,
  formatFreightVnd,
} from '../../lookup/components/FreightTierCards';
import type { OrderFreightRow, ParcelFreight } from '../../shared';

import { FreightStateBadge } from './OrderStatusBadges';

function parcelSummaryLine(freight: ParcelFreight): string {
  switch (freight.state) {
    case 'RECORDED':
      return `Đã ghi: ${formatFreightVnd(freight.amountVnd)}`;
    case 'ESTIMATED':
      return `Dự kiến${freight.basis === 'ASSUMED' ? ' (1 kiện)' : ''}: ${formatFreightVnd(freight.amountVnd)}`;
    case 'BOOKING_PENDING':
      return 'Đang tạo vận đơn';
    case 'RECORDED_FEE_MISSING':
      return 'Đã xác nhận, chờ phí';
    case 'NOT_APPLICABLE':
      return 'Không áp dụng';
    case 'NEEDS_INPUT':
      return 'Cần nhập kiện/kho';
    case 'NOT_QUOTED':
      return 'Chưa tra cước';
    case 'UNAVAILABLE':
      if (freight.reason === 'ORIGIN_UNAVAILABLE') return 'Kho ngoài hợp đồng';
      if (freight.reason === 'ORDER_DATA_CHANGED') return 'Đơn vừa thay đổi';
      if (freight.reason === 'ORDER_DATA_INCOMPLETE') return 'Thiếu thông tin đơn';
      return DEFAULT_FREIGHT_TIER_COPY.reasonLabels[freight.reason];
  }
}

export function OrderFreightCell({
  row,
  loading,
  canQuote,
  onQuickLookup,
}: {
  readonly row: OrderFreightRow | undefined;
  readonly loading: boolean;
  readonly canQuote: boolean;
  readonly onQuickLookup?: () => void;
}) {
  if (!row) {
    return (
      <div className="flex flex-col items-start gap-1.5 text-xs text-[var(--sc-text-secondary)]">
        <span>{loading ? 'Đang kiểm tra...' : 'Chưa tra cước'}</span>
        {canQuote && onQuickLookup && !loading && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onQuickLookup}
          >
            <Calculator size={13} aria-hidden="true" />
            Tra cước
          </Button>
        )}
      </div>
    );
  }

  if (row.state === 'NOT_FOUND') {
    return <span className="text-xs text-[var(--sc-text-tertiary)]">—</span>;
  }

  const hasRecorded = row.recorded.count > 0 && row.recorded.subtotalVnd !== null;
  const hasEstimated = row.estimated.count > 0 && row.estimated.subtotalVnd !== null;
  const isMixed = hasRecorded && hasEstimated;
  const allRecordedKnown =
    row.parcelCount !== null && row.parcelCount > 0 && row.recorded.count === row.parcelCount;
  const needsQuoteAction =
    canQuote &&
    onQuickLookup &&
    row.parcels.some(
      (p) =>
        p.freight.state === 'NOT_QUOTED' ||
        p.freight.state === 'NEEDS_INPUT' ||
        p.freight.state === 'UNAVAILABLE',
    );
  const firstNeedsInput = row.parcels.find((p) => p.freight.state === 'NEEDS_INPUT');

  return (
    <div
      className="flex flex-col items-start gap-1.5 text-xs"
      data-testid={`order-freight-cell-${row.orderId}`}
    >
      {hasRecorded && row.recorded.subtotalVnd !== null && (
        <div className="flex flex-col items-start gap-0.5">
          <FreightStateBadge
            variant="dot"
            state="RECORDED"
            label={
              isMixed || !allRecordedKnown
                ? `Đã ghi (${row.recorded.count}/${row.parcelCount ?? row.parcels.length} kiện)`
                : 'Đã ghi nhận'
            }
          />
          <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[var(--sc-text-primary)]">
            {formatFreightVnd(row.recorded.subtotalVnd)}
          </span>
        </div>
      )}

      {hasEstimated && row.estimated.subtotalVnd !== null && (
        <div className="flex flex-col items-start gap-0.5">
          <FreightStateBadge
            variant="dot"
            state="ESTIMATED"
            label={
              row.parcelCount === null
                ? 'Dự kiến (1 kiện)'
                : isMixed
                  ? `Ước tính (${row.estimated.count}/${row.parcelCount} kiện)`
                  : 'Ước tính'
            }
          />
          <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[var(--sc-text-primary)]">
            {formatFreightVnd(row.estimated.subtotalVnd)}
          </span>
        </div>
      )}

      {!hasRecorded && !hasEstimated && row.parcels[0] && (
        <FreightStateBadge
          variant="dot"
          state={row.parcels[0].freight.state}
          label={parcelSummaryLine(row.parcels[0].freight)}
        />
      )}

      {needsQuoteAction && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={loading}
          className="h-7 px-2.5 text-xs"
          onClick={onQuickLookup}
        >
          {firstNeedsInput ? (
            <PackagePlus size={13} aria-hidden="true" />
          ) : (
            <Calculator size={13} aria-hidden="true" />
          )}
          {firstNeedsInput ? 'Nhập kiện & tra' : 'Tra cước'}
        </Button>
      )}
    </div>
  );
}
