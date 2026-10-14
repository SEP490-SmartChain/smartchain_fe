import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, schemas, auth, policy;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001',
  warehouse = '00000000-0000-4000-8000-000000000002',
  bin = '00000000-0000-4000-8000-000000000003';
const input = {
  operationKey: id,
  expectedVersion: 2,
  toBinId: bin,
  fromBinScan: 'A-1',
  toBinScan: 'B-1',
  skuScan: 'SKU-1',
  lotScan: 'LOT-1',
  qty: 3,
  reason: 'Move to a suitable shelf',
};
const source = {
  id,
  version: 2,
  sku: 'SKU-1',
  productName: 'Test product',
  lotCode: 'LOT-1',
  fromBinId: warehouse,
  fromBinCode: 'A-1',
  stockState: 'SELLABLE',
  availableQty: 7,
};
const result = {
  id: bin,
  sourceStockId: id,
  toBinId: bin,
  qty: 3,
  stockState: 'SELLABLE',
  sourceVersion: 3,
};
const state = { items: [source], nextCursor: null };
const ok = (data) => Response.json({ success: true, data, meta: {} });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/inbound/api/relocationApi.ts');
  api = schemas.relocationApi;
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth.getState().setSession({
    accessToken: 'synthetic-discrepancy-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'staff@example.test',
      fullName: 'Test Staff',
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('reads only scoped operational stock and bounded destination metadata', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/putaway/relocation`,
    );
    return ok(state);
  };
  assert.deepEqual(await api.positions(warehouse, null), state);
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url, 'https://example.test').searchParams.get('search'), 'A%_');
    return ok({ bins: [{ id: bin, code: 'B-1' }], moreBins: false });
  };
  assert.deepEqual(await api.bins(warehouse, id, 'A%_'), {
    bins: [{ id: bin, code: 'B-1' }],
    moreBins: false,
  });
});
test('submits only actual movement scans/version/reason and validates source/state/quantity proof', async () => {
  globalThis.fetch = async (url, opts) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/putaway/relocation/${id}`,
    );
    assert.deepEqual(JSON.parse(opts.body), input);
    return ok(result);
  };
  assert.deepEqual(await api.post(warehouse, source, input), result);
});
test('unknown committed result retries exactly the same movement operation', async () => {
  const commands = [];
  globalThis.fetch = async (url, opts) => {
    commands.push(JSON.parse(opts.body));
    if (commands.length === 1) throw new TypeError('Lost response');
    return ok(result);
  };
  await assert.rejects(api.post(warehouse, source, input));
  assert.deepEqual(await api.post(warehouse, source, input), result);
  assert.deepEqual(commands, [input, input]);
});
for (const [name, change] of Object.entries({
  source: { sourceStockId: warehouse },
  destination: { toBinId: warehouse },
  quantity: { qty: 2 },
  state: { stockState: 'QUARANTINE' },
  version: { sourceVersion: 2 },
  privacy: { tenantId: id },
  balance: { availableQty: 4 },
}))
  test(`rejects mismatched ${name} result`, async () => {
    globalThis.fetch = async () => ok({ ...result, ...change });
    await assert.rejects(api.post(warehouse, source, input));
  });
for (const [name, change] of Object.entries({
  privacy: { tenantId: id },
  money: { declaredValue: 100 },
  ledger: { reservedQty: 2 },
  receiving: { stockState: 'RECEIVING' },
  zero: { availableQty: 0 },
  version: { version: 0 },
}))
  test(`rejects invalid ${name} position projection`, async () => {
    globalThis.fetch = async () => ok({ ...state, items: [{ ...source, ...change }] });
    await assert.rejects(api.positions(warehouse, null));
  });
test('refuses oversized/duplicate/private destination choices', async () => {
  for (const change of [
    { bins: [{ id: bin, code: 'B-1', tenantId: id }] },
    {
      bins: [
        { id: bin, code: 'B-1' },
        { id: bin, code: 'B-1' },
      ],
    },
  ]) {
    globalThis.fetch = async () => ok({ bins: [], moreBins: false, ...change });
    await assert.rejects(api.bins(warehouse, id, ''));
  }
});
test('excessive quantity and same-bin movement never reach the API', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return ok(result);
  };
  for (const change of [{ qty: 8 }, { toBinId: warehouse }])
    await assert.rejects(api.post(warehouse, source, { ...input, ...change }));
  assert.equal(calls, 0);
});
test('strict intent schema refuses forged effects, bad versions/scans/reasons', () => {
  for (const change of [
    { tenantId: id },
    { stockState: 'SELLABLE' },
    { actorId: id },
    { qty: 0 },
    { qty: 1.5 },
    { expectedVersion: 0 },
    { operationKey: 'bad' },
    { skuScan: '' },
    { lotScan: ' LOT-1' },
    { reason: 'ab' },
    { reason: 'x'.repeat(501) },
  ])
    assert.equal(schemas.relocationInputSchema.safeParse({ ...input, ...change }).success, false);
});
test('quarantine relocation must preserve the quarantine response state', async () => {
  const q = { ...source, stockState: 'QUARANTINE' };
  globalThis.fetch = async () => ok({ ...result, stockState: 'QUARANTINE' });
  assert.equal((await api.post(warehouse, q, input)).stockState, 'QUARANTINE');
  globalThis.fetch = async () => ok(result);
  await assert.rejects(api.post(warehouse, q, input));
});
test('only assigned-warehouse Manager and Staff have the relocation capability', () => {
  for (const role of [
    'WAREHOUSE_STAFF',
    'WAREHOUSE_MANAGER',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ])
    assert.equal(
      policy.can(
        policy.getEffectiveRoles([role], role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM'),
        'warehouse.putaway.relocate',
      ),
      ['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER'].includes(role),
    );
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['WAREHOUSE_MANAGER', 'SELLER_OWNER'], 'PLATFORM'),
      'warehouse.putaway.relocate',
    ),
    false,
  );
});
