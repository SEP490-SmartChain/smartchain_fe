import { useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Tabs } from '@/components/Common';

import { OrderPaymentSummary } from './OrderPaymentSummary';
import { orderHistoryReasonKey, orderReasonKey } from '../lib/orderFeedback';
import { formatOrderDate, formatOrderMoney, orderStatusTone } from '../lib/orderPresentation';

import type { SellerOrderDetail } from '../api/ordersApi';

export function OrderDetail({ order }: { order: SellerOrderDetail }) {
  const t = useTranslations('Orders');
  const locale = useLocale();
  const [detailTab, setDetailTab] = useState('overview');
  const status = (value: string) =>
    t.has(`statuses.${value}`) ? t(`statuses.${value}`) : t('processing');
  const owner = order.codAmount !== undefined;
  const direct = order.collectionMode === 'DIRECT' || order.kind === 'WITHDRAWAL';
  const heading = 'text-base font-semibold';
  const history = [...order.statusHistory].sort(
    (a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt),
  );
  const latest = history[0];
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h3 className="break-words text-xl font-semibold">{order.externalOrderCode}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge status={orderStatusTone(order.status)} label={status(order.status)} />
          <span className="text-[var(--sc-text-secondary)]">
            {order.kind === 'WITHDRAWAL'
              ? t('withdrawalOrder')
              : order.sourceChannel === 'manual'
                ? t('manual_channel')
                : order.sourceChannel}
          </span>
        </div>
        <p className="text-xs text-[var(--sc-text-secondary)]">
          {t('created_at')}:{' '}
          <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt, locale)}</time>
        </p>
      </header>
      {order.status === 'VALIDATED' && order.holdReason !== 'CANCEL_PENDING' && (
        <Alert role="status">{t('allocationQueuedHint')}</Alert>
      )}
      {order.status === 'BACKORDER' &&
        !order.backorderReminder &&
        order.holdReason !== 'CANCEL_PENDING' && (
          <Alert variant="warning" role="status">
            {t('backorderHint')}
          </Alert>
        )}
      {order.holdReason && <Alert variant="warning">{t(orderReasonKey(order.holdReason))}</Alert>}
      {order.status === 'BACKORDER' &&
        order.backorderReminder &&
        order.holdReason !== 'CANCEL_PENDING' && (
          <Alert variant="warning" role="status">
            {t('backorderReminder')}
          </Alert>
        )}
      <Tabs
        label={t('detailTabs')}
        tabs={[
          { id: 'overview', label: t('overviewTab') },
          { id: 'allocation', label: t('allocationTab') },
        ]}
        activeId={detailTab}
        onChange={setDetailTab}
      />
      {detailTab === 'allocation' ? (
        <section className="space-y-4" aria-label={t('allocationTab')}>
          <Alert>{t('allocationExplanation')}</Alert>
          {!order.fulfillmentOrders.length && <p>{t('allocationPending')}</p>}
          {order.fulfillmentOrders.map((child) => (
            <article
              key={child.id}
              className="rounded-xl border border-[var(--sc-border-default)] p-4"
            >
              <h4 className="font-semibold">{child.warehouseName ?? t('warehouse_unavailable')}</h4>
              <p className="mt-2 text-sm">
                {child.allocation?.reason === 'EXPIRY_FIRST'
                  ? t('expiryFirst')
                  : child.allocation?.reason === 'TOTAL_COST'
                    ? t('totalCost')
                    : child.allocation?.reason === 'NEAREST_WAREHOUSE'
                      ? t('nearestWarehouse')
                      : t('allocationUnavailable')}
              </p>
              <ul className="mt-3 space-y-2">
                {child.allocation?.lots.map((lot) => (
                  <li key={`${lot.sku}-${lot.lotCode}-${lot.binCode}`} className="text-sm">
                    {lot.sku} ·{' '}
                    {t('allocationLot', { lot: lot.lotCode, bin: lot.binCode, qty: lot.qty })}
                    {lot.expiresOn && ` · ${lot.expiresOn}`}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : (
        <>
          {owner && (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <section className="min-w-0 rounded-xl border border-[var(--sc-border-default)] p-4">
                <h4 className={heading}>{t('recipientOverview')}</h4>
                <p className="mt-3 break-words font-medium">{order.recipientName}</p>
                <p className="mt-1 text-sm">{order.recipientPhone}</p>
                <p className="mt-2 break-words text-sm text-[var(--sc-text-secondary)]">
                  {[order.recipientAddress, order.wardName, order.provinceName]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {order.deliveryNote && (
                  <p className="mt-3 break-words text-sm">
                    <span className="font-medium">{t('deliveryNote')}: </span>
                    {order.deliveryNote}
                  </p>
                )}
              </section>
              {order.kind === 'WITHDRAWAL' ? (
                <Alert>{t('withdrawalFees')}</Alert>
              ) : (
                <OrderPaymentSummary payment={order} isSnapshot />
              )}
            </div>
          )}
          <section>
            {direct && (
              <p className="mb-3 text-sm text-[var(--sc-text-secondary)]">
                {t('allocationValueHint')}
              </p>
            )}
            <h4 className={`${heading} mb-3`}>
              {t('items')}{' '}
              <span className="font-normal text-[var(--sc-text-secondary)]">
                ({order.items.length})
              </span>
            </h4>
            {order.items.some((item) => item.identitySource === 'CURRENT_CATALOG') && (
              <p className="mb-3 text-sm text-[var(--sc-text-secondary)]">
                {t('legacy_product_identity')}
              </p>
            )}
            {order.items.length ? (
              <>
                <ul aria-label={t('items')} className="space-y-3 sm:hidden">
                  {order.items.map((item) => (
                    <li
                      key={item.productId}
                      className="rounded-lg border border-[var(--sc-border-default)] p-3 text-sm"
                    >
                      <p className="break-words font-medium">
                        {item.productName ?? item.sku ?? t('product_unavailable')}
                      </p>
                      {item.productName && item.sku && (
                        <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
                          {item.sku}
                        </p>
                      )}
                      <dl className="mt-3 space-y-2">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--sc-text-secondary)]">{t('quantity')}</dt>
                          <dd className="tabular-nums">{item.qty}</dd>
                        </div>
                        {owner && (
                          <>
                            <div className="flex items-baseline justify-between gap-3">
                              <dt className="text-[var(--sc-text-secondary)]">
                                {t(direct ? 'allocationUnitValue' : 'unitPriceShort')}
                              </dt>
                              <dd className="shrink-0 tabular-nums">
                                {item.unitPrice === undefined
                                  ? '—'
                                  : formatOrderMoney(item.unitPrice)}
                              </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-3">
                              <dt className="text-[var(--sc-text-secondary)]">
                                {t(direct ? 'allocationLineValue' : 'line_total')}
                              </dt>
                              <dd className="shrink-0 font-medium tabular-nums">
                                {item.unitPrice === undefined
                                  ? '—'
                                  : formatOrderMoney(
                                      (BigInt(item.qty) * BigInt(item.unitPrice)).toString(),
                                    )}
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    </li>
                  ))}
                  {owner && order.items.length > 1 && order.totalAmount !== undefined && (
                    <li className="flex items-baseline justify-between gap-3 text-sm font-medium">
                      <span>{t(direct ? 'allocationTotalValue' : 'goods_total')}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatOrderMoney(order.totalAmount)}
                      </span>
                    </li>
                  )}
                </ul>
                <div className="hidden overflow-x-auto rounded-lg border border-[var(--sc-border-default)] sm:block">
                  <table aria-label={t('items')} className="w-full text-sm">
                    <thead className="bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                      <tr>
                        <th scope="col" className="p-3 text-left font-medium">
                          {t('product')}
                        </th>
                        <th scope="col" className="p-3 text-right font-medium">
                          {t('quantity')}
                        </th>
                        {owner && (
                          <>
                            <th scope="col" className="p-3 text-right font-medium">
                              {t(direct ? 'allocationUnitValue' : 'unitPriceShort')}
                            </th>
                            <th scope="col" className="p-3 text-right font-medium">
                              {t(direct ? 'allocationLineValue' : 'line_total')}
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr
                          key={item.productId}
                          className="border-t border-[var(--sc-border-default)]"
                        >
                          <td className="min-w-32 p-3">
                            <p className="break-words font-medium">
                              {item.productName ?? item.sku ?? t('product_unavailable')}
                            </p>
                            {item.productName && item.sku && (
                              <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
                                {item.sku}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">{item.qty}</td>
                          {owner && (
                            <>
                              <td className="whitespace-nowrap p-3 text-right tabular-nums">
                                {item.unitPrice === undefined
                                  ? '—'
                                  : formatOrderMoney(item.unitPrice)}
                              </td>
                              <td className="whitespace-nowrap p-3 text-right tabular-nums">
                                {item.unitPrice === undefined
                                  ? '—'
                                  : formatOrderMoney(
                                      (BigInt(item.qty) * BigInt(item.unitPrice)).toString(),
                                    )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {owner && order.items.length > 1 && order.totalAmount !== undefined && (
                      <tfoot className="border-t border-[var(--sc-border-default)]">
                        <tr>
                          <th scope="row" colSpan={3} className="p-3 text-left font-medium">
                            {t(direct ? 'allocationTotalValue' : 'goods_total')}
                          </th>
                          <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                            {formatOrderMoney(order.totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('itemsUnavailable')}</p>
            )}
          </section>
          <section>
            <h4 className={`${heading} mb-2`}>{t('deliveryOverview')}</h4>
            {!order.fulfillmentOrders.length && (
              <p className="text-sm text-[var(--sc-text-secondary)]">
                {t(
                  [
                    'RECEIVED',
                    'VALIDATING',
                    'VALIDATED',
                    'ALLOCATING',
                    'MANUAL_REVIEW',
                    'ON_HOLD',
                    'BACKORDER',
                  ].includes(order.status)
                    ? 'deliveryPending'
                    : 'noDeliveryRecorded',
                )}
              </p>
            )}
            <div className="space-y-3">
              {order.fulfillmentOrders.map((child) => (
                <article
                  key={child.id}
                  className="rounded-lg border border-[var(--sc-border-default)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-semibold">
                      {t('deliveryNumber', { number: child.sequenceNo })}
                    </h5>
                    <Badge status={orderStatusTone(child.status)} label={status(child.status)} />
                  </div>
                  <p className="mt-2 break-words text-sm">
                    {t('warehouse')}: {child.warehouseName ?? t('warehouse_pending')}
                  </p>
                  {child.shipments.length ? (
                    child.shipments.map((shipment) => (
                      <p key={shipment.id} className="mt-2 break-words text-sm">
                        {t(shipment.direction === 'RETURN' ? 'returnTracking' : 'trackingLabel')}:{' '}
                        {shipment.trackingNumber ?? t('tracking_pending')} ·{' '}
                        {status(shipment.status)}
                        {!shipment.active && <span> · {t('inactiveShipment')}</span>}
                        {['UNKNOWN', 'CANCEL_UNKNOWN', 'FAILED', 'CANCEL_REQUESTED'].includes(
                          shipment.bookingState,
                        ) && (
                          <span className="block text-[var(--sc-warning-dark)]">
                            {t.has(`bookingStates.${shipment.bookingState}`)
                              ? t(`bookingStates.${shipment.bookingState}`)
                              : t('processing')}
                          </span>
                        )}
                      </p>
                    ))
                  ) : (
                    <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
                      {t('tracking_pending')}
                    </p>
                  )}
                  <details className="mt-3 text-sm">
                    <summary className="rounded font-medium focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                      {t('deliveryDetails')}
                    </summary>
                    {child.codAmount !== undefined && (
                      <p className="mt-3">
                        {t('childCod')}: {formatOrderMoney(child.codAmount)}
                      </p>
                    )}
                    <ul className="mt-2 space-y-1">
                      {child.items.map((item) => (
                        <li key={item.productId} className="break-words">
                          {item.productName ?? item.sku ?? t('product_unavailable')} × {item.qty}
                          {item.productName && item.sku && (
                            <span className="block break-all text-xs text-[var(--sc-text-secondary)]">
                              {item.sku}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 font-medium">{t('parcels')}</p>
                    {!child.parcels.length && <p>{t('packing_pending')}</p>}
                    {child.parcels.map((parcel, index) => (
                      <p key={parcel.id}>
                        {t('parcel_number', { number: index + 1 })} ·{' '}
                        {parcel.actualWeightG === null
                          ? t('weight_pending')
                          : `${parcel.actualWeightG} g`}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
            </div>
          </section>
          <details className="rounded-lg border border-[var(--sc-border-default)] p-4">
            <summary className="rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
              {t('history')} ({history.length})
            </summary>
            <ol className="mt-4 space-y-3">
              {history.map((entry) => {
                const reasonKey = orderHistoryReasonKey(entry.reason);
                return (
                  <li
                    key={`${entry.changedAt}-${entry.fromStatus}-${entry.toStatus}-${entry.reason}`}
                    className="border-l-2 border-[var(--sc-primary)] pl-3 text-sm"
                  >
                    <time
                      dateTime={entry.changedAt}
                      className="text-xs text-[var(--sc-text-secondary)]"
                    >
                      {formatOrderDate(entry.changedAt, locale)}
                    </time>
                    <p>
                      {entry.fromStatus ? `${status(entry.fromStatus)} → ` : ''}
                      {status(entry.toStatus)}
                    </p>
                    {reasonKey && (
                      <p className="mt-1 text-[var(--sc-text-secondary)]">{t(reasonKey)}</p>
                    )}
                  </li>
                );
              })}
            </ol>
            {!history.length && <p className="mt-3 text-sm">{t('history_empty')}</p>}
          </details>
          {latest && history.length > 1 && (
            <p className="text-xs text-[var(--sc-text-secondary)]">
              {t('latestUpdate')}: {formatOrderDate(latest.changedAt, locale)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
