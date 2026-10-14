import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let expiryApi;
let settingsApi;
let policy;
let auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const position = {
  id,
  lotId: '00000000-0000-4000-8000-000000000002',
  warehouseId: '00000000-0000-4000-8000-000000000003',
  warehouseCode: 'HN-01',
  sku: 'SKU-EXP-01',
  productName: 'Synthetic expiry product',
  lotCode: 'LOT-2026-01',
  binCode: 'A-01-01',
  expiresOn: '2026-10-20',
  remainingDays: 7,
  lotStatus: 'NEAR_EXPIRY',
  onHandQty: 12,
  reservedQty: 3,
  availableQty: 9,
  minOutboundDays: 30,
  warningDays: 45,
  isBlocked: false,
  stockVersion: 2,
  lotVersion: 3,
};
const setting = {
  tenantId: id,
  warehouseId: null,
  version: 1,
  expiryEnabled: true,
  lowStockEnabled: true,
  lowStockAvailable: false,
  warningDays: 45,
  transitDays: 2,
  bufferDays: 5,
  emailRecipient: 'alerts@example.test',
  zaloRecipient: null,
  channels: ['EMAIL'],
  updatedAt: '2026-10-13T00:00:00.000Z',
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-13T00:00:00.000Z',
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
  ({ inventoryExpiryApi: expiryApi } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryExpiryApi.ts',
  ));
  ({ inventoryNotificationSettingsApi: settingsApi } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryNotificationSettingsApi.ts',
  ));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  auth.getState().setSession({
    accessToken: 'synthetic-expiry-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: id,
      email: 'owner@example.test',
      fullName: 'Expiry Owner',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
    },
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('near-expiry API scopes by warehouse and parses physical eligibility fields', async () => {
  globalThis.fetch = async (url) => {
    const request = new URL(url, 'https://app.example.test');
    assert.equal(request.pathname, '/api/v1/lots/near-expiry');
    assert.equal(request.searchParams.get('warehouseId'), position.warehouseId);
    assert.equal(request.searchParams.get('search'), 'SKU-EXP');
    assert.equal(request.searchParams.has('tenantId'), false);
    return ok([position], { limit: 50, hasNext: false, nextCursor: null });
  };
  const page = await expiryApi.list({ warehouseId: position.warehouseId, search: 'SKU-EXP' });
  assert.deepEqual(page.items, [position]);
  assert.equal(page.items[0].isBlocked, false);
});

test('near-expiry response rejects invalid eligibility and extra scope fields', async () => {
  globalThis.fetch = async () =>
    ok([{ ...position, isBlocked: 'no', tenantId: id }], {
      limit: 50,
      hasNext: false,
      nextCursor: null,
    });
  await assert.rejects(expiryApi.list({ warehouseId: position.warehouseId, search: '' }), {
    name: 'ZodError',
  });
});

test('seller owner settings create then update through versioned API routes', async () => {
  let saved = setting;
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://app.example.test');
    assert.equal(request.pathname, '/api/v1/inventory/notification-settings');
    if (options.method === 'GET') return ok(saved);
    const body = JSON.parse(options.body);
    assert.equal(body.expectedVersion, options.method === 'POST' ? 0 : 1);
    const { expectedVersion: _expectedVersion, ...values } = body;
    saved = { ...saved, ...values, version: 2 };
    return ok(saved);
  };
  assert.deepEqual(await settingsApi.get(), setting);
  const input = {
    tenantId: id,
    warehouseId: null,
    expiryEnabled: true,
    lowStockEnabled: true,
    warningDays: 45,
    transitDays: 2,
    bufferDays: 5,
    emailRecipient: 'alerts@example.test',
    zaloRecipient: null,
    channels: ['EMAIL'],
  };
  await settingsApi.create({ ...input, expectedVersion: 0 });
  await settingsApi.update({ ...input, expectedVersion: 1, warningDays: 60 });
});

test('expiry screen and notification settings stay owner-only in the FE capability map', () => {
  assert.equal(policy.can(['SELLER_OWNER'], 'inventory.expiry.view'), true);
  assert.equal(policy.can(['WAREHOUSE_MANAGER'], 'inventory.expiry.view'), true);
  assert.equal(policy.can(['SELLER_OWNER'], 'inventory.notifications.manage'), true);
  assert.equal(policy.can(['SELLER_STAFF'], 'inventory.notifications.manage'), false);
  assert.equal(policy.can(['WAREHOUSE_STAFF'], 'inventory.notifications.manage'), false);
});
