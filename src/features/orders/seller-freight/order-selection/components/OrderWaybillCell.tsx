import type { OrderFreightRow } from '../../shared';

import { FreightStateBadge, WaybillTrackingChip } from './OrderStatusBadges';

export function OrderWaybillCell({
  row,
  orderKind,
  loading,
}: {
  readonly row: OrderFreightRow | undefined;
  readonly orderKind?: 'SALES' | 'WITHDRAWAL';
  readonly loading: boolean;
}) {
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

  if (trackedParcels.length > 0) {
    const primary = trackedParcels[0];
    const secondary = trackedParcels[1];
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
        {secondary && (
          <WaybillTrackingChip
            trackingNumber={secondary.trackingNumber}
            carrierCode={secondary.carrierCode}
            compact
          />
        )}
        {trackedParcels.length > 2 && (
          <span className="text-[11px] font-medium text-[var(--sc-text-secondary)]">
            +{trackedParcels.length - 2} mã vận đơn khác
          </span>
        )}
        {isPartial && (
          <span className="whitespace-nowrap text-[11px] text-[var(--sc-text-secondary)]">
            {trackedParcels.length}/{totalParcels} kiện có mã
          </span>
        )}
      </div>
    );
  }

  if (row.parcels.some((parcel) => parcel.freight.state === 'BOOKING_PENDING')) {
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
