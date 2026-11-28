import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const originalFetch = globalThis.fetch;
const id = (sequence) => `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
const ok = (data) => Response.json({ success: true, data });
const sampleOption = {
  optionRef: id(22),
  parcels: [{ parcelRef: id(25), carrierName: 'GHN', serviceName: 'Standard', amountVnd: '25000' }],
  totalVnd: '25000',
};
const samplePacked = {
  awaitingInitial: false,
  parcels: [
    {
      fulfillmentOrderId: id(25),
      parcelNumber: 2,
      reviewRef: id(31),
      reason: 'PRICE_CHANGED',
      previousAmountVnd: '25000',
      previousServiceName: 'Standard',
      options: [
        {
          optionRef: id(32),
          carrierName: 'GHN',
          serviceName: 'Standard',
          amountVnd: '28000',
          codVnd: '148000',
        },
      ],
      expiresAt: '2026-11-28T10:00:00.000Z',
    },
  ],
};

let server;
let review;
let parseOrder;
let notificationTarget;
let useAuthStore;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  review = await server.ssrLoadModule('/src/features/orders/api/dispatchReviewApi.ts');
  ({ parseOrder } = await server.ssrLoadModule('/src/features/orders/api/ordersApi.ts'));
  ({ notificationTarget } = await server.ssrLoadModule('/src/lib/notificationTarget.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({
    user: {
      userId: id(1),
      tenantId: id(2),
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      email: 'seller@example.test',
      fullName: 'Seller',
      permissions: [],
    },
    accessToken: 'seller-test-token',
    expiresIn: 900,
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('a shared tier can quote ten orders and only explicitly kept option references are sent for confirmation', async () => {
  const orderIds = Array.from({ length: 10 }, (_, index) => id(index + 10));
  const items = orderIds.map((orderId) => ({ orderId }));
  const kept = [0, 2, 3, 4, 7].map((index) => ({
    orderId: orderIds[index],
    optionRef: id(index + 40),
  }));
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async (url, request) => {
    calls++;
    assert.equal(request.headers.get('Authorization'), 'Bearer seller-test-token');
    assert.equal(request.signal, controller.signal);
    if (url.endsWith('/suggestions')) {
      assert.deepEqual(JSON.parse(request.body), {
        items,
        deliveryTier: 'BALANCED',
        includeQuoteValidity: true,
      });
      return ok({
        items: orderIds.map((orderId) => ({
          orderId,
          state: 'QUOTED',
          options: [sampleOption],
          recommendedRef: sampleOption.optionRef,
        })),
      });
    }
    assert.ok(url.endsWith('/confirm'));
    assert.equal(request.headers.get('Idempotency-Key'), id(99));
    assert.deepEqual(JSON.parse(request.body), { items: kept });
    return ok({ items: kept.map(({ orderId }) => ({ orderId, state: 'ACCEPTED' })) });
  };
  assert.equal(
    (await review.dispatchReviewApi.suggest({ items, deliveryTier: 'BALANCED' }, controller.signal))
      .length,
    10,
  );
  assert.equal((await review.dispatchReviewApi.confirm(kept, id(99), controller.signal)).length, 5);
  assert.equal(calls, 2);
});

test('packed notice resolves exact parcel and approval sends only its current review / option references', async () => {
  const orderId = id(11);
  const [{ fulfillmentOrderId, reviewRef, options }] = samplePacked.parcels;
  const query = `?orderId=${orderId}&parcelId=${fulfillmentOrderId}`;
  assert.equal(notificationTarget(query, 'orderId'), orderId);
  assert.equal(notificationTarget(query, 'parcelId'), fulfillmentOrderId);
  assert.equal(notificationTarget(`${query}&parcelId=${id(37)}`, 'parcelId'), null);
  const selection = { reviewRef, optionRef: options[0].optionRef };
  globalThis.fetch = async (url, request) => {
    if (request.method === 'GET') {
      assert.ok(url.endsWith(`/dispatch-review/orders/${orderId}`));
      return ok(samplePacked);
    }
    assert.ok(url.endsWith(`/dispatch-review/orders/${orderId}/packed-confirm`));
    assert.deepEqual(JSON.parse(request.body), selection);
    return ok({ accepted: true });
  };
  const detail = await review.dispatchReviewApi.packed(orderId);
  assert.equal(detail.parcels[0].options[0].codVnd, '148000');
  assert.equal(detail.parcels[0].previousAmountVnd, '25000');
  assert.deepEqual(await review.dispatchReviewApi.confirmPacked(orderId, selection), {
    accepted: true,
  });
});

test('owner-specific state stays out of staff orders and internal rates fail closed on packed approval', () => {
  const row = {
    id: id(11),
    externalOrderCode: 'D11-01',
    sourceChannel: 'manual',
    status: 'ALLOCATED',
    createdAt: '2026-11-28T10:00:00.000Z',
    updatedAt: '2026-11-28T10:00:00.000Z',
    holdReason: null,
    version: 1,
  };
  const ownerRow = {
    ...row,
    codAmount: '0',
    totalAmount: '0',
    declaredValue: '0',
    customerShippingFee: '0',
    shippingFeePayer: 'SENDER',
    dispatchReviewState: 'AWAITING_PACKED',
  };
  assert.equal(parseOrder(ownerRow, true).dispatchReviewState, 'AWAITING_PACKED');
  assert.throws(() => parseOrder({ ...row, dispatchReviewState: 'AWAITING_PACKED' }, false));
  const leaking = structuredClone(samplePacked);
  leaking.parcels[0].options[0].purchaseVnd = '23000';
  assert.equal(review.packedDispatchReviewSchema.safeParse(leaking).success, false);
});

test('D11 FE components render cleanly and vi/en messages include service names and per-reason copy', async () => {
  const [
    { OrderDispatchReview },
    { PackedOrderDispatchReview },
    { FreightMarkupSettings },
    { SellerDispatchPolicySettings },
  ] = await Promise.all([
    server.ssrLoadModule('/src/features/orders/components/OrderDispatchReview.tsx'),
    server.ssrLoadModule('/src/features/orders/components/PackedOrderDispatchReview.tsx'),
    server.ssrLoadModule('/src/features/catalog/components/FreightMarkupSettings.tsx'),
    server.ssrLoadModule('/src/features/orders/components/SellerDispatchPolicySettings.tsx'),
  ]);
  const vi = JSON.parse(read('messages/vi.json'));
  const en = JSON.parse(read('messages/en.json'));

  for (const [lang, messages] of [
    ['vi', vi],
    ['en', en],
  ]) {
    assert.ok(
      messages.Notifications.events.seller_dispatch_price_changed.body.includes('{serviceName}'),
      `${lang} price_changed body must include serviceName`,
    );
    assert.ok(
      messages.Notifications.events.seller_dispatch_service_unavailable.body.includes(
        '{serviceName}',
      ),
      `${lang} service_unavailable body must include serviceName`,
    );
    assert.equal(
      typeof messages.Notifications.events.seller_dispatch_price_changed.bodyWithoutService,
      'string',
    );
    assert.equal(
      typeof messages.Notifications.events.seller_dispatch_service_unavailable.bodyWithoutService,
      'string',
    );
    for (const reason of [
      'ORDER_NOT_ALLOCATED',
      'ORIGIN_UNAVAILABLE',
      'ADDRESS_UNMAPPED',
      'ETA_UNAVAILABLE',
      'UNSERVICEABLE',
      'RATE_LIMIT',
      'NO_QUOTE',
    ]) {
      assert.equal(typeof messages.OrderReview.reasons[reason], 'string', `${lang} ${reason}`);
    }
    assert.equal(typeof messages.OrderReview.editDimensions, 'string');
    assert.equal(typeof messages.OrderReview.retryOrder, 'string');
    assert.equal(typeof messages.OrderReview.priceChangedHint, 'string');
    assert.equal(typeof messages.OrderReview.serviceUnavailableHint, 'string');
    assert.equal(typeof messages.OrderReview.newPriceLabel, 'string');
    assert.equal(typeof messages.OrderReview.priceUnchanged, 'string');
  }

  const wrap = (node) =>
    renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'vi', timeZone: 'Asia/Ho_Chi_Minh', messages: vi },
        node,
      ),
    );

  const batchHtml = wrap(
    createElement(OrderDispatchReview, {
      scope: 'test',
      orders: [
        { id: id(11), externalOrderCode: 'D11-01' },
        { id: id(12), externalOrderCode: 'D11-02' },
      ],
      onAccepted: () => {},
    }),
  );
  assert.match(batchHtml, /D11-01/);
  assert.match(batchHtml, /D11-02/);
  assert.match(batchHtml, /Lấy báo giá vận chuyển/);

  const packedHtml = wrap(
    createElement(PackedOrderDispatchReview, {
      scope: 'test',
      orderId: id(11),
      initialParcelId: id(25),
      onChanged: () => {},
    }),
  );
  assert.match(packedHtml, /Đang tải thông tin duyệt gửi/);

  const markupHtml = wrap(createElement(FreightMarkupSettings, { onLoaded: () => {} }));
  assert.match(markupHtml, /Mức cộng cước vận chuyển/);

  const policyHtml = wrap(createElement(SellerDispatchPolicySettings, {}));
  assert.match(policyHtml, /Xác nhận gửi hàng/);

  const sellerOrdersSrc = read('src/features/orders/components/SellerOrders.tsx');
  assert.match(
    sellerOrdersSrc,
    /setFilters\(trimmedFilters\);\s*setReviewSelection\(new Set\(\)\);/,
  );
  assert.match(sellerOrdersSrc, /setFilters\(empty\);\s*setReviewSelection\(new Set\(\)\);/);

  const topbarSrc = read('src/components/layout/Topbar.tsx');
  assert.match(topbarSrc, /onNavigate=\{\(targetPath\) => navigate\(targetPath\)\}/);
});

test('D11 owner freight requests opt into strict per-parcel seller prices for status and lookup', async () => {
  const { freightEstimateApi } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/lookup/api/freightEstimateApi.ts',
  );
  const { parcelFreightSchema } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/shared/schema.ts',
  );
  const orderId = id(31);
  const freight = { state: 'APPROVED', amountVnd: '23000', bookingState: 'RECORDED_FEE_MISSING' };
  const waiting = {
    state: 'REVIEW_REQUIRED',
    reason: 'PRICE_CHANGED',
    previousAmountVnd: '23000',
    newAmountVnd: '26000',
    canChoose: true,
  };
  let calls = 0;
  globalThis.fetch = async (url, request) => {
    calls++;
    assert.deepEqual(
      JSON.parse(request.body),
      url.endsWith('/order-status')
        ? { orderIds: [orderId], includeDispatchReview: true }
        : { items: [{ orderId }], includeDispatchReview: true },
    );
    return ok({
      items: [
        {
          orderId,
          state: 'VISIBLE',
          orderVersion: 1,
          sourceRevision: 'r1',
          asOf: '2026-11-28T11:00:00.000Z',
          parcelCount: 2,
          parcels: [
            { fulfillmentOrderId: id(32), parcelNumber: 2, freight },
            { fulfillmentOrderId: id(33), parcelNumber: 8, freight: waiting },
          ],
          recorded: { count: 0, subtotalVnd: null },
          estimated: { count: 0, subtotalVnd: null },
        },
      ],
    });
  };
  const signal = new AbortController().signal;
  for (const rows of [
    await freightEstimateApi.orderStatus([orderId], signal),
    await freightEstimateApi.orderLookup([{ orderId }], signal),
  ]) {
    assert.deepEqual(
      rows[0].parcels.map((p) => p.freight),
      [freight, waiting],
    );
  }
  assert.equal(calls, 2);
  assert.equal(parcelFreightSchema.safeParse({ ...waiting, markupVnd: '5000' }).success, false);
  assert.equal(parcelFreightSchema.safeParse({ ...freight, purchaseVnd: '18000' }).success, false);
});
