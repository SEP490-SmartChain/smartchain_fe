import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let inventoryStockApi;
let warehouseApi;
let useAuthStore;
let syncDelay;
const originalFetch = globalThis.fetch;
const dispatcher = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'dispatcher@example.test',
  fullName: 'Dispatcher',
  roles: ['DISPATCHER'],
  permissions: [],
};
const warehouseId = '00000000-0000-4000-8000-000000000030';
const stockLevel = {
  id: '00000000-0000-4000-8000-000000000020',
  productId: '00000000-0000-4000-8000-000000000010',
  sku: 'SKU-001',
  productName: 'Sample Product',
  warehouseId,
  warehouseCode: 'HN-01',
  warehouseName: 'Ha Noi Hub',
  onHandQty: 10,
  reservedQty: 2,
  availableQty: 8,
  lastSyncedAt: '2026-09-20T02:00:00.000Z',
};
const lastPage = { limit: 100, hasNext: false, nextCursor: null };
const warehouse = {
  id: warehouseId,
  tenantId: dispatcher.tenantId,
  code: 'HN-01',
  name: 'Ha Noi Hub',
  address: '1 Test Street',
  provinceCode: '01',
  districtCode: '001',
  wardCode: '00001',
  latitude: 21,
  longitude: 105.8,
  dailyCapacity: 100,
  priority: 0,
  status: 'ACTIVE',
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-02T02:00:00.000Z',
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-09-24T02:00:00.000Z',
      path: '',
      requestId: 'test',
      ...(pagination ? { pagination } : {}),
    },
  });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ inventoryStockApi } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryStockApi.ts',
  ));
  ({ warehouseApi } = await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  syncDelay = await server.ssrLoadModule('/src/lib/syncDelay.ts');
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

test('warehouse list reads items from data and pagination from meta', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/warehouses');
    return ok([warehouse], { limit: 50, hasNext: true, nextCursor: warehouseId });
  };

  const page = await warehouseApi.list({ search: '', status: '' });

  assert.deepEqual(page.items, [warehouse]);
  assert.deepEqual(page.pagination, { limit: 50, hasNext: true, nextCursor: warehouseId });
});

test('stock levels send trimmed search, warehouse and cursor through the authenticated client', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/inventory/stocks');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('search'), 'sku');
    assert.equal(requestUrl.searchParams.get('warehouseId'), warehouseId);
    assert.equal(requestUrl.searchParams.get('cursor'), stockLevel.id);
    assert.equal(options.headers.get('Authorization'), 'Bearer dispatcher-token');
    return ok([stockLevel], lastPage);
  };

  const page = await inventoryStockApi.list({ search: ' sku ', warehouseId }, stockLevel.id);

  assert.deepEqual(page.items, [stockLevel]);
  assert.deepEqual(page.pagination, lastPage);
});

test('stock levels omit blank search and the all-warehouses filter', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.searchParams.has('search'), false);
    assert.equal(requestUrl.searchParams.has('warehouseId'), false);
    assert.equal(requestUrl.searchParams.has('cursor'), false);
    return ok([], lastPage);
  };

  await inventoryStockApi.list({ search: '   ', warehouseId: '' });
});

for (const [condition, override] of [
  ['a quantity is negative', { reservedQty: -1 }],
  ['a quantity is fractional', { onHandQty: 1.5 }],
  ['the warehouse code is missing', { warehouseCode: undefined }],
  ['lastSyncedAt is not ISO 8601', { lastSyncedAt: 'yesterday' }],
]) {
  test(`malformed stock levels are rejected when ${condition}`, async () => {
    globalThis.fetch = async () => ok([{ ...stockLevel, ...override }], lastPage);

    await assert.rejects(inventoryStockApi.list({ search: '', warehouseId: '' }), {
      name: 'ZodError',
    });
  });
}

test('stock summary is read from the summary endpoint', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/inventory/stocks/summary');
    return ok({ totalSkus: 248, availableUnits: 14820 });
  };

  assert.deepEqual(await inventoryStockApi.getSummary(), {
    totalSkus: 248,
    availableUnits: 14820,
  });
});

test('malformed stock summaries are rejected', async () => {
  globalThis.fetch = async () => ok({ totalSkus: '248', availableUnits: 14820 });

  await assert.rejects(inventoryStockApi.getSummary(), { name: 'ZodError' });
});

test('sync is delayed only after strictly more than 24 hours', () => {
  const syncedAt = '2026-09-20T00:00:00.000Z';
  const syncedAtMs = Date.parse(syncedAt);
  const threshold = syncDelay.SYNC_DELAY_THRESHOLD_MS;

  assert.equal(threshold, 24 * 60 * 60 * 1000);
  assert.equal(syncDelay.isSyncDelayed(syncedAt, new Date(syncedAtMs + threshold)), false);
  assert.equal(syncDelay.isSyncDelayed(syncedAt, new Date(syncedAtMs + threshold + 1)), true);
  assert.equal(syncDelay.isSyncDelayed(syncedAt, new Date(syncedAtMs - 60_000)), false);
  assert.equal(syncDelay.isSyncDelayed('not-a-date', new Date(syncedAtMs)), false);
});

test('inventory KPI values are pluralized and number-formatted per locale', async () => {
  const { createTranslator } = await import('next-intl');
  const { readFile } = await import('node:fs/promises');
  const load = async (locale) =>
    JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'));
  const en = createTranslator({ locale: 'en', messages: await load('en'), namespace: 'Inventory' });
  const vi = createTranslator({ locale: 'vi', messages: await load('vi'), namespace: 'Inventory' });

  assert.equal(en('totalSkusValue', { count: 1 }), '1 SKU');
  assert.equal(en('totalSkusValue', { count: 248 }), '248 SKUs');
  assert.equal(en('availableStockValue', { count: 1 }), '1 unit');
  assert.equal(en('availableStockValue', { count: 14820 }), '14,820 units');
  assert.equal(vi('totalSkusValue', { count: 248 }), '248 SKU');
  assert.equal(vi('availableStockValue', { count: 14820 }), '14.820 đơn vị');
  assert.equal(vi('availableStockHint'), 'Chỉ tính SKU đang bán tại kho đang hoạt động');
  assert.equal(en('availableStockHint'), 'Only active SKUs in active warehouses');
});
