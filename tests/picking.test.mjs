import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, policy, schemas, api, client;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  schemas = await server.ssrLoadModule('/src/features/orders/schemas/pickingSchema.ts');
  api = await server.ssrLoadModule('/src/features/orders/api/pickingApi.ts');
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => {
  await server?.close();
});
test('pick actions separate Manager approval from Staff physical execution for seven roles', () => {
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
    const effective = policy.getEffectiveRoles(
      [role],
      role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
    );
    assert.equal(policy.can(effective, 'warehouse.picking.manage'), role === 'WAREHOUSE_MANAGER');
    assert.equal(policy.can(effective, 'warehouse.picking.confirm'), role === 'WAREHOUSE_STAFF');
  }
  for (const scope of [null, 'TENANT', 'unknown'])
    assert.equal(
      policy.can(policy.getEffectiveRoles(['WAREHOUSE_STAFF'], scope), 'warehouse.picking.confirm'),
      false,
    );
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['WAREHOUSE_STAFF', 'SELLER_OWNER'], 'PLATFORM'),
      'warehouse.picking.confirm',
    ),
    false,
  );
});
test('physical scan requires positive bounded quantity and all three identities', () => {
  const valid = { binScan: 'BIN-1', skuScan: 'RICE', lotScan: 'LOT-1', qty: 1 };
  assert.equal(schemas.pickScanSchema.safeParse(valid).success, true);
  assert.equal(schemas.pickScanSchema.safeParse({ ...valid, qty: 0 }).success, false);
  assert.equal(schemas.pickScanSchema.safeParse({ ...valid, lotScan: '' }).success, false);
});
test('strict operational line refuses financial and blind expected fields', () => {
  const line = {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    sku: 'RICE',
    productName: 'Rice',
    binCode: 'B-1',
    lotCode: 'L-1',
    pickedQty: 0,
    remainingQty: 2,
    shortage: null,
  };
  assert.equal(api.pickLineSchema.safeParse(line).success, true);
  for (const key of ['codAmount', 'unitPrice', 'expectedQty', 'recipientPhone'])
    assert.equal(api.pickLineSchema.safeParse({ ...line, [key]: 'secret' }).success, false);
});

test('retry sends the exact same scan reference, payload and warehouse', async () => {
  const original = client.post,
    calls = [];
  client.post = async (path, payload, options) => {
    calls.push({ path, payload: structuredClone(payload), options });
    return {
      data: {
        lineId: '00000000-0000-4000-8000-000000000001',
        version: 2,
        pickedQty: 1,
        remainingQty: 1,
      },
    };
  };
  try {
    const command = {
      path: 'pick-lines/00000000-0000-4000-8000-000000000001/confirm',
      payload: {
        clientScanId: '00000000-0000-4000-8000-000000000002',
        binScan: 'B-1',
        skuScan: 'RICE',
        lotScan: 'L-1',
        qty: 1,
        expectedVersion: 1,
      },
    };
    await api.pickingApi.execute('warehouse-1', command);
    await api.pickingApi.execute('warehouse-1', command);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].options.params.warehouseId, 'warehouse-1');
  } finally {
    client.post = original;
  }
});
