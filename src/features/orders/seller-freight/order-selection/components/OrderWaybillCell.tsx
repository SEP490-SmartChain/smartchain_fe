import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common';

import type { OrderFreightRow } from '../../shared';

import { FreightStateBadge, WaybillTrackingChip } from './OrderStatusBadges';

export function OrderWaybillCell({
  row,
  orderKind,
  loading,
  expanded = false,
  onToggle,
}: {
  readonly row: OrderFreightRow | undefined;
  readonly orderKind?: 'SALES' | 'WITHDRAWAL';
  readonly loading: boolean;
  readonly expanded?: boolean;
  readonly onToggle?: () => void;
}) {
  const t = useTranslations('Orders');

  if (orderKind === 'WITHDRAWAL') {
    return (
      <span className="text-xs text-[var(--sc-text-tertiary)]" title="Không áp dụng">
        —
      </span>
    );
  }

  if (!row) {
    return (
      <span className="whitespace-nowrap text-xs text-[var(--sc-text-tertiary)]">
        {loading ? 'Đang tải...' : 'Chưa có vận đơn'}
      </span>
    );
  }

  if (row.state === 'NOT_FOUND') {
    return <span className="text-xs text-[var(--sc-text-tertiary)]">—</span>;
  }

  const trackedParcels = row.parcels.filter(
    (parcel): parcel is typeof parcel & { trackingNumber: string } =>
      Boolean(parcel.trackingNumber && parcel.trackingNumber.trim().length > 0),
  );

  if (trackedParcels.length === 1) {
    const primary = trackedParcels[0];
    const totalParcels = row.parcelCount ?? row.parcels.length;
    const isPartial = totalParcels > trackedParcels.length;

    return (
      <div className="flex flex-col items-start gap-1" data-testid={`order-waybill-${row.orderId}`}>
        {primary && (
          <WaybillTrackingChip
            trackingNumber={primary.trackingNumber}
            carrierCode={primary.carrierCode}
            compact
          />
        )}
        {isPartial && (
          <span className="whitespace-nowrap text-[11px] text-[var(--sc-text-secondary)]">
            {trackedParcels.length}/{totalParcels} kiện có mã
          </span>
        )}
      </div>
    );
  }

  if (trackedParcels.length > 1) {
    const totalParcels = row.parcelCount ?? row.parcels.length;
    const isPartial = totalParcels > trackedParcels.length;

    return (
      <div className="flex flex-col items-start gap-1" data-testid={`order-waybill-${row.orderId}`}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          aria-controls={expanded ? `waybill-details-${row.orderId}` : undefined}
          onClick={onToggle}
          className="h-7 px-2.5 text-xs"
        >
          {t(expanded ? 'hideWaybills' : 'viewWaybills', { count: trackedParcels.length })}
          {expanded ? (
            <ChevronUp size={13} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} aria-hidden="true" />
          )}
        </Button>
        {isPartial && (
          <span className="whitespace-nowrap text-[11px] text-[var(--sc-text-secondary)]">
            {trackedParcels.length}/{totalParcels} kiện có mã
          </span>
        )}
      </div>
    );
  }

  if (
    row.parcels.some(
      ({ freight }) =>
        freight.state === 'BOOKING_PENDING' ||
        (freight.state === 'APPROVED' && freight.bookingState === 'BOOKING_PENDING'),
    )
  ) {
    return <FreightStateBadge variant="dot" state="BOOKING_PENDING" label="Đang cấp mã" />;
  }

  if (row.parcels.some((parcel) => parcel.freight.state === 'NOT_APPLICABLE')) {
    return (
      <span className="whitespace-nowrap text-xs text-[var(--sc-text-tertiary)]">
        Không áp dụng
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap text-xs text-[var(--sc-text-tertiary)]">
      Chưa có vận đơn
    </span>
  );
}
