import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let api;
let auth;
let policy;
let warehouseApi;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const filters = {
  search: ' SKU ',
  lotCode: ' LOT ',
  binCode: '',
  expiresAfter: '',
  expiresBefore: '',
  movementType: '',
  from: '',
  to: '',
};
const position = {
  id,
  sku: 'SKU',
  productName: 'Synthetic product',
  warehouseCode: 'HN',
  lotCode: 'LOT',
  binCode: 'HN-001',
  expiresOn: null,
  lotStatus: 'SELLABLE',
  stockState: 'SELLABLE',
  positionKind: 'LOT_BIN',
  onHandQty: 10,
  reservedQty: 2,
  availableQty: 8,
  eligibilityReason: 'ELIGIBLE',
};
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { pagination: { limit: 50, hasNext: false, nextCursor: null } },
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
  ({ inventoryDetailApi: api } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryDetailApi.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  warehouseApi = await server.ssrLoadModule('/src/features/inventory/api/inventoryWarehouseApi.ts');
  auth
    .getState()
    .setSession({
      accessToken: 'synthetic-owner-token',
      expiresIn: 900,
      user: {
        userId: id,
        tenantId: id,
        email: 'owner@example.test',
        fullName: 'Owner',
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

test('lot/bin request trims filters and authenticates without accepting a client tenant', async () => {
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, '/api/v1/inventory/positions');
    assert.equal(request.searchParams.get('search'), 'SKU');
    assert.equal(request.searchParams.get('lotCode'), 'LOT');
    assert.equal(request.searchParams.has('binCode'), false);
    assert.equal(request.searchParams.has('tenantId'), false);
    assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-owner-token');
    return ok([position]);
  };
  assert.deepEqual((await api.positions(filters)).items, [position]);
});

for (const extra of [
  { availableQty: -1 },
  { eligibilityReason: 'INVENTED' },
  { codAmount: '100000' },
]) {
  test(`rejects invalid or unauthorized position fields ${JSON.stringify(extra)}`, async () => {
    globalThis.fetch = async () => ok([{ ...position, ...extra }]);
    await assert.rejects(api.positions(filters), { name: 'ZodError' });
  });
}

test('ledger request reads actor/source evidence and signed deltas', async () => {
  const movement = {
    id,
    sku: 'SKU',
    warehouseCode: 'HN',
    lotCode: 'LOT',
    binCode: 'HN-001',
    type: 'PICK',
    onHandDelta: -2,
    reservedDelta: -2,
    onHandAfter: 8,
    reservedAfter: 0,
    refType: 'pick_confirmation',
    refId: id,
    actorReference: id,
    createdAt: '2026-10-10T00:00:00.000Z',
  };
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url, 'https://example.test').pathname, '/api/v1/inventory/ledger');
    return ok([movement]);
  };
  assert.deepEqual((await api.ledger(filters)).items, [movement]);
});

test('UC-46 and UC-47 capabilities preserve their separate actor scope', () => {
  const roles = [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ];
  for (const role of roles) {
    assert.equal(
      policy.can([role], 'inventory.positions.view'),
      ['SELLER_OWNER', 'SELLER_STAFF', 'WAREHOUSE_MANAGER'].includes(role),
    );
    assert.equal(
      policy.can([role], 'inventory.ledger.view'),
      ['SELLER_OWNER', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'].includes(role),
    );
  }
  assert.deepEqual(policy.getEffectiveRoles(['SELLER_OWNER', 'WAREHOUSE_MANAGER'], null), []);
});

test('inventory accepts platform warehouse labels with nullable seller scope and strips unused fields', async () => {
  globalThis.fetch = async () => ok([{ id, code: 'HN', name: 'Synthetic warehouse', tenantId: null,
    ownershipScope: 'PLATFORM', contactPhone: 'synthetic-private-field' }]);
  assert.deepEqual((await warehouseApi.listInventoryWarehouses()).items, [{ id, code: 'HN', name: 'Synthetic warehouse' }]);
});
