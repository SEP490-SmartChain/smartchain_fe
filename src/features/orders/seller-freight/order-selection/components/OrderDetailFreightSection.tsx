import { useTranslations } from 'next-intl';
import { Alert, Badge, Button } from '@/components/Common';

import {
  DEFAULT_FREIGHT_TIER_COPY,
  formatFreightVnd,
  formatOriginDisplayName,
  formatVietnamTime,
} from '../../lookup/components/FreightTierCards';
import type { OrderFreightRow, ParcelFreight } from '../../shared';

import { ReviewFreightPrice } from './OrderFreightCell';
import { FreightStateBadge, WaybillTrackingChip } from './OrderStatusBadges';

function renderParcelDetails(freight: ParcelFreight) {
  switch (freight.state) {
    case 'APPROVED':
      return (
        <span className="font-semibold tabular-nums">{formatFreightVnd(freight.amountVnd)}</span>
      );
    case 'REVIEW_REQUIRED':
      return <ReviewFreightPrice freight={freight} />;
    case 'RECORDED':
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-[var(--sc-text-primary)]">
            Đã ghi nhận:{' '}
            <span className="whitespace-nowrap tabular-nums">
              {formatFreightVnd(freight.amountVnd)}
            </span>
          </span>
          <span className="text-xs text-[var(--sc-text-secondary)]">
            Ghi nhận lúc {formatVietnamTime(freight.recordedAt)}
          </span>
        </div>
      );
    case 'ESTIMATED':
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[var(--sc-text-primary)]">
              {freight.basis === 'ASSUMED' ? 'Dự kiến cho 1 kiện: ' : 'Ước tính kiện đã đóng: '}
              <span className="whitespace-nowrap tabular-nums">
                {formatFreightVnd(freight.amountVnd)}
              </span>
            </span>
            <span className="text-xs text-[var(--sc-text-secondary)]">
              {formatOriginDisplayName(freight.origin.name, freight.origin.code)} ·{' '}
              {DEFAULT_FREIGHT_TIER_COPY.tierLabels[freight.tier]}
            </span>
          </div>
          <p className="text-xs text-[var(--sc-text-secondary)]">
            Cập nhật lúc {formatVietnamTime(freight.quotedAt)} (chỉ mang tính ước tính trước vận
            đơn).
          </p>
        </div>
      );
    case 'BOOKING_PENDING':
      return (
        <p className="text-xs text-[var(--sc-text-secondary)]">
          Kiện đang trong quá trình tạo vận đơn với đơn vị vận chuyển; hệ thống không hỏi lại giá
          lúc này.
        </p>
      );
    case 'RECORDED_FEE_MISSING':
      return (
        <p className="text-xs text-[var(--sc-warning-dark)]">
          Vận đơn đã xác nhận nhưng thiếu chứng từ cước ghi nhận.
        </p>
      );
    case 'NOT_APPLICABLE':
      return (
        <p className="text-xs text-[var(--sc-text-secondary)]">
          Không áp dụng tra cước cho kiện hoặc loại phiếu này.
        </p>
      );
    case 'NEEDS_INPUT':
      return (
        <p className="text-xs text-[var(--sc-text-secondary)]">
          Cần xác nhận giả định 1 kiện, kho gửi hoặc kích thước trước khi hỏi hãng.
        </p>
      );
    case 'NOT_QUOTED':
      return <p className="text-xs text-[var(--sc-text-secondary)]">Kiện chưa tra cước dự kiến.</p>;
    case 'UNAVAILABLE':
      return (
        <p className="text-xs text-[var(--sc-warning-dark)]">
          {freight.reason === 'ORIGIN_UNAVAILABLE'
            ? 'Kho không còn nằm trong hợp đồng hiệu lực để tra cước mới.'
            : freight.reason === 'ORDER_DATA_CHANGED'
              ? 'Dữ liệu đơn vừa thay đổi trong lúc tra cước. Vui lòng thử lại.'
              : freight.reason === 'ORDER_DATA_INCOMPLETE'
                ? 'Thiếu thông tin tỉnh/phường hoặc kiện trên đơn.'
                : DEFAULT_FREIGHT_TIER_COPY.reasonLabels[freight.reason]}
        </p>
      );
  }
}

export function OrderDetailFreightSection({
  row,
  loading,
  canQuote,
  onLookupOrder,
}: {
  readonly row: OrderFreightRow | undefined;
  readonly loading: boolean;
  readonly canQuote: boolean;
  readonly onLookupOrder: () => void;
}) {
  const t = useTranslations('Orders.collectionList');
  const visibleRow = row?.state === 'VISIBLE' ? row : null;
  const isAllRecorded =
    visibleRow !== null &&
    visibleRow.parcels.length > 0 &&
    visibleRow.parcels.every((p) => p.freight.state === 'RECORDED');
  const hasNeedsInput = visibleRow?.parcels.some((p) => p.freight.state === 'NEEDS_INPUT') ?? false;
  const hasQuotableParcel =
    !row ||
    (visibleRow !== null &&
      visibleRow.parcels.some(
        (p) =>
          p.freight.state === 'NOT_QUOTED' ||
          p.freight.state === 'NEEDS_INPUT' ||
          p.freight.state === 'UNAVAILABLE' ||
          p.freight.state === 'ESTIMATED',
      ));
  const lookupButtonLabel = hasNeedsInput
    ? 'Nhập số đo & tra cước'
    : visibleRow !== null &&
        visibleRow.parcels.some((p) => p.freight.state === 'ESTIMATED') &&
        !visibleRow.parcels.some((p) => p.freight.state === 'NOT_QUOTED')
      ? 'Tra lại cước dự kiến'
      : 'Tra cước kiện chưa có vận đơn';

  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4"
      data-testid="order-detail-freight-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">Cước ORCA</h3>
        {isAllRecorded ? (
          <Badge status="success" label="Đã chốt theo vận đơn" />
        ) : (
          canQuote &&
          hasQuotableParcel && (
            <Button type="button" variant="secondary" isLoading={loading} onClick={onLookupOrder}>
              {lookupButtonLabel}
            </Button>
          )
        )}
      </div>

      {!row && (
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {loading ? 'Đang tải trạng thái cước...' : 'Chưa có dữ liệu cước.'}
        </p>
      )}

      {visibleRow && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleRow.recorded.count > 0 && visibleRow.recorded.subtotalVnd !== null && (
              <div className="min-w-0 rounded-lg border border-[var(--sc-border-default)] border-l-2 border-l-[var(--sc-primary)] bg-[var(--sc-bg-secondary)] p-3 text-sm">
                <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
                  {visibleRow.parcelCount !== null &&
                  visibleRow.recorded.count === visibleRow.parcelCount
                    ? 'Tổng cước đã ghi nhận'
                    : `Phần đã ghi nhận (${visibleRow.recorded.count}/${visibleRow.parcelCount ?? visibleRow.parcels.length} kiện)`}
                </span>
                <p className="mt-0.5 whitespace-nowrap text-base font-bold tabular-nums text-[var(--sc-text-primary)]">
                  {formatFreightVnd(visibleRow.recorded.subtotalVnd)}
                </p>
              </div>
            )}

            {visibleRow.estimated.count > 0 && visibleRow.estimated.subtotalVnd !== null && (
              <div className="min-w-0 rounded-lg border border-[var(--sc-border-default)] border-l-2 border-l-[var(--sc-info)] bg-[var(--sc-bg-secondary)] p-3 text-sm">
                <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
                  {visibleRow.parcelCount === null
                    ? 'Dự kiến cho 1 kiện'
                    : `Phần ước tính (${visibleRow.estimated.count}/${visibleRow.parcelCount} kiện)`}
                </span>
                <p className="mt-0.5 whitespace-nowrap text-base font-bold tabular-nums text-[var(--sc-text-primary)]">
                  {formatFreightVnd(visibleRow.estimated.subtotalVnd)}
                </p>
              </div>
            )}
          </div>

          {visibleRow.recorded.count > 0 && visibleRow.estimated.count > 0 && (
            <Alert variant="info">
              Đơn có kiện đã xác nhận vận đơn và kiện chưa có vận đơn nên hiển thị hai phần riêng
              biệt, không cộng gộp.
            </Alert>
          )}

          <ul className="space-y-2.5">
            {visibleRow.parcels.map((parcel, idx) => (
              <li
                key={parcel.fulfillmentOrderId ?? `unallocated-${idx}`}
                className="min-w-0 space-y-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--sc-text-primary)]">
                      {parcel.fulfillmentOrderId
                        ? parcel.parcelNumber
                          ? t('parcelNumber', { number: parcel.parcelNumber })
                          : t('parcel')
                        : 'Giả định 1 kiện (chưa phân bổ kho)'}
                    </span>
                    {parcel.trackingNumber ? (
                      <WaybillTrackingChip
                        trackingNumber={parcel.trackingNumber}
                        carrierCode={parcel.carrierCode}
                        compact
                      />
                    ) : (
                      parcel.fulfillmentOrderId && (
                        <span className="text-[11px] text-[var(--sc-text-tertiary)]">
                          Chưa cấp mã vận đơn
                        </span>
                      )
                    )}
                  </div>
                  <FreightStateBadge
                    state={parcel.freight.state}
                    label={t('freightStates.' + parcel.freight.state)}
                  />
                </div>
                {renderParcelDetails(parcel.freight)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
