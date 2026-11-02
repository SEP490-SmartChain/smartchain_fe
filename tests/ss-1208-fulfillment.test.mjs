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
  lifecycle = await server.ssrLoadModule('/src/features/orders/api/orderLifecycleApi.ts');
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => {
  await server?.close();
});
const id = '00000000-0000-4000-8000-000000000001';

test('SS-1208 task capability scope is explicit for seven roles', () => {
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
    for (const cap of ['orders.lifecycle.manage'])
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
test('SS-1208 correction keeps original order version', async () => {
  const original = client.patch;
  try {
    let sent;
    client.patch = async (path, body) => {
      sent = body;
      return { data: { id, status: 'FAILED', version: 2 } };
    };
    await lifecycle.orderLifecycleApi.correct(id, {
      expectedVersion: 1,
      recipientName: 'QA',
      recipientPhone: '0900000000',
      recipientAddress: 'Synthetic address',
      toProvinceCode: '01',
      toWardCode: '00001',
    });
    assert.equal(sent.expectedVersion, 1);
  } finally {
    client.patch = original;
  }
});
