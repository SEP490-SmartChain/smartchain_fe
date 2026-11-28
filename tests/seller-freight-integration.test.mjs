import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

const viMessages = JSON.parse(
  readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
);
const enMessages = JSON.parse(
  readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'),
);

const ownerActive = {
  id: '00009200-0000-4000-8000-000000000001',
  email: 'owner@orca.test',
  fullName: 'Owner Test',
  userType: 'TENANT',
  role: 'SELLER_OWNER',
  actorScope: 'TENANT',
  roles: ['SELLER_OWNER'],
  tenantId: '00009100-0000-4000-8000-000000000001',
  serviceStatus: 'ACTIVE',
};

const ownerSuspended = { ...ownerActive, serviceStatus: 'SUSPENDED' };

const staffUser = {
  ...ownerActive,
  id: '00009200-0000-4000-8000-000000000002',
  email: 'staff@orca.test',
  role: 'SELLER_STAFF',
  roles: ['SELLER_STAFF'],
};

const sampleEstimate = {
  basis: 'ONE_PARCEL_ASSUMPTION',
  origin: {
    id: '00009400-0000-4000-8000-000000000001',
    code: 'WH-HCM-01',
    name: 'Kho HCM',
  },
  input: {
    originWarehouseId: '00009400-0000-4000-8000-000000000001',
    toProvinceCode: '01',
    toWardCode: '01001',
    parcel: { weightG: 500, lengthCm: 20, widthCm: 15, heightCm: 10, itemCount: 1 },
    declaredValueVnd: '200000',
    codVnd: '200000',
  },
  quotedAt: '2026-11-28T01:00:00.000Z',
  refreshAfter: '2026-11-28T01:05:00.000Z',
  tiers: [
    {
      tier: 'ECONOMY',
      status: 'QUOTED',
      amountVnd: '28000',
      deliveryDays: 2,
    },
    {
      tier: 'BALANCED',
      status: 'QUOTED',
      amountVnd: '34000',
      deliveryDays: 1,
    },
    {
      tier: 'EXPRESS',
      status: 'UNAVAILABLE',
      reason: 'ADDRESS_UNMAPPED',
    },
  ],
};

let server;
let useAuthStore;
let SellerOrders;
let ManualOrderForm;
let OrderDetail;
let FreightTierCards;
let formatOriginDisplayName;
let OrderFormFreightSection;
let OrderDetailFreightSection;
let OrderFreightBulkBar;
let OrderFreightCell;
let OrderLifecycleBadge;
let OrderWaybillCell;
let OrderWaybillDetails;
let orderScope;
let formFreightModel;
const originalFetch = globalThis.fetch;

before(async () => {
  server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic' },
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ SellerOrders } = await server.ssrLoadModule(
    '/src/features/orders/components/SellerOrders.tsx',
  ));
  ({ ManualOrderForm } = await server.ssrLoadModule(
    '/src/features/orders/components/ManualOrderForm.tsx',
  ));
  ({ OrderDetail } = await server.ssrLoadModule('/src/features/orders/components/OrderDetail.tsx'));
  ({ FreightTierCards, formatOriginDisplayName } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/lookup/components/FreightTierCards.tsx',
  ));
  ({ OrderFormFreightSection } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/form/OrderFormFreightSection.tsx',
  ));
  ({ OrderDetailFreightSection } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderDetailFreightSection.tsx',
  ));
  ({ OrderFreightBulkBar } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderFreightBulkBar.tsx',
  ));
  ({ OrderFreightCell } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderFreightCell.tsx',
  ));
  ({ OrderLifecycleBadge } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderStatusBadges.tsx',
  ));
  ({ OrderWaybillCell } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderWaybillCell.tsx',
  ));
  ({ OrderWaybillDetails } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderWaybillDetails.tsx',
  ));
  orderScope = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts');
  formFreightModel = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/form/formFreightModel.ts',
  );
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      data: [],
      meta: {
        timestamp: '2026-11-28T01:00:00.000Z',
        path: '',
        requestId: 'freight-int-test',
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      },
    });
});

function renderWithIntl(node, locale = 'vi') {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale,
        messages: locale === 'en' ? enMessages : viMessages,
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      createElement(MemoryRouter, { initialEntries: ['/orders'] }, node),
    ),
  );
}

test('SellerOrders enforces RBAC & suspended state across vi/en locales', () => {
  useAuthStore
    .getState()
    .setSession({ user: ownerActive, accessToken: 'owner-token', expiresIn: 900 });
  const ownerViHtml = renderWithIntl(createElement(SellerOrders), 'vi');
  const collectionHeaders = ['goods', 'shipping', 'total'].map(
    (field) => viMessages.Orders.collectionList[field],
  );
  const ownerHeaders = [...ownerViHtml.matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(ownerHeaders.slice(-3), collectionHeaders);
  assert.ok(!ownerHeaders.includes(viMessages.Orders.freight.columnTitle));
  assert.ok(
    ownerViHtml.includes(viMessages.Orders.freight.quickButton),
    `Expected quickButton "${viMessages.Orders.freight.quickButton}" in HTML: ${ownerViHtml.slice(0, 800)}`,
  );
  assert.deepEqual(
    orderScope.sellerFreightAccess(ownerActive, orderScope.orderScope(ownerActive)),
    { canViewFreight: true, canQuoteFreight: true },
  );

  const ownerEnHtml = renderWithIntl(createElement(SellerOrders), 'en');
  assert.ok(ownerEnHtml.includes(enMessages.Orders.freight.quickButton));

  useAuthStore
    .getState()
    .setSession({ user: ownerSuspended, accessToken: 'owner-susp-token', expiresIn: 900 });
  const suspendedHtml = renderWithIntl(createElement(SellerOrders), 'vi');
  assert.match(
    suspendedHtml,
    new RegExp(
      `<button[^>]*\\sdisabled=""[^>]*>[^<]*${viMessages.Orders.freight.quickButton}<\\/button>`,
    ),
  );
  assert.doesNotMatch(
    ownerViHtml,
    new RegExp(
      `<button[^>]*\\sdisabled=""[^>]*>[^<]*${viMessages.Orders.freight.quickButton}<\\/button>`,
    ),
  );
  assert.deepEqual(
    orderScope.sellerFreightAccess(ownerSuspended, orderScope.orderScope(ownerSuspended)),
    { canViewFreight: true, canQuoteFreight: false },
  );

  useAuthStore
    .getState()
    .setSession({ user: staffUser, accessToken: 'staff-token', expiresIn: 900 });
  const staffHtml = renderWithIntl(createElement(SellerOrders), 'vi');
  for (const label of collectionHeaders) assert.ok(!staffHtml.includes(label), label);
  assert.ok(!staffHtml.includes(viMessages.Orders.freight.quickButton));
  assert.deepEqual(orderScope.sellerFreightAccess(staffUser, orderScope.orderScope(staffUser)), {
    canViewFreight: false,
    canQuoteFreight: false,
  });
});

test('FreightTierCards & QuickFreightLookupModal enforce responsive grid, modal width and radio a11y', () => {
  const html = renderWithIntl(
    createElement(FreightTierCards, {
      result: sampleEstimate,
      selectedTier: 'BALANCED',
      onSelectTier: () => {},
      onApplyTier: () => {},
      applyLabel: 'Dùng mức này',
    }),
  );
  assert.ok(html.includes('grid-cols-1') && html.includes('sm:grid-cols-3'));
  assert.ok(html.includes('role="radiogroup"'));
  assert.ok(html.includes('role="radio"'));
  assert.ok(html.includes('aria-checked="true"'));
  assert.ok(html.includes('tabIndex="0"') || html.includes('tabindex="0"'));
  assert.ok(html.includes('Dùng mức này'));
  assert.ok(html.includes('tabular-nums'));
  assert.ok(html.includes(viMessages.Orders.freight.reason_ADDRESS_UNMAPPED ?? 'hỗ trợ dịch vụ'));

  const modalSrc = readFileSync(
    new URL(
      '../src/features/orders/seller-freight/lookup/components/QuickFreightLookupModal.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.ok(modalSrc.includes('min(94vw,720px)') || modalSrc.includes('min(94vw, 720px)'));
  assert.ok(!modalSrc.includes("useState('200000')"));
  assert.ok(!modalSrc.includes("declaredValueVnd || '0'"));
  assert.ok(!modalSrc.includes("codVnd || '0'"));

  // QA/QC: prevent duplicate "Kho Kho ..." prefix on warehouse names
  assert.equal(
    formatOriginDisplayName('Kho Hà Nội Tồn 0', 'SMK-HN-0'),
    'Kho Hà Nội Tồn 0 (SMK-HN-0)',
  );
  assert.equal(formatOriginDisplayName('Thủ Đức', 'HCM-01'), 'Kho Thủ Đức (HCM-01)');
  assert.ok(html.includes('Từ Kho HCM (WH-HCM-01)'));
  assert.ok(!html.includes('Từ kho Kho'));
  assert.ok(html.includes('whitespace-nowrap'));
});

test('OrderFormFreightSection renders DIRECT vs CALCULATED rules and protects paid amounts', async () => {
  useAuthStore
    .getState()
    .setSession({ user: ownerActive, accessToken: 'owner-token', expiresIn: 900 });
  const baseDraft = {
    entryMode: 'DIRECT',
    collectionAmount: '250000',
    paymentBreakdown: {
      discountAmount: '0',
      goodsPaidAmount: '0',
      shippingChargeAmount: '20000',
      shippingPaidAmount: '30000',
    },
    goodsPaymentMode: 'COD',
    shippingFeePayer: 'RECIPIENT',
    toProvinceCode: '01',
    toWardCode: '01001',
    declaredValue: '250000',
    items: [],
  };

  const directHtml = renderWithIntl(
    createElement(OrderFormFreightSection, {
      scope: 'tenant-1:owner-1',
      isOpen: true,
      canQuote: true,
      draft: baseDraft,
      products: [],
      initialSeed: null,
      selectedTier: 'ECONOMY',
      onSelectTier: () => {},
      onApplyCalculatedShippingCharge: () => {},
    }),
  );
  assert.ok(directHtml.includes('Cước ORCA dự kiến'));
  assert.ok(directHtml.includes('tách biệt với phí giao hàng thu khách'));

  const formHtml = renderWithIntl(
    createElement(ManualOrderForm, {
      scope: 'tenant-1:owner-1',
      isOpen: false,
      initialSeed: null,
      onClose: () => {},
      onAccepted: () => {},
    }),
  );
  assert.equal(formHtml, '');

  const estimateInputKey = JSON.stringify([
    'tenant-1:owner-1',
    sampleEstimate.input.originWarehouseId,
    sampleEstimate.input.toProvinceCode,
    sampleEstimate.input.toWardCode,
    sampleEstimate.input.parcel.weightG,
    sampleEstimate.input.parcel.lengthCm,
    sampleEstimate.input.parcel.widthCm,
    sampleEstimate.input.parcel.heightCm,
    sampleEstimate.input.parcel.itemCount,
    sampleEstimate.input.declaredValueVnd,
    sampleEstimate.input.codVnd,
  ]);
  const quoteKey = `tenant-1:owner-1:${sampleEstimate.input.originWarehouseId}`;
  // Actually evaluate with matching key from shared.quoteInputKey
  const sharedMod = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/shared/index.ts',
  );
  const realKey = sharedMod.quoteInputKey('tenant-1:owner-1', sampleEstimate.input);
  const nowMs = Date.parse('2026-11-28T01:01:00.000Z');
  assert.equal(typeof estimateInputKey, 'string');

  // Paid-shipping guard blocks apply when shippingPaidAmount (30000) > quotedAmount (28000)
  const blockedApply = formFreightModel.evaluateFormQuoteApply({
    scope: 'tenant-1:owner-1',
    activeScope: 'tenant-1:owner-1',
    currentKey: realKey,
    quoteKey: realKey,
    result: sampleEstimate,
    selectedTier: 'ECONOMY',
    entryMode: 'CALCULATED',
    shippingPaidAmount: '30000',
    nowMs,
  });
  assert.equal(blockedApply.allowed, false);
  assert.equal(blockedApply.reason, 'PAID_EXCEEDS_QUOTE');

  const directBlocked = formFreightModel.evaluateFormQuoteApply({
    scope: 'tenant-1:owner-1',
    activeScope: 'tenant-1:owner-1',
    currentKey: realKey,
    quoteKey: realKey,
    result: sampleEstimate,
    selectedTier: 'BALANCED',
    entryMode: 'DIRECT',
    shippingPaidAmount: '0',
    nowMs,
  });
  assert.equal(directBlocked.allowed, false);
  assert.equal(directBlocked.reason, 'DIRECT_MODE');

  const allowedApply = formFreightModel.evaluateFormQuoteApply({
    scope: 'tenant-1:owner-1',
    activeScope: 'tenant-1:owner-1',
    currentKey: realKey,
    quoteKey: realKey,
    result: sampleEstimate,
    selectedTier: 'BALANCED',
    entryMode: 'CALCULATED',
    shippingPaidAmount: '30000',
    nowMs,
  });
  assert.equal(allowedApply.allowed, true);
  assert.equal(allowedApply.reason, undefined);
  assert.equal(allowedApply.amountVnd, '34000');
});

test('OrderDetail, OrderFreightCell, OrderDetailFreightSection & OrderFreightBulkBar handle split parcels, pending booking, fee missing, and suspended read-only', () => {
  const splitRow = {
    orderId: '00009940-0000-4000-8000-000000000002',
    state: 'VISIBLE',
    parcelCount: 2,
    recorded: { count: 1, subtotalVnd: '20000' },
    estimated: { count: 1, subtotalVnd: '28000' },
    parcels: [
      {
        parcelIndex: 1,
        fulfillmentOrderId: 'fo-1',
        packingRecordId: 'pr-1',
        freight: {
          state: 'RECORDED',
          amountVnd: '20000',
          recordedAt: '2026-11-28T01:05:00.000Z',
        },
      },
      {
        parcelIndex: 2,
        fulfillmentOrderId: 'fo-2',
        packingRecordId: null,
        freight: {
          state: 'ESTIMATED',
          basis: 'PACKED',
          tier: 'ECONOMY',
          amountVnd: '28000',
          quotedAt: '2026-11-28T01:10:00.000Z',
          refreshAfter: '2026-11-28T01:15:00.000Z',
          origin: {
            id: '00009400-0000-4000-8000-000000000001',
            code: 'WH-HCM-01',
            name: 'Kho HCM',
          },
        },
      },
    ],
  };

  const shippingCell = (row, canQuote = true) =>
    renderWithIntl(
      createElement(OrderFreightCell, {
        parcels: row.parcels,
        loading: false,
        canQuote,
        onQuickLookup: () => {},
      }),
    );
  const splitCellHtml = shippingCell(splitRow);
  assert.match(splitCellHtml, /20\.000 ₫.*Đã ghi nhận.*1\/2 kiện/);
  assert.match(splitCellHtml, /28\.000 ₫.*Ước tính.*1\/2 kiện/);
  assert.match(splitCellHtml, /<button[^>]*>.*Tra cước<\/button>/);
  assert.doesNotMatch(splitCellHtml, /48\.000 ₫/);
  assert.doesNotMatch(shippingCell(splitRow, false), /<button\b/);
  const needsInputs = {
    ...splitRow,
    estimated: { count: 0, subtotalVnd: null },
    parcels: [
      splitRow.parcels[0],
      { ...splitRow.parcels[1], freight: { state: 'NEEDS_INPUT', fields: ['parcel'] } },
    ],
  };
  assert.match(shippingCell(needsInputs), /Nhập kiện &amp; tra/);

  const splitHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: splitRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(splitHtml.includes('20.000 ₫'));
  assert.ok(splitHtml.includes('28.000 ₫'));
  assert.ok(!splitHtml.includes('48.000 ₫'));
  assert.ok(splitHtml.includes('Phần đã ghi nhận (1/2 kiện)'));
  assert.ok(splitHtml.includes('Phần ước tính (1/2 kiện)'));

  const pendingRow = {
    orderId: '00009940-0000-4000-8000-000000000005',
    state: 'VISIBLE',
    parcelCount: 1,
    recorded: { count: 0, subtotalVnd: null },
    estimated: { count: 0, subtotalVnd: null },
    parcels: [
      {
        parcelIndex: 1,
        fulfillmentOrderId: 'fo-5',
        packingRecordId: 'pr-5',
        freight: { state: 'BOOKING_PENDING' },
      },
    ],
  };
  const pendingHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: pendingRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(pendingHtml.includes('đang trong quá trình tạo vận đơn'));

  const feeMissingRow = {
    orderId: '00009940-0000-4000-8000-000000000006',
    state: 'VISIBLE',
    parcelCount: 1,
    recorded: { count: 0, subtotalVnd: null },
    estimated: { count: 0, subtotalVnd: null },
    parcels: [
      {
        parcelIndex: 1,
        fulfillmentOrderId: 'fo-6',
        packingRecordId: 'pr-6',
        freight: { state: 'RECORDED_FEE_MISSING' },
      },
    ],
  };
  const feeMissingHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: feeMissingRow,
      loading: false,
      canQuote: false,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(feeMissingHtml.includes('thiếu chứng từ cước ghi nhận'));
  assert.ok(!feeMissingHtml.includes('Tra cước kiện chưa có vận đơn'));

  const orderSample = {
    id: '00009940-0000-4000-8000-000000000001',
    externalOrderCode: 'ORD-REC-1',
    sourceChannel: 'manual',
    deliveryTier: 'ECONOMY',
    status: 'DISPATCHED',
    createdAt: '2026-11-28T01:00:00.000Z',
    updatedAt: '2026-11-28T01:00:00.000Z',
    totalAmount: '200000',
    codAmount: '200000',
    declaredValue: '200000',
    shippingFeePayer: 'SENDER',
    customerShippingFee: '0',
    recipientName: 'Khách A',
    recipientPhone: '0900000001',
    recipientAddress: 'Addr',
    provinceName: 'Hà Nội',
    wardName: 'Ba Đình',
    items: [
      {
        productId: '00009930-0000-4000-8000-000000000001',
        productName: 'Test product',
        sku: 'SKU-1',
        qty: 1,
        unitPrice: '200000',
      },
    ],
    fulfillmentOrders: [],
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'RECEIVED',
        reason: null,
        changedAt: '2026-11-28T01:00:00.000Z',
      },
    ],
  };

  const detailOwnerSuspended = renderWithIntl(
    createElement(OrderDetail, {
      order: orderSample,
      freightRow: splitRow,
      freightLoading: false,
      canQuoteFreight: false,
      onLookupFreight: () => {},
    }),
  );
  assert.ok(detailOwnerSuspended.includes('Cước ORCA'));
  assert.ok(detailOwnerSuspended.includes('20.000 ₫'));
  assert.ok(detailOwnerSuspended.includes('sm:col-span-2'));
  assert.ok(splitCellHtml.includes('whitespace-nowrap'));

  const allRecordedRow = {
    orderId: '00009940-0000-4000-8000-000000000010',
    state: 'VISIBLE',
    orderVersion: 1,
    sourceRevision: 'rev-rec',
    asOf: '2026-11-28T01:05:00.000Z',
    parcelCount: 1,
    recorded: { count: 1, subtotalVnd: '35000' },
    estimated: { count: 0, subtotalVnd: null },
    parcels: [
      {
        fulfillmentOrderId: 'fo-rec',
        freight: {
          state: 'RECORDED',
          amountVnd: '35000',
          recordedAt: '2026-11-28T01:05:00.000Z',
        },
      },
    ],
  };
  const allRecordedHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: allRecordedRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(allRecordedHtml.includes('Đã chốt theo vận đơn'));
  assert.ok(!allRecordedHtml.includes('Tra cước kiện chưa có vận đơn'));

  const needsInputRow = {
    ...allRecordedRow,
    recorded: { count: 0, subtotalVnd: null },
    parcels: [
      { fulfillmentOrderId: 'fo-inp', freight: { state: 'NEEDS_INPUT', fields: ['parcel'] } },
    ],
  };
  const needsInputHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: needsInputRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(needsInputHtml.includes('Nhập số đo &amp; tra cước'));

  const notApplicableRow = {
    ...allRecordedRow,
    parcelCount: null,
    recorded: { count: 0, subtotalVnd: null },
    parcels: [{ fulfillmentOrderId: null, freight: { state: 'NOT_APPLICABLE' } }],
  };
  const notApplicableHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: notApplicableRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(!notApplicableHtml.includes('Tra cước kiện chưa có vận đơn'));

  const bulkBarHtml = renderWithIntl(
    createElement(OrderFreightBulkBar, {
      selectedCount: 2,
      canQuote: true,
      progress: {
        running: true,
        totalOrders: 2,
        completedOrders: 1,
        failedOrderIds: [],
        rateLimitedRetrySeconds: 4,
      },
      onLookupSelected: () => {},
      onClearSelection: () => {},
    }),
  );
  assert.ok(bulkBarHtml.includes('Tra cước đã chọn (2)'));
  assert.ok(bulkBarHtml.includes('role="status"'));
  assert.ok(bulkBarHtml.includes('1/2 đơn'));
  assert.ok(bulkBarHtml.includes('4s'));

  // Distinct order lifecycle badge colors + no-wrap
  const receivedBadge = renderWithIntl(
    createElement(OrderLifecycleBadge, { status: 'RECEIVED', label: 'Đã tiếp nhận' }),
  );
  const allocatedBadge = renderWithIntl(
    createElement(OrderLifecycleBadge, { status: 'ALLOCATED', label: 'Đã phân bổ' }),
  );
  const partialBadge = renderWithIntl(
    createElement(OrderLifecycleBadge, {
      status: 'PARTIALLY_DELIVERED',
      label: 'Giao một phần',
    }),
  );
  const dispatchedBadge = renderWithIntl(
    createElement(OrderLifecycleBadge, { status: 'DISPATCHED', label: 'Đã xuất kho' }),
  );
  const failedBadge = renderWithIntl(
    createElement(OrderLifecycleBadge, { status: 'FAILED', label: 'Thất bại' }),
  );
  assert.ok(
    receivedBadge.includes('var(--sc-bg-secondary)') && receivedBadge.includes('whitespace-nowrap'),
  );
  assert.ok(allocatedBadge.includes('var(--sc-info-bg)'));
  assert.ok(partialBadge.includes('var(--sc-warning-bg)'));
  assert.ok(dispatchedBadge.includes('var(--sc-info-bg)'));
  assert.ok(failedBadge.includes('var(--sc-error-bg)'));

  // Waybill column + detail tracking chips
  const trackedSplitRow = {
    ...splitRow,
    parcels: [
      { ...splitRow.parcels[0], trackingNumber: 'GHN84920173', carrierCode: 'GHN' },
      splitRow.parcels[1],
    ],
  };
  const waybillSplitHtml = renderWithIntl(
    createElement(OrderWaybillCell, { row: trackedSplitRow, orderKind: 'SALES', loading: false }),
  );
  assert.ok(waybillSplitHtml.includes('GHN84920173'));
  assert.ok(waybillSplitHtml.includes('GHN'));
  assert.ok(waybillSplitHtml.includes('1/2 kiện có mã'));
  assert.ok(waybillSplitHtml.includes('Sao chép mã vận đơn GHN84920173'));

  const twoWaybills = renderWithIntl(
    createElement(OrderWaybillCell, {
      row: {
        ...trackedSplitRow,
        parcels: [
          trackedSplitRow.parcels[0],
          { ...trackedSplitRow.parcels[1], trackingNumber: 'GHTK84920174', carrierCode: 'GHTK' },
        ],
      },
      orderKind: 'SALES',
      loading: false,
      expanded: true,
      onToggle: () => {},
    }),
  );
  assert.match(twoWaybills, /aria-expanded="true"/);
  assert.match(twoWaybills, /aria-controls="waybill-details-00009940-0000-4000-8000-000000000002"/);
  assert.match(twoWaybills, /Thu gọn 2 vận đơn/);
  assert.doesNotMatch(twoWaybills, /GHN84920173|GHTK84920174/);

  const twoWaybillsRow = {
    ...trackedSplitRow,
    parcels: [
      { ...trackedSplitRow.parcels[1], trackingNumber: 'GHTK84920174', carrierCode: 'GHTK' },
      trackedSplitRow.parcels[0],
    ],
  };
  const child = (id, sequenceNo, goodsDueVnd, quotedFeeVnd, finalCodVnd) => ({
    id,
    sequenceNo,
    status: 'PACKED',
    shipments: [],
    autoCod: { goodsDueVnd, quotedFeeVnd, finalCodVnd, approvalShipmentId: null },
  });
  const itemRows = renderWithIntl(
    createElement(OrderWaybillDetails, {
      freight: twoWaybillsRow,
      order: {
        id: twoWaybillsRow.orderId,
        excelShipPolicy: { mode: 'CUSTOMER_CARRIER_QUOTE' },
        fulfillmentOrders: [
          child('fo-1', 1, '120000', '20000', '140000'),
          child('fo-2', 2, '80000', '12000', '92000'),
        ],
      },
    }),
  );
  const waybillRows = [...itemRows.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)].map((match) => match[0]);
  assert.equal(waybillRows.length, 2);
  assert.match(waybillRows[0], /Kiện 2.*GHTK84920174.*80\.000 ₫.*12\.000 ₫.*92\.000 ₫/);
  assert.match(waybillRows[1], /Kiện 1.*GHN84920173.*120\.000 ₫.*20\.000 ₫.*140\.000 ₫/);

  const fixedParcels = [
    { id: 'fo-1', sequenceNo: 1, status: 'PACKED', shipments: [], codAmount: '140000' },
    { id: 'fo-2', sequenceNo: 2, status: 'PACKED', shipments: [], codAmount: '80000' },
  ];
  const fixedOrder = {
    id: twoWaybillsRow.orderId,
    excelShipPolicy: { mode: 'CUSTOMER_FIXED', agreedFeeVnd: '20000' },
    fulfillmentOrders: fixedParcels,
  };
  const fixedRows = renderWithIntl(
    createElement(OrderWaybillDetails, { freight: twoWaybillsRow, order: fixedOrder }),
  );
  assert.match(fixedRows, /Kiện 2.*80\.000 ₫<\/td>.*>0 ₫<\/dd>.*>80\.000 ₫<\/td>/);
  assert.match(fixedRows, /Kiện 1.*120\.000 ₫<\/td>.*>20\.000 ₫<\/dd>.*>140\.000 ₫<\/td>/);
  const directRows = renderWithIntl(
    createElement(OrderWaybillDetails, {
      freight: twoWaybillsRow,
      order: { ...fixedOrder, collectionMode: 'DIRECT', excelShipPolicy: undefined },
    }),
  );
  assert.match(directRows, /Kiện 1.*>—<\/td>.*>—<\/dd>.*>140\.000 ₫<\/td>/);

  const waybillPendingHtml = renderWithIntl(
    createElement(OrderWaybillCell, { row: pendingRow, orderKind: 'SALES', loading: false }),
  );
  assert.ok(waybillPendingHtml.includes('Đang cấp mã'));

  const waybillWithdrawalHtml = renderWithIntl(
    createElement(OrderWaybillCell, {
      row: notApplicableRow,
      orderKind: 'WITHDRAWAL',
      loading: false,
    }),
  );
  assert.ok(waybillWithdrawalHtml.includes('—'));

  const detailTrackedHtml = renderWithIntl(
    createElement(OrderDetailFreightSection, {
      row: trackedSplitRow,
      loading: false,
      canQuote: true,
      onLookupOrder: () => {},
    }),
  );
  assert.ok(detailTrackedHtml.includes('GHN84920173'));
  assert.ok(detailTrackedHtml.includes('Chưa cấp mã vận đơn'));
  assert.ok(detailTrackedHtml.includes('var(--sc-bg-secondary)'));

  // Palette consistency: pure --sc-* design tokens (no media-query dark:* clash or invalid --sc-status/--sc-surface tokens)
  for (const relPath of [
    '../src/features/orders/seller-freight/order-selection/components/OrderStatusBadges.tsx',
    '../src/features/orders/seller-freight/order-selection/components/OrderFreightCell.tsx',
    '../src/features/orders/seller-freight/order-selection/components/OrderWaybillCell.tsx',
    '../src/features/orders/seller-freight/order-selection/components/OrderDetailFreightSection.tsx',
    '../src/features/orders/seller-freight/lookup/components/FreightTierCards.tsx',
    '../src/features/orders/seller-freight/form/OrderFormFreightSection.tsx',
  ]) {
    const src = readFileSync(new URL(relPath, import.meta.url), 'utf8');
    assert.ok(!src.includes('dark:'), `${relPath} must not use media dark: classes`);
    assert.ok(
      !src.includes('--sc-status-'),
      `${relPath} must not reference undefined --sc-status-* tokens`,
    );
    assert.ok(
      !src.includes('--sc-surface-'),
      `${relPath} must not reference undefined --sc-surface-* tokens`,
    );
  }
});

test('ManualOrderForm redesign keeps sections structured with zero initial errors and un-clipped waybill chips', () => {
  const manualFormSrc = readFileSync(
    new URL('../src/features/orders/components/ManualOrderForm.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(!manualFormSrc.includes('liveMoneyError'), 'liveMoneyError must stay removed');
  assert.ok(!manualFormSrc.includes('dark:'), 'ManualOrderForm must not use dark: classes');
  assert.ok(
    manualFormSrc.includes('notify={false}'),
    'Inline validation Alert banners in ManualOrderForm must disable duplicate error toasts',
  );
  assert.ok(
    manualFormSrc.indexOf("t('payment_section')") <
      manualFormSrc.indexOf('<OrderFormFreightSection'),
    'Payment inputs must appear inside Section 3 before Cước ORCA dự kiến',
  );
  assert.ok(
    manualFormSrc.includes('sm:col-span-2'),
    'Recipient street address and partial payment inputs should use full row width',
  );
  assert.ok(
    manualFormSrc.includes("tCommon('close')"),
    'ManualOrderForm footer should provide an explicit Close button alongside Submit',
  );

  const globalsCss = readFileSync(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.ok(
    globalsCss.includes('select.appearance-none') &&
      globalsCss.includes('select.appearance-none::picker-icon') &&
      !globalsCss.includes('::-ms-expand') &&
      globalsCss.includes('display: none'),
    'globals.css must suppress Chromium select ::picker-icon in a standalone valid selector rule',
  );

  const formSectionSrc = readFileSync(
    new URL(
      '../src/features/orders/seller-freight/form/OrderFormFreightSection.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.ok(
    formSectionSrc.includes('Thông số kiện &amp; COD hỏi hãng') &&
      formSectionSrc.includes('min-h-[42px]'),
    'OrderFormFreightSection must pair a matching top label and 42px box alongside Kho gửi giả định',
  );

  const ghtkChipHtml = renderWithIntl(
    createElement(OrderWaybillCell, {
      row: {
        orderId: '00009940-0000-4000-8000-000000000020',
        state: 'VISIBLE',
        parcelCount: 1,
        recorded: { count: 1, subtotalVnd: '24000' },
        estimated: { count: 0, subtotalVnd: null },
        parcels: [
          {
            fulfillmentOrderId: 'fo-ghtk',
            trackingNumber: 'S21948502.HN1.893412',
            carrierCode: 'GHTK',
            freight: {
              state: 'RECORDED',
              amountVnd: '24000',
              recordedAt: '2026-11-28T01:05:00.000Z',
            },
          },
        ],
      },
      orderKind: 'SALES',
      loading: false,
    }),
  );
  assert.ok(ghtkChipHtml.includes('GHTK'));
  assert.ok(ghtkChipHtml.includes('S21948502.HN1.893412'));
  assert.ok(ghtkChipHtml.includes('whitespace-nowrap'));

  const multiWaybillHtml = renderWithIntl(
    createElement(OrderWaybillCell, {
      row: {
        orderId: '00009940-0000-4000-8000-000000000021',
        state: 'VISIBLE',
        parcelCount: 2,
        recorded: { count: 2, subtotalVnd: '32000' },
        estimated: { count: 0, subtotalVnd: null },
        parcels: [
          {
            fulfillmentOrderId: 'fo-1',
            trackingNumber: 'GHN-111',
            carrierCode: 'GHN',
            freight: {
              state: 'RECORDED',
              amountVnd: '20000',
              recordedAt: '2026-11-28T01:05:00.000Z',
            },
          },
          {
            fulfillmentOrderId: 'fo-2',
            trackingNumber: 'GHN-222',
            carrierCode: 'GHN',
            freight: {
              state: 'RECORDED',
              amountVnd: '12000',
              recordedAt: '2026-11-28T01:05:00.000Z',
            },
          },
        ],
      },
      orderKind: 'SALES',
      loading: false,
    }),
  );
  assert.ok(multiWaybillHtml.includes('2 vận đơn'));
});

test('D11 shipping shows customer collection and approved shop freight independently for prepaid, shop-paid and direct COD', async () => {
  const { OrderShippingAmounts } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderFreightCell.tsx',
  );
  const { OrderCollectionAmount, OrderCollectionTotal } = await server.ssrLoadModule(
    '/src/features/orders/components/OrderCodCollection.tsx',
  );
  const parcels = [
    {
      fulfillmentOrderId: 'p1',
      freight: { state: 'APPROVED', amountVnd: '23000', bookingState: 'BOOKING_PENDING' },
    },
  ];
  for (const [order, customer, cod] of [
    [{ codAmount: '0', customerShippingFee: '0', shippingFeePayer: 'SENDER' }, '0 ₫', '0 ₫'],
    [
      { codAmount: '120000', customerShippingFee: '0', shippingFeePayer: 'SENDER' },
      '0 ₫',
      '120.000 ₫',
    ],
    [
      { codAmount: '120000', customerShippingFee: '15000', shippingFeePayer: 'RECIPIENT' },
      '15.000 ₫',
      '135.000 ₫',
    ],
    [{ codAmount: '120000', collectionMode: 'DIRECT' }, '—', '120.000 ₫'],
  ]) {
    const markup = renderWithIntl(
      createElement(OrderShippingAmounts, {
        customer: createElement(OrderCollectionAmount, { order, field: 'shipping' }),
        shop: createElement(OrderFreightCell, {
          parcels,
          loading: false,
          canQuote: true,
          onQuickLookup() {},
        }),
      }),
    );
    const text = markup.replaceAll(/<[^>]+>/g, '');
    assert.ok(text.includes('Ship thu khách khi giao' + customer));
    assert.ok(text.includes('Cước ORCA của shop23.000 ₫ · Đã duyệt'));
    assert.doesNotMatch(markup, /<button|Đã ghi nhận/);
    assert.ok(renderWithIntl(createElement(OrderCollectionTotal, { order })).includes(cod));
  }
  assert.match(
    renderWithIntl(
      createElement(OrderWaybillCell, {
        row: { state: 'VISIBLE', parcels },
        loading: false,
      }),
    ),
    /Đang cấp mã/,
  );
});

test('D11 prices that increase or decrease and replacement services open the exact pending parcel', () => {
  for (const [reason, newAmountVnd, action] of [
    ['PRICE_CHANGED', '26000', 'Duyệt lại cước'],
    ['PRICE_CHANGED', '21000', 'Duyệt lại cước'],
    ['SERVICE_UNAVAILABLE', null, 'Chọn lại dịch vụ'],
  ]) {
    const freight = {
      state: 'REVIEW_REQUIRED',
      reason,
      previousAmountVnd: '23000',
      newAmountVnd,
      canChoose: true,
    };
    const parcels = [
      {
        fulfillmentOrderId: 'booked',
        parcelNumber: 2,
        freight: { state: 'RECORDED', amountVnd: '28000' },
      },
      { fulfillmentOrderId: 'review-me', parcelNumber: 8, freight },
    ];
    let focused;
    let reviewAction;
    function CellProbe() {
      const output = OrderFreightCell({
        parcels,
        loading: false,
        canQuote: true,
        onReviewParcel: (id) => {
          focused = id;
        },
      });
      function walk(node) {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node?.props) return;
        if (node.props['aria-label'] === action + ' cho kiện 8') reviewAction = node.props.onClick;
        walk(node.props.children);
      }
      walk(output);
      return output;
    }
    const html = renderWithIntl(createElement(CellProbe));
    assert.match(html, /1 kiện cần duyệt lại/);
    assert.match(html, /Đã duyệt 23\.000 ₫/);
    if (newAmountVnd)
      assert.ok(html.includes(newAmountVnd === '26000' ? 'Giá mới 26.000 ₫' : 'Giá mới 21.000 ₫'));
    else assert.ok(html.includes('Dịch vụ đã ngừng nhận kiện'));
    assert.ok(html.includes('Kiện 8'));
    const unknownNumber = renderWithIntl(
      createElement(OrderFreightCell, {
        parcels: [{ fulfillmentOrderId: 'review-me', freight }],
        loading: false,
        onReviewParcel() {},
      }),
    );
    assert.ok(!unknownNumber.includes('cho kiện 1'));
    reviewAction();
    assert.equal(focused, 'review-me');
    assert.doesNotMatch(html, /Tra cước/);
    const expired = renderWithIntl(
      createElement(OrderFreightCell, {
        parcels: [
          {
            fulfillmentOrderId: 'review-me',
            freight: { ...freight, canChoose: false, newAmountVnd: null },
          },
        ],
        loading: false,
        onReviewParcel() {},
      }),
    );
    assert.match(expired, /Chờ báo giá mới/);
    if (reason === 'SERVICE_UNAVAILABLE') assert.match(expired, /Dịch vụ đã ngừng nhận kiện/);
    assert.doesNotMatch(expired, /<button/);
  }
});

test('D11 preview shows only the chosen live suggestion for the current order revision', async () => {
  const { validDispatchEstimate } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/components/OrderFreightCell.tsx',
  );
  const { selectedDispatchEstimate } = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/shared/dispatchReview.ts',
  );
  const expiresAt = '2026-11-28T12:05:00.000Z';
  const offer = {
    state: 'QUOTED',
    expiresAt,
    sourceRevision: 'v1',
    options: [
      { optionRef: 'a', totalVnd: '23000' },
      { optionRef: 'b', totalVnd: '26000' },
    ],
  };
  const row = {
    state: 'VISIBLE',
    sourceRevision: 'v1',
    parcels: [{ freight: { state: 'NEEDS_INPUT' } }],
  };
  const now = Date.parse(expiresAt) - 1000;
  const estimate = selectedDispatchEstimate(offer, 'b');
  assert.equal(estimate.amountVnd, '26000');
  assert.equal(validDispatchEstimate(estimate, row, now), true);
  for (const candidate of [
    { ...row, sourceRevision: 'v2' },
    { ...row, parcels: [{ freight: { state: 'APPROVED' } }] },
    { ...row, parcels: [{ freight: { state: 'RECORDED' } }] },
    { state: 'NOT_FOUND' },
  ])
    assert.equal(validDispatchEstimate(estimate, candidate, now), false);
  assert.equal(validDispatchEstimate(estimate, row, Date.parse(expiresAt)), false);
  assert.equal(selectedDispatchEstimate({ ...offer, sourceRevision: undefined }, 'b'), undefined);
  assert.equal(selectedDispatchEstimate(offer, 'missing'), undefined);
  const html = renderWithIntl(
    createElement(OrderFreightCell, {
      parcels: row.parcels,
      estimateAmountVnd: estimate.amountVnd,
      loading: false,
      canQuote: true,
      onQuickLookup() {},
    }),
  );
  assert.match(html, /26\.000 ₫ · Ước tính/);
  assert.doesNotMatch(html, /23\.000|Đã duyệt|<button/);
});
