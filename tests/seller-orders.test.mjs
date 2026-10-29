import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';

let server;
let orders;
let OrderDetail;
let presentation;
let feedback;
let policy;
let scope;
let useAuthStore;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const user = {
  userId: id,
  tenantId: '00000000-0000-4000-8000-000000000002',
  actorScope: 'TENANT',
  roles: ['SELLER_OWNER'],
  email: 'test@example.test',
  fullName: 'Test',
  permissions: [],
};
const summary = {
  id,
  externalOrderCode: 'manual-1',
  sourceChannel: 'manual',
  status: 'RECEIVED',
  createdAt: '2026-10-08T01:00:00.000Z',
  updatedAt: '2026-10-08T01:00:00.000Z',
  holdReason: null,
  version: 1,
};
const financial = {
  codAmount: '100000',
  totalAmount: '100000',
  declaredValue: '100000',
  customerShippingFee: '0',
  shippingFeePayer: 'SENDER',
};
const draft = {
  externalOrderCode: 'manual-1',
  sourceChannel: 'manual',
  recipientName: 'Test',
  recipientPhone: '0900000000',
  recipientAddress: 'Test address',
  toProvinceCode: '01',
  toWardCode: '00001',
  codAmount: '100000',
  declaredValue: '100000',
  customerShippingFee: '0',
  shippingFeePayer: 'SENDER',
  items: [{ productId: id, qty: 1, unitPrice: '100000' }],
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-08T01:00:00.000Z',
      path: '',
      requestId: 'test',
      ...(pagination ? { pagination } : {}),
    },
  });
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
  orders = await server.ssrLoadModule('/src/features/orders/api/ordersApi.ts');
  ({ OrderDetail } = await server.ssrLoadModule('/src/features/orders/components/OrderDetail.tsx'));
  presentation = await server.ssrLoadModule('/src/features/orders/lib/orderPresentation.ts');
  feedback = await server.ssrLoadModule('/src/features/orders/lib/orderFeedback.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  scope = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts');
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ user, accessToken: 'seller-test-token', expiresIn: 900 });
});

test('Excel and Google Sheets downloads use distinct authenticated contracts and forward cancellation', async () => {
  const controller = new AbortController();
  const paths = [];
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url, 'https://app.example.test').pathname;
    paths.push(pathname);
    assert.equal(options.headers.get('Authorization'), 'Bearer seller-test-token');
    assert.equal(options.signal, controller.signal);
    return ok({
      fileName: pathname.endsWith('/sheet-template')
        ? 'orca-google-sheet.xlsx'
        : 'orca-orders.xlsx',
      contentBase64: 'UEs=',
    });
  };
  assert.equal((await orders.ordersApi.template(controller.signal)).fileName, 'orca-orders.xlsx');
  assert.equal(
    (await orders.ordersApi.template(controller.signal, true)).fileName,
    'orca-google-sheet.xlsx',
  );
  assert.deepEqual(paths, ['/api/v1/orders/import-template', '/api/v1/orders/sheet-template']);
});

test('Google Sheets download rejects a mismatched workbook response', async () => {
  globalThis.fetch = async () => ok({ fileName: 'orca-orders.xlsx', contentBase64: 'UEs=' });
  await assert.rejects(() => orders.ordersApi.template(undefined, true));
});
test('automatic merchandise collection follows line totals, separates customer freight and preserves prepaid zero', () => {
  const automatic = {
    ...draft,
    codAmount: '',
    items: [{ productId: id, qty: 2, unitPrice: '100000' }],
    customerShippingFee: '30000',
    shippingFeePayer: 'RECIPIENT',
  };
  const order = orders.completeManualDraft(automatic, 'automatic');
  assert.equal(order.codAmount, '200000');
  assert.equal(orders.orderCollectionTotal(order), '230000');
  const prepaid = orders.completeManualDraft({ ...automatic, codAmount: '0' }, 'automatic');
  assert.equal(orders.orderCollectionTotal(prepaid), '30000');
  const partial = orders.completeManualDraft({ ...automatic, codAmount: '50000' }, 'automatic');
  assert.equal(orders.orderCollectionTotal(partial), '80000');
  const free = orders.completeManualDraft(
    { ...automatic, shippingFeePayer: 'SENDER' },
    'automatic',
  );
  assert.equal(free.customerShippingFee, '0');
  assert.equal(orders.orderCollectionTotal(free), '200000');
});
test('invalid money and combined collection overflow fail validation without throwing during draft validation', () => {
  assert.equal(orders.manualDraftSchema.safeParse({ ...draft, codAmount: 'abc' }).success, false);
  assert.equal(
    orders.manualOrderSchema.safeParse({
      ...draft,
      codAmount: '999999999999',
      customerShippingFee: '1',
      shippingFeePayer: 'RECIPIENT',
    }).success,
    false,
  );
  assert.throws(() =>
    orders.completeManualDraft(
      { ...draft, codAmount: '', items: [{ productId: id, qty: 2, unitPrice: '999999999999' }] },
      'automatic',
    ),
  );
});
test('only Owner can create/import; seven roles and invalid scopes fail closed', () => {
  for (const role of policy.ORCA_ROLES) {
    const roles = policy.getEffectiveRoles([role], policy.ROLE_ACTOR_SCOPE[role]);
    assert.equal(policy.can(roles, 'orders.create'), role === 'SELLER_OWNER');
    assert.equal(policy.can(roles, 'orders.seller.read'), role.startsWith('SELLER_'));
  }
  for (const [roles, actorScope] of [
    [['SELLER_OWNER'], null],
    [['SELLER_OWNER', 'ORCA_ADMIN'], 'TENANT'],
    [['TENANT_ADMIN'], 'TENANT'],
    [['UNKNOWN'], 'TENANT'],
  ])
    assert.equal(policy.can(policy.getEffectiveRoles(roles, actorScope), 'orders.create'), false);
});
test('Staff schemas reject extra financial/PII fields, including nested lines and sub-orders', () => {
  assert.deepEqual(orders.parseOrder(summary, false), summary);
  assert.throws(() => orders.parseOrder({ ...summary, ...financial }, false));
  const safe = {
    ...summary,
    items: [{ productId: id, qty: 1 }],
    fulfillmentOrders: [],
    statusHistory: [],
  };
  assert.deepEqual(orders.parseOrderDetail(safe, false), safe);
  assert.throws(() => orders.parseOrderDetail({ ...safe, recipientPhone: '0900000000' }, false));
  assert.throws(() =>
    orders.parseOrderDetail(
      { ...safe, items: [{ productId: id, qty: 1, unitPrice: '100000' }] },
      false,
    ),
  );
  assert.throws(() =>
    orders.parseOrderDetail(
      {
        ...safe,
        fulfillmentOrders: [
          {
            id,
            warehouseId: id,
            sequenceNo: 1,
            status: 'CREATED',
            items: [],
            parcels: [],
            shipments: [],
            codAmount: '100000',
          },
        ],
      },
      false,
    ),
  );
});
test('manual validation rejects fractional/rounded money, invalid phone, duplicates and forged tenant', () => {
  assert.deepEqual(orders.manualOrderSchema.parse(draft), draft);
  for (const patch of [
    { codAmount: '0.5' },
    { codAmount: 100000 },
    { recipientPhone: '900000000' },
    { recipientName: ' ' },
    { tenantId: id },
    { items: [draft.items[0], draft.items[0]] },
  ])
    assert.equal(orders.manualOrderSchema.safeParse({ ...draft, ...patch }).success, false);
});

test('human money entry accepts copied whitespace and thousands grouping without rounding or changing API rules', () => {
  for (const value of [
    '200000',
    '200000 ',
    ' 200000\u00a0',
    '0200000',
    '200.000',
    '200,000',
    '200 000',
    '200\u202f000',
  ]) {
    const unitPrice = orders.normalizeOrderMoneyInput(value);
    assert.equal(unitPrice, '200000', value);
    const complete = orders.completeManualDraft(
      {
        ...draft,
        codAmount: '',
        declaredValue: '',
        items: [{ productId: id, qty: 2, unitPrice }],
      },
      'ORCA-PRICE-VERIFY',
    );
    assert.equal(complete.codAmount, '400000');
    assert.equal(complete.declaredValue, '400000');
  }
  assert.equal(orders.normalizeOrderMoneyInput('000'), '0');
  for (const value of ['', '200.50', '200,5', '2e5', '-200000', '200.000,000', '1000000000000']) {
    assert.equal(
      orders.manualOrderSchema.safeParse({
        ...draft,
        items: [{ productId: id, qty: 2, unitPrice: orders.normalizeOrderMoneyInput(value) }],
      }).success,
      false,
      value,
    );
  }
  assert.equal(
    orders.manualOrderSchema.safeParse({ ...draft, codAmount: '200.000' }).success,
    false,
  );
});
test('list passes server filters and strict pagination through authenticated API', async () => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url, 'https://app.example.test');
    assert.equal(parsed.pathname, '/api/v1/orders');
    assert.equal(parsed.searchParams.get('channel'), 'manual');
    assert.equal(parsed.searchParams.get('status'), 'RECEIVED');
    assert.equal(parsed.searchParams.get('q'), 'manual-1');
    assert.equal(options.headers.get('Authorization'), 'Bearer seller-test-token');
    return ok([{ ...summary, ...financial }], { limit: 50, hasNext: false, nextCursor: null });
  };
  const result = await orders.ordersApi.list(
    { status: 'RECEIVED', channel: ' manual ', q: ' manual-1 ', from: '', to: '' },
    true,
  );
  assert.equal(result.items.length, 1);
});
test('seller draft generates a readable code and exact total, preserves explicit zero and rejects oversized totals', () => {
  const input = {
    ...draft,
    externalOrderCode: '',
    declaredValue: '',
    items: [{ ...draft.items[0], qty: 3 }],
  };
  assert.equal(orders.manualDraftSchema.safeParse(input).success, true);
  const complete = orders.completeManualDraft(input, 'ORCA-AUTO-001');
  assert.equal(complete.externalOrderCode, 'ORCA-AUTO-001');
  assert.equal(complete.declaredValue, '300000');
  assert.equal(
    orders.completeManualDraft({ ...input, declaredValue: '0' }, 'ORCA-AUTO-001').declaredValue,
    '0',
  );
  assert.throws(() =>
    orders.completeManualDraft(
      { ...input, items: [{ ...draft.items[0], qty: 1000000, unitPrice: '999999999999' }] },
      'ORCA-AUTO-001',
    ),
  );
});
test('import preview uses the read-only validation endpoint and keeps readable grouped row feedback', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/import-preview'));
    assert.ok(options.body instanceof FormData);
    return ok({
      items: [
        {
          row: 2,
          rowId: 'hidden.reference',
          externalOrderCode: 'SHOP-1',
          excelRows: [2, 3],
          status: 'READY',
        },
      ],
      accepted: 0,
      rejected: 0,
      ready: 1,
    });
  };
  const result = await orders.ordersApi.import(new File(['xlsx'], 'orders.xlsx'), undefined, true);
  assert.equal(result.ready, 1);
  assert.deepEqual(result.items[0].excelRows, [2, 3]);
  assert.equal(result.items[0].orderId, undefined);
});
test('existing imports retain the order link and exact correction amounts are readable', () => {
  const result = orders.importResultSchema.parse({
    items: [{ row: 2, rowId: 'existing', status: 'ACCEPTED', existing: true, orderId: id }],
    accepted: 1,
    rejected: 0,
    ready: 0,
  });
  assert.equal(result.items[0].existing, true);
  assert.equal(result.items[0].orderId, id);
  const message = feedback.importRowFeedback(
    {
      row: 3,
      rowId: 'bad',
      status: 'REJECTED',
      issues: [
        { field: 'goodsPaidAmount', reason: 'MAX_AMOUNT', amount: '200001', maximum: '200000' },
      ],
    },
    (key, values) => (values ? `${values.field}: ${values.amount} / ${values.maximum}` : key),
  );
  assert.equal(message, 'fields.goodsPaidAmount: 200.001 / 200.000');
});
test('manual retry sends the same operation reference; multipart leaves boundary to the browser', async () => {
  const keys = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/import')) {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.headers.get('Content-Type'), null);
      return ok({ items: [], accepted: 0, rejected: 0 });
    }
    keys.push(options.headers.get('X-Idempotency-Key'));
    return ok({ orderId: id, status: 'RECEIVED', ...(keys.length > 1 ? { replayed: true } : {}) });
  };
  await orders.ordersApi.create(draft, 'manual.stable');
  assert.equal((await orders.ordersApi.create(draft, 'manual.stable')).replayed, true);
  assert.deepEqual(keys, ['manual.stable', 'manual.stable']);
  await orders.ordersApi.import(new File(['xlsx'], 'orders.xlsx'));
});
test('scope key changes on seller switch, grant revoke and session end so drafts/results remount', () => {
  const first = scope.orderScope();
  useAuthStore.getState().setUser({ ...user, tenantId: id });
  assert.notEqual(scope.orderScope(), first);
  const second = scope.orderScope();
  useAuthStore.getState().setUser({ ...user, roles: ['SELLER_STAFF'] });
  assert.notEqual(scope.orderScope(), second);
  assert.equal(scope.sellerOrderAccess().create, false);
  const third = scope.orderScope();
  useAuthStore.getState().clear();
  assert.notEqual(scope.orderScope(), third);
  assert.equal(scope.sellerOrderAccess().read, false);
});
test('403 preserves session and does not retry creation under another identity', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      { error: { code: 'AUTH.FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    );
  };
  await assert.rejects(orders.ordersApi.create(draft, 'manual.stable'), {
    code: 'AUTH.FORBIDDEN',
    status: 403,
  });
  assert.equal(calls, 1);
  assert.equal(useAuthStore.getState().user.userId, user.userId);
});

test('payment breakdown separates order discounts, deposits and shipping payments', () => {
  const payment = {
    discountAmount: '50000',
    goodsPaidAmount: '100000',
    shippingChargeAmount: '30000',
    shippingPaidAmount: '10000',
  };
  const result = orders.calculateOrderPayment('400000', payment, 'RECIPIENT', 'PARTIAL');
  assert.equal(result.netGoodsAmount, '350000');
  assert.equal(result.codAmount, '250000');
  assert.equal(result.customerShippingFee, '20000');
  assert.equal(orders.orderCollectionTotal({ ...result, shippingFeePayer: 'RECIPIENT' }), '270000');
  assert.equal(
    orders.completeManualDraft(
      {
        ...draft,
        items: [{ ...draft.items[0], qty: 2, unitPrice: '200000' }],
        paymentBreakdown: payment,
        goodsPaymentMode: 'PARTIAL',
        shippingFeePayer: 'RECIPIENT',
      },
      'AUTO',
    ).codAmount,
    '250000',
  );
});
test('fully paid tracks net merchandise after quantity or discount changes; free shipping clears amounts', () => {
  const p = {
    discountAmount: '50000',
    goodsPaidAmount: '1',
    shippingChargeAmount: '30000',
    shippingPaidAmount: '10000',
  };
  for (const gross of ['400000', '600000']) {
    const result = orders.calculateOrderPayment(gross, p, 'SENDER', 'PAID');
    assert.equal(result.codAmount, '0');
    assert.equal(result.paymentBreakdown.goodsPaidAmount, String(BigInt(gross) - 50000n));
    assert.equal(result.customerShippingFee, '0');
    assert.equal(result.paymentBreakdown.shippingChargeAmount, '0');
  }
});
test('invalid discounts and overpayments fail without rounding', () => {
  const p = {
    discountAmount: '0',
    goodsPaidAmount: '0',
    shippingChargeAmount: '30000',
    shippingPaidAmount: '0',
  };
  for (const patch of [
    { discountAmount: '400001' },
    { goodsPaidAmount: '400001' },
    { shippingPaidAmount: '30001' },
    { goodsPaidAmount: '1.5' },
  ])
    assert.throws(() =>
      orders.calculateOrderPayment('400000', { ...p, ...patch }, 'RECIPIENT', 'PARTIAL'),
    );
  assert.throws(() => orders.calculateOrderPayment('999999999999', p, 'RECIPIENT', 'COD'));
});
test('new owner breakdown is accepted while Staff financial projection remains strict', () => {
  const paymentBreakdown = {
    discountAmount: '0',
    goodsPaidAmount: '0',
    shippingChargeAmount: '0',
    shippingPaidAmount: '0',
  };
  assert.deepEqual(
    orders.parseOrder({ ...summary, ...financial, paymentBreakdown }, true).paymentBreakdown,
    paymentBreakdown,
  );
  assert.throws(() => orders.parseOrder({ ...summary, paymentBreakdown }, false));
  assert.equal(
    orders.parseOrder({ ...summary, ...financial, paymentBreakdown: null }, true).paymentBreakdown,
    null,
  );
});

const viewMessages = JSON.parse(
  readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
);
test('successful history explains child progress instead of suggesting an ongoing investigation', () => {
  const html = renderDetail({
    status: 'DISPATCHED',
    holdReason: null,
    statusHistory: [
      {
        fromStatus: 'ALLOCATED',
        toStatus: 'DISPATCHED',
        changedAt: '2026-10-26T01:00:00Z',
        reason: 'ALL_CHILD_STATUS_ROLLUP',
      },
    ],
  });
  assert.ok(!html.includes(viewMessages.Orders.processing_reason));
  assert.ok(html.includes(viewMessages.Orders.reasons.ALL_CHILD_STATUS_ROLLUP));
});
test('unknown historical reasons preserve the transition without inventing an investigation or exposing raw text', () => {
  const raw = 'untrusted database detail / private internal reference';
  const html = renderDetail({
    status: 'ALLOCATED',
    holdReason: null,
    statusHistory: [
      {
        fromStatus: 'VALIDATED',
        toStatus: 'ALLOCATED',
        changedAt: '2026-10-26T00:00:00Z',
        reason: raw,
      },
    ],
  });
  assert.ok(!html.includes(raw));
  assert.ok(!html.includes(viewMessages.Orders.processing_reason));
  assert.ok(html.includes('Đã phân bổ'));
});
test('saved recipient correction is an action awaiting validation, not another failed transition', () => {
  const html = renderDetail({
    status: 'BACKORDER',
    holdReason: null,
    statusHistory: [
      {
        fromStatus: 'FAILED',
        toStatus: 'FAILED',
        reason: 'CORRECTION',
        changedAt: '2026-10-26T11:43:00Z',
      },
      {
        fromStatus: 'FAILED',
        toStatus: 'RECEIVED',
        reason: 'REDISPATCH',
        changedAt: '2026-10-26T11:44:00Z',
      },
    ],
  });
  assert.ok(html.includes('Đã cập nhật thông tin người nhận, chờ kiểm tra lại.'));
  assert.ok(!html.includes('Thất bại → Thất bại'));
  assert.ok(html.includes('Thất bại → Đã tiếp nhận'));
  assert.ok(html.includes('2026-10-26T11:43:00Z'));
});
test('other same-state failures are not described as recipient corrections', () => {
  const html = renderDetail({
    statusHistory: [
      {
        fromStatus: 'FAILED',
        toStatus: 'FAILED',
        reason: 'VALIDATION_FAILED',
        changedAt: '2026-10-26T11:43:00Z',
      },
    ],
  });
  assert.ok(html.includes('Thất bại → Thất bại'));
  assert.ok(!html.includes('Đã cập nhật thông tin người nhận, chờ kiểm tra lại.'));
});
function renderDetail(overrides = {}, locale = 'vi') {
  const order = {
    ...summary,
    ...financial,
    totalAmount: '400000',
    codAmount: '400000',
    declaredValue: '400000',
    recipientName: 'Synthetic recipient',
    recipientPhone: '0900000000',
    recipientAddress: 'Synthetic address',
    provinceName: 'Test province',
    wardName: 'Test ward',
    items: [
      { productId: id, productName: 'Test product', sku: 'TEST-SKU', qty: 2, unitPrice: '200000' },
    ],
    fulfillmentOrders: [],
    statusHistory: [
      { fromStatus: null, toStatus: 'RECEIVED', reason: null, changedAt: summary.createdAt },
    ],
    ...overrides,
  };
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages: viewMessages, timeZone: 'Asia/Ho_Chi_Minh' },
      createElement(OrderDetail, { order }),
    ),
  );
}
test('detail separates collection, recipient and line totals; collapses audit information without losing deposits', () => {
  const html = renderDetail({
    totalAmount: '400000',
    codAmount: '250000',
    shippingFeePayer: 'RECIPIENT',
    customerShippingFee: '20000',
    paymentBreakdown: {
      discountAmount: '50000',
      goodsPaidAmount: '100000',
      shippingChargeAmount: '30000',
      shippingPaidAmount: '10000',
    },
  });
  for (const value of [
    '270.000 ₫',
    '250.000 ₫',
    '20.000 ₫',
    '50.000 ₫',
    '100.000 ₫',
    '400.000 ₫',
    'Synthetic recipient',
    'Test product',
    'TEST-SKU',
  ])
    assert.ok(html.includes(value), value);
  assert.ok(html.includes('Chi tiết tính tiền'));
  assert.ok(!html.includes('<details open'));
  assert.ok(!html.includes('—<!-- -->'));
  assert.ok(!html.includes(id));
  assert.ok(html.includes('chưa phải kết quả thu tiền'));
});
test('scheduled BACKORDER reminder is shown only while waiting and never implies automatic cancellation', () => {
  const message = viewMessages.Orders.backorderReminder;
  assert.ok(renderDetail({ status: 'BACKORDER', backorderReminder: true }).includes(message));
  assert.ok(!renderDetail({ status: 'BACKORDER', backorderReminder: false }).includes(message));
  assert.ok(!renderDetail({ status: 'ALLOCATED', backorderReminder: true }).includes(message));
});
test('legacy detail never invents paid amounts; zero collection does not claim payment verification', () => {
  const html = renderDetail({ codAmount: '0', paymentBreakdown: null });
  assert.ok(html.includes('Không thu tiền người nhận khi giao'));
  assert.ok(html.includes(viewMessages.Orders.legacy_payment_hint));
  assert.ok(!html.includes('Tiền hàng đã trả'));
  assert.ok(!html.includes('Đã thanh toán'));
});
test('Staff detail renders quantity and fulfillment without financial fields or recipient information', () => {
  const html = renderDetail({
    codAmount: undefined,
    totalAmount: undefined,
    recipientName: undefined,
    recipientPhone: undefined,
    recipientAddress: undefined,
    items: [{ productId: id, qty: 2, productName: 'Staff product' }],
  });
  for (const privateText of [
    'Synthetic recipient',
    '0900000000',
    'Thu khi giao',
    'Đơn giá',
    'Thành tiền',
    '₫',
  ])
    assert.ok(!html.includes(privateText), privateText);
  assert.ok(html.includes('Staff product'));
});
test('delivery displays child COD accurately, keeps hold reasons, distinguishes inactive tracking and sorts history newest first', () => {
  const html = renderDetail({
    status: 'ON_HOLD',
    holdReason: 'UNKNOWN_REASON',
    fulfillmentOrders: [
      {
        id,
        sequenceNo: 1,
        status: 'ALLOCATED',
        warehouseName: 'Test warehouse',
        items: [],
        parcels: [],
        codAmount: '50000',
        shipments: [
          {
            id,
            active: false,
            trackingNumber: 'TRACK-OLD',
            status: 'UNKNOWN',
            direction: 'RETURN',
            bookingState: 'UNKNOWN',
          },
        ],
      },
    ],
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'RECEIVED',
        changedAt: '2026-10-08T01:00:00.000Z',
        reason: null,
      },
      {
        fromStatus: 'RECEIVED',
        toStatus: 'ON_HOLD',
        changedAt: '2026-10-09T01:00:00.000Z',
        reason: null,
      },
    ],
  });
  assert.ok(html.includes('COD phân bổ cho đơn giao'));
  assert.ok(html.includes('Không còn hiệu lực'));
  assert.ok(html.includes('Mã vận đơn hoàn'));
  assert.ok(html.includes(viewMessages.Orders.bookingStates.UNKNOWN));
  assert.ok(html.includes('Test warehouse'));
  assert.ok(html.includes(viewMessages.Orders['processing']));
  assert.ok(html.indexOf('9/10/26') < html.indexOf('8/10/26', html.indexOf('<ol')));
});
test('order date formatting is stable in Vietnam timezone and statuses never imply premature success', () => {
  assert.match(presentation.formatOrderDate('2026-10-09T18:05:00.000Z', 'vi'), /10\/10\/26/);
  assert.equal(presentation.orderStatusTone('RECEIVED'), 'default');
  assert.equal(presentation.orderStatusTone('ON_HOLD'), 'warning');
  assert.equal(presentation.orderStatusTone('FAILED'), 'error');
});

test('empty legacy product list is explained and absent delivery on a terminal order is not described as pending', () => {
  const html = renderDetail({ status: 'DELIVERED', items: [] });
  assert.ok(html.includes(viewMessages.Orders.itemsUnavailable));
  assert.ok(html.includes(viewMessages.Orders.noDeliveryRecorded));
  assert.ok(!html.includes(viewMessages.Orders.deliveryPending));
});

test('multiple products retain an exact merchandise subtotal distinct from the collection total', () => {
  const html = renderDetail({
    totalAmount: '450000',
    codAmount: '250000',
    items: [
      { productId: id, productName: 'Mug', qty: 2, unitPrice: '200000' },
      {
        productId: '00000000-0000-4000-8000-000000000099',
        productName: 'Tee',
        qty: 1,
        unitPrice: '50000',
      },
    ],
  });
  assert.ok(html.includes('<tfoot'));
  assert.ok(html.includes('450.000 ₫'));
  assert.ok(html.includes('250.000 ₫'));
  assert.ok(html.includes('400.000 ₫'));
});

test('mobile product summary includes labelled quantity, unit price and line total without requiring a table', () => {
  const html = renderDetail({ totalAmount: '400000' });
  const mobile = html.slice(
    html.indexOf('<ul aria-label="Sản phẩm trong đơn"'),
    html.indexOf('<table'),
  );
  for (const text of [
    'Test product',
    'TEST-SKU',
    'Số lượng',
    'Đơn giá',
    'Thành tiền',
    '200.000 ₫',
    '400.000 ₫',
  ])
    assert.ok(mobile.includes(text), text);
});
test('split delivery retains SKU identifiers for variants that share a product name', () => {
  const html = renderDetail({
    fulfillmentOrders: [
      {
        id,
        sequenceNo: 1,
        status: 'STOCK_RESERVED',
        warehouseName: 'Test warehouse',
        items: [
          { productId: id, productName: 'Same name', sku: 'BLUE-M', qty: 1 },
          {
            productId: '00000000-0000-4000-8000-000000000099',
            productName: 'Same name',
            sku: 'BLUE-L',
            qty: 2,
          },
        ],
        parcels: [],
        shipments: [],
      },
    ],
  });
  const delivery = html.slice(html.indexOf('Sản phẩm và kiện hàng'));
  assert.ok(delivery.includes('BLUE-M'));
  assert.ok(delivery.includes('BLUE-L'));
});

test('Google Sheets binding uses own session and rejects unsafe links or contradictory states', async () => {
  const value = {
    status: 'CONFIGURED',
    spreadsheetUrl:
      'https://docs.google.com/spreadsheets/d/test_document_identifier_12345/edit#gid=123',
    name: 'Orders',
    pollIntervalSeconds: 60,
    lastOrderReceivedAt: null,
  };
  assert.equal(orders.sheetConnectionSchema.parse(value).status, 'CONFIGURED');
  const upgraded = {
    ...value,
    upgradeAvailable: false,
    previousSpreadsheetUrl: value.spreadsheetUrl,
  };
  assert.deepEqual(orders.sheetConnectionSchema.parse(upgraded), upgraded);
  assert.equal(
    orders.sheetConnectionSchema.safeParse({
      ...upgraded,
      previousSpreadsheetUrl: 'javascript:alert(1)',
    }).success,
    false,
  );
  assert.equal(
    orders.sheetConnectionSchema.safeParse({ ...value, upgradeAvailable: true }).success,
    true,
  );

  for (const patch of [
    { spreadsheetUrl: 'https://evil.example.test/' },
    { spreadsheetUrl: 'javascript:alert(1)' },
    {
      spreadsheetUrl:
        'https://docs.google.com.evil.test/spreadsheets/d/test_document_identifier_12345/edit#gid=123',
    },
    { status: 'NOT_CONFIGURED' },
    { credential: 'secret' },
    { lastOrderReceivedAt: 'not-a-date' },
  ])
    assert.equal(orders.sheetConnectionSchema.safeParse({ ...value, ...patch }).success, false);
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://app.example.test').pathname,
      '/api/v1/orders/sheet-connection',
    );
    assert.equal(options.headers.get('Authorization'), 'Bearer seller-test-token');
    assert.equal(options.signal, controller.signal);
    return ok(value);
  };
  assert.deepEqual(await orders.ordersApi.sheetConnection(controller.signal), value);
});

test('managed Sheets setup sends no seller-controlled binding or credential', async () => {
  const value = {
    status: 'NOT_CONFIGURED',
    spreadsheetUrl: null,
    name: null,
    pollIntervalSeconds: null,
    lastOrderReceivedAt: null,
    setupAvailable: true,
    setupState: 'PREPARING',
  };
  assert.equal(orders.sheetConnectionSchema.parse(value).setupState, 'PREPARING');
  assert.equal(
    orders.sheetConnectionSchema.safeParse({ ...value, setupState: 'CONNECTED' }).success,
    false,
  );
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://app.example.test').pathname,
      '/api/v1/orders/sheet-connection',
    );
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer seller-test-token');
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), {});
    return ok(value);
  };
  assert.deepEqual(await orders.ordersApi.createSheet(controller.signal), value);
});

test('direct entry requires an explicit total, strips stale detail fields and accepts prepaid zero', () => {
  const direct = {
    ...draft,
    entryMode: 'DIRECT',
    collectionAmount: '220000',
    declaredValue: '',
    items: [{ productId: id, qty: 2, unitPrice: '' }],
  };
  assert.equal(orders.manualDraftSchema.safeParse(direct).success, true);
  const result = orders.completeManualDraft(direct, 'AUTO');
  assert.deepEqual(result.items, [{ productId: id, qty: 2 }]);
  assert.equal(result.collectionAmount, '220000');
  for (const field of [
    'codAmount',
    'customerShippingFee',
    'shippingFeePayer',
    'paymentBreakdown',
    'declaredValue',
    'entryMode',
  ])
    assert.equal(field in result, false, field);
  assert.equal(
    orders.completeManualDraft({ ...direct, collectionAmount: '0' }, 'AUTO').collectionAmount,
    '0',
  );
  assert.equal(
    orders.manualDraftSchema.safeParse({ ...direct, collectionAmount: '' }).success,
    false,
  );
  assert.throws(() => orders.completeManualDraft({ ...direct, collectionAmount: '' }, 'AUTO'));
  assert.equal(
    orders.directOrderSchema.safeParse({ ...result, customerShippingFee: '20000' }).success,
    false,
  );
});

test('withdrawal details do not describe declared goods values as COD split weights', () => {
  const html = renderDetail({ kind: 'WITHDRAWAL', codAmount: '0', paymentBreakdown: null });
  assert.ok(!html.includes('phân bổ thu hộ'));
  assert.ok(html.includes('Đơn rút hàng không thu COD'));
});
test('direct order detail identifies allocation values and does not invent payment history', () => {
  const html = renderDetail({
    collectionMode: 'DIRECT',
    codAmount: '220000',
    paymentBreakdown: null,
  });
  assert.ok(html.includes('220.000 ₫'));
  assert.ok(html.includes('không phải giá bán'));
  assert.ok(html.includes('Giá trị khai báo / sản phẩm'));
  assert.ok(!html.includes('Tiền hàng còn thu'));
  assert.ok(!html.includes('chưa lưu chi tiết'));
});

test('calculated entry infers buyer shipping without asking who pays the carrier', () => {
  const value = orders.completeManualDraft(
    {
      ...draft,
      entryMode: 'CALCULATED',
      goodsPaymentMode: 'PARTIAL',
      paymentBreakdown: {
        discountAmount: '0',
        goodsPaidAmount: '20000',
        shippingChargeAmount: '30000',
        shippingPaidAmount: '10000',
      },
    },
    'AUTO',
  );
  assert.equal(value.codAmount, '80000');
  assert.equal(value.customerShippingFee, '20000');
  assert.equal(orders.orderCollectionTotal(value), '100000');
});

test('calculated entry preserves delivery instructions while omitting unused direct collection', () => {
  const result = orders.completeManualDraft(
    { ...draft, entryMode: 'CALCULATED', deliveryNote: 'Call first', collectionAmount: '220000' },
    'AUTO',
  );
  assert.equal(result.deliveryNote, 'Call first');
  assert.equal('collectionAmount' in result, false);
});

test('calculated entry rejects shipping overpayment even when shipping charge is zero', () => {
  assert.throws(() =>
    orders.completeManualDraft(
      {
        ...draft,
        entryMode: 'CALCULATED',
        paymentBreakdown: {
          discountAmount: '0',
          goodsPaidAmount: '0',
          shippingChargeAmount: '0',
          shippingPaidAmount: '10000',
        },
      },
      'AUTO',
    ),
  );
});

test('expired-hold review state explains that picking needs ORCA review', () => {
  const html = renderDetail({
    status: 'MANUAL_REVIEW',
    holdReason: 'RESERVATION_RENEWAL_REQUIRED',
  });
  assert.equal(
    feedback.orderReasonKey('RESERVATION_RENEWAL_REQUIRED'),
    'reasons.RESERVATION_RENEWAL_REQUIRED',
  );
  assert.ok(html.includes(viewMessages.Orders.reasons.RESERVATION_RENEWAL_REQUIRED));
  assert.equal(
    feedback.orderReasonKey('ALLOCATION_QUEUE_FAILED'),
    'reasons.ALLOCATION_QUEUE_FAILED',
  );
  assert.equal(feedback.orderReasonKey('untrusted raw database text'), 'processing_reason');
  for (const locale of ['en', 'vi']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
    );
    assert.ok(messages.Orders.reasons.RESERVATION_RENEWAL_REQUIRED.length > 20);
    assert.ok(messages.Orders.reasons.ALLOCATION_QUEUE_FAILED.length > 20);
  }
});

test('direct COD collection and catalog value have distinct labels on mobile and desktop', () => {
  const html = renderDetail({
    collectionMode: 'DIRECT',
    codAmount: '1500000',
    totalAmount: '750000',
    items: [{ productId: id, productName: 'Test product', qty: 5, unitPrice: '150000' }],
    paymentBreakdown: null,
  });
  assert.ok(html.includes('1.500.000 ₫'));
  assert.ok(html.includes('750.000 ₫'));
  assert.equal((html.match(/>Tổng giá trị khai báo</g) ?? []).length, 2);
  assert.ok(!html.includes('Thành tiền'));
  assert.ok(html.includes('không phải giá bán'));
  assert.ok(renderDetail().includes('Thành tiền'));
});
test('allocation status explains both the pending worker and insufficient eligible stock', () => {
  assert.ok(
    renderDetail({ status: 'VALIDATED' }).includes(viewMessages.Orders.allocationQueuedHint),
  );
  assert.ok(renderDetail({ status: 'BACKORDER' }).includes(viewMessages.Orders.backorderHint));
  assert.ok(
    !renderDetail({ status: 'ALLOCATED' }).includes(viewMessages.Orders.allocationQueuedHint),
  );
});

test('pending cancellation does not show allocation or replenishment instructions', () => {
  for (const status of ['VALIDATED', 'BACKORDER']) {
    const html = renderDetail({ status, holdReason: 'CANCEL_PENDING' });
    assert.ok(!html.includes(viewMessages.Orders.allocationQueuedHint));
    assert.ok(!html.includes(viewMessages.Orders.backorderHint));
  }
});

test('direct collection explanations are collapsed while the amount and snapshot remain visible', () => {
  const html = renderDetail({
    collectionMode: 'DIRECT',
    codAmount: '1500000',
    totalAmount: '750000',
    paymentBreakdown: null,
  });
  const explanation = viewMessages.Orders.directCollectionSnapshot;
  const details = [...html.matchAll(/<details([^>]*)>([\s\S]*?)<\/details>/g)].find((m) =>
    m[2].includes(explanation),
  );
  assert.ok(details, 'collection explanation must be available inside details');
  assert.ok(!/\bopen\b/.test(details[1]), 'secondary explanation starts collapsed');
  assert.ok(html.includes('1.500.000 ₫'));
  assert.ok(
    !details[2].includes('1.500.000 ₫'),
    'primary amount stays outside the collapsed explanation',
  );
});
