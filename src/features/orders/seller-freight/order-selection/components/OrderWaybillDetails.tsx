import { useTranslations } from 'next-intl';

import { OrderFreightCell, OrderShippingAmounts } from './OrderFreightCell';
import { OrderLifecycleBadge, WaybillTrackingChip } from './OrderStatusBadges';
import { formatOrderMoney } from '../../../lib/orderPresentation';

import type { SellerOrderDetail } from '../../../api/ordersApi';
import type { OrderFreightRow } from '../../shared';

type Fulfillment = SellerOrderDetail['fulfillmentOrders'][number];

function waybillMoney(order: SellerOrderDetail, child: Fulfillment | undefined) {
  const auto = child?.autoCod;
  if (auto) {
    return {
      goods: auto.goodsDueVnd,
      shipping: auto.quotedFeeVnd,
      total: auto.approvalShipmentId ? null : auto.finalCodVnd,
      pending: auto.finalCodVnd === null || !!auto.approvalShipmentId,
    };
  }
  const total = child?.codAmount;
  if (order.excelShipPolicy?.mode === 'CUSTOMER_CARRIER_QUOTE') {
    return { goods: total, shipping: null, total: null, pending: true };
  }
  if (total === undefined || order.collectionMode === 'DIRECT') {
    return { goods: null, shipping: null, total, pending: false };
  }
  const policy = order.excelShipPolicy;
  if (policy?.mode === 'CUSTOMER_FIXED') {
    const shipping = child?.sequenceNo === 1 ? policy.agreedFeeVnd : '0';
    // Allocation assigns the fixed customer fee to the first fulfillment.
    const goods = BigInt(total) - BigInt(shipping);
    if (goods >= BigInt(0)) return { goods: goods.toString(), shipping, total, pending: false };
  }
  if (order.shippingFeePayer === 'SENDER' || order.customerShippingFee === '0') {
    return { goods: total, shipping: '0', total, pending: false };
  }
  return { goods: null, shipping: null, total, pending: false };
}

interface OrderWaybillDetailsProps {
  parcelLabelSpan?: number;
  order: SellerOrderDetail;
  freight: Extract<OrderFreightRow, { state: 'VISIBLE' }>;
}

export function OrderWaybillDetails({
  order,
  freight,
  parcelLabelSpan = 1,
}: OrderWaybillDetailsProps) {
  const t = useTranslations('Orders');
  const waybills = freight.parcels.filter(
    (parcel): parcel is typeof parcel & { trackingNumber: string } =>
      Boolean(parcel.trackingNumber?.trim()),
  );
  const amount = (value: string | null | undefined) =>
    value === null || value === undefined ? '—' : formatOrderMoney(value);
  const cellClass = 'px-2.5 py-2 text-right text-xs tabular-nums';

  return waybills.map((waybill, index) => {
    const child = order.fulfillmentOrders.find(({ id }) => id === waybill.fulfillmentOrderId);
    const shipment = child?.shipments.find(
      ({ direction, trackingNumber }) =>
        direction === 'OUTBOUND' && trackingNumber === waybill.trackingNumber,
    );
    const status = shipment?.status ?? child?.status;
    const parcelNumber = child?.sequenceNo ?? waybill.parcelNumber;
    const money = waybillMoney(order, child);
    return (
      <tr
        key={waybill.fulfillmentOrderId ?? waybill.trackingNumber}
        id={index === 0 ? `waybill-details-${order.id}` : undefined}
        className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/50"
      >
        <th
          colSpan={parcelLabelSpan}
          scope="row"
          className="px-4 py-2 text-left text-xs font-medium"
        >
          {parcelNumber !== undefined
            ? t('waybillParcel', { number: parcelNumber })
            : t('collectionList.parcel')}
        </th>
        <td className="px-2.5 py-2">
          {status && t.has(`statuses.${status}`) ? (
            <OrderLifecycleBadge status={status} label={t(`statuses.${status}`)} />
          ) : (
            '—'
          )}
        </td>
        <td className="px-2.5 py-2">
          <WaybillTrackingChip
            trackingNumber={waybill.trackingNumber}
            carrierCode={waybill.carrierCode}
            compact
          />
        </td>
        <td className={cellClass}>{amount(money.goods)}</td>
        <td className={cellClass}>
          <OrderShippingAmounts
            customer={
              money.shipping === null && money.pending
                ? t('collectionList.shippingPending')
                : amount(money.shipping)
            }
            shop={<OrderFreightCell parcels={[waybill]} loading={false} />}
          />
        </td>
        <td className={`${cellClass} pr-4 font-semibold`}>
          {money.pending ? t('collectionList.totalPending') : amount(money.total)}
        </td>
      </tr>
    );
  });
}
