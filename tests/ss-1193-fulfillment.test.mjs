import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, policy, schemas, api, lifecycle, client;
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
  schemas = await server.ssrLoadModule('/src/features/orders/schemas/packingSchema.ts');
  api = await server.ssrLoadModule('/src/features/orders/api/packingApi.ts');
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => {
  await server?.close();
});
const id = '00000000-0000-4000-8000-000000000001';
test('packing rejects zero measurements, empty confirmations and fractional physical quantities', () => {
  const valid = {
    actualWeightG: 100,
    actualLengthCm: '10.25',
    actualWidthCm: '8',
    actualHeightCm: '5',
    contents: [{ itemId: id, qty: 2 }],
    materialCode: 'BOX',
    materialQty: '1',
  };
  assert.equal(schemas.packingFormSchema.safeParse(valid).success, true);
  for (const change of [
    { actualWeightG: 0 },
    { actualLengthCm: '0' },
    { contents: [] },
    { contents: [{ itemId: id, qty: 1.5 }] },
    { materialQty: '1.5' },
  ])
    assert.equal(schemas.packingFormSchema.safeParse({ ...valid, ...change }).success, false);
});
test('operational packing payload rejects backend financial-field leakage', async () => {
  const original = client.get;
  const detail = {
    id,
    status: 'PICKED',
    version: 1,
    sequenceNo: 1,
    orderCode: 'SYNTHETIC',
    recipientName: 'Test',
    recipientPhone: '0900000000',
    recipientAddress: 'Test address',
    items: [],
    packing: [],
    shipments: [],
  };
  try {
    client.get = async () => ({ data: detail });
    assert.equal((await api.packingApi.detail(id, id)).orderCode, 'SYNTHETIC');
    for (const field of ['codAmount', 'unitPrice', 'invoice', 'encryptedCredentials']) {
      client.get = async () => ({ data: { ...detail, [field]: 'secret' } });
      await assert.rejects(api.packingApi.detail(id, id));
    }
  } finally {
    client.get = original;
  }
});

test('SS-1193 task capability scope is explicit for seven roles', () => {
  for (const role of [
    'SELLER_OWNER',
    'SELLER_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
  ]) {
    const effective = policy.getEffectiveRoles(
      [role],
      role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
    );
    for (const cap of [
      'warehouse.packing.confirm',
      'warehouse.handover.create',
      'warehouse.handover.confirm',
    ])
      assert.equal(
        policy.can(effective, cap),
        cap === 'warehouse.handover.create'
          ? ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(role)
          : cap.startsWith('warehouse.')
            ? role === 'WAREHOUSE_STAFF'
            : role === 'SELLER_OWNER',
      );
  }
});
