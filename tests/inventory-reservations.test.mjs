import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let inventoryReservationApi;
let isReservationUnavailableError;
let ApiError;
let useAuthStore;
let reservationTtl;
let fulfillmentOrderCode;
const originalFetch = globalThis.fetch;
const dispatcher = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'dispatcher@example.test',
  fullName: 'Dispatcher',
  roles: ['DISPATCHER'],
  permissions: [],
};
const fulfillmentOrderId = '00000000-0000-4000-8000-000000000040';
const reservation = {
  id: '00000000-0000-4000-8000-000000000050',
  fulfillmentOrderId,
  parentOrderCode: 'DH1234',
  fulfillmentSequenceNo: 1,
  productId: '00000000-0000-4000-8000-000000000010',
  sku: 'SKU-001',
  productName: 'Sample Product',
  warehouseId: '00000000-0000-4000-8000-000000000030',
  warehouseCode: 'HN-01',
  warehouseName: 'Ha Noi Hub',
  qty: 2,
  createdAt: '2026-09-24T02:00:00.000Z',
  expiresAt: '2026-09-24T02:30:00.000Z',
  ttlRemainingSeconds: 1500,
};
const releaseResult = {
  fulfillmentOrderId,
  releasedReservations: [
    {
      reservationId: reservation.id,
      productId: reservation.productId,
      warehouseId: reservation.warehouseId,
      qty: 2,
      onHandQtyAfter: 10,
      reservedQtyAfter: 0,
      availableQtyAfter: 10,
    },
  ],
};
const meta = { timestamp: '2026-09-24T02:00:00.000Z', path: '', requestId: 'test' };
const ok = (data, pagination) =>
  Response.json({ success: true, data, meta: { ...meta, ...(pagination ? { pagination } : {}) } });
const fail = (statusCode, code) =>
  Response.json(
    { success: false, error: { code, message: 'Request failed', statusCode }, meta },
    { status: statusCode },
  );

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ inventoryReservationApi, isReservationUnavailableError } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryReservationApi.ts',
  ));
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  reservationTtl = await server.ssrLoadModule('/src/lib/reservationTtl.ts');
  fulfillmentOrderCode = await server.ssrLoadModule('/src/lib/fulfillmentOrderCode.ts');
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore
    .getState()
    .setSession({ accessToken: 'dispatcher-token', expiresIn: 900, user: dispatcher });
});

test('reservation list sends limit, cursor and fulfillment order and parses the envelope', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/inventory/reservations');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('cursor'), reservation.id);
    assert.equal(requestUrl.searchParams.get('fulfillmentOrderId'), fulfillmentOrderId);
    assert.equal(options.headers.get('Authorization'), 'Bearer dispatcher-token');
    return ok([reservation], { limit: 100, hasNext: true, nextCursor: reservation.id });
  };

  const page = await inventoryReservationApi.list({ fulfillmentOrderId }, reservation.id);

  assert.deepEqual(page.items, [reservation]);
  assert.deepEqual(page.pagination, { limit: 100, hasNext: true, nextCursor: reservation.id });
});

test('reservation list omits empty filters and cursor', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.searchParams.has('fulfillmentOrderId'), false);
    assert.equal(requestUrl.searchParams.has('cursor'), false);
    return ok([], { limit: 100, hasNext: false, nextCursor: null });
  };

  const page = await inventoryReservationApi.list({});

  assert.deepEqual(page.items, []);
});

test('reservation list rejects a payload with a negative TTL', async () => {
  globalThis.fetch = async () =>
    ok([{ ...reservation, ttlRemainingSeconds: -1 }], {
      limit: 100,
      hasNext: false,
      nextCursor: null,
    });

  await assert.rejects(() => inventoryReservationApi.list({}));
});

test('reservation summary parses the active count', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(url, 'https://app.example.test').pathname,
      '/api/v1/inventory/reservations/summary',
    );
    return ok({ activeReservations: 4 });
  };

  assert.deepEqual(await inventoryReservationApi.getSummary(), { activeReservations: 4 });
});

test('release posts to the fulfillment order release endpoint and parses the result', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://app.example.test').pathname,
      `/api/v1/inventory/fulfillment-orders/${fulfillmentOrderId}/reservations/release`,
    );
    assert.equal(options.method, 'POST');
    return ok(releaseResult);
  };

  assert.deepEqual(await inventoryReservationApi.release(fulfillmentOrderId), releaseResult);
});

test('release surfaces the conflict code so the dialog can show the expired message', async () => {
  globalThis.fetch = async () => fail(409, 'INVENTORY.RESERVATION_NOT_ACTIVE');

  await assert.rejects(
    () => inventoryReservationApi.release(fulfillmentOrderId),
    (error) => isReservationUnavailableError(error),
  );
});

test('isReservationUnavailableError only matches the two reservation codes', () => {
  assert.equal(
    isReservationUnavailableError(new ApiError('x', 404, 'INVENTORY.RESERVATION_NOT_FOUND')),
    true,
  );
  assert.equal(
    isReservationUnavailableError(new ApiError('x', 409, 'INVENTORY.RESERVATION_NOT_ACTIVE')),
    true,
  );
  assert.equal(isReservationUnavailableError(new ApiError('x', 409, 'COMMON.CONFLICT')), false);
  assert.equal(isReservationUnavailableError(new Error('x')), false);
});

test('getTtlTone follows the SRS 10-minute and 5-minute thresholds', () => {
  const { getTtlTone } = reservationTtl;
  assert.equal(getTtlTone(601), 'success');
  assert.equal(getTtlTone(600), 'warning');
  assert.equal(getTtlTone(300), 'warning');
  assert.equal(getTtlTone(299), 'error');
  assert.equal(getTtlTone(1), 'error');
  assert.equal(getTtlTone(0), 'expired');
  assert.equal(getTtlTone(-5), 'expired');
});

test('formatTtl renders mm:ss and clamps negatives to zero', () => {
  const { formatTtl } = reservationTtl;
  assert.equal(formatTtl(0), '00:00');
  assert.equal(formatTtl(65), '01:05');
  assert.equal(formatTtl(1800), '30:00');
  assert.equal(formatTtl(-3), '00:00');
});

test('client deadline counts down from the server TTL regardless of the client clock', () => {
  const { toClientDeadlineMs, secondsUntil } = reservationTtl;
  const deadline = toClientDeadlineMs(90, 1_000_000);
  assert.equal(deadline, 1_090_000);
  assert.equal(secondsUntil(deadline, 1_000_000), 90);
  assert.equal(secondsUntil(deadline, 1_000_500), 90);
  assert.equal(secondsUntil(deadline, 1_089_001), 1);
  assert.equal(secondsUntil(deadline, 1_090_000), 0);
  assert.equal(secondsUntil(deadline, 1_200_000), 0);
});

test('fulfillment order code joins the parent order code and sequence number', () => {
  assert.equal(fulfillmentOrderCode.formatFulfillmentOrderCode('DH1234', 2), 'DH1234-2');
});
