import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, schemas, api, client, scope, auth;
const id = '00000000-0000-4000-8000-000000000001';
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null },
  });
  schemas = await server.ssrLoadModule('/src/features/orders/schemas/withdrawalSchema.ts');
  api = await server.ssrLoadModule('/src/features/orders/api/withdrawalApi.ts');
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  scope = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  await server?.close();
});
const command = {
  clientRequestId: id,
  warehouseId: id,
  productId: id,
  lotId: id,
  qty: 1,
  addressVersion: 1,
};
test('withdrawal command refuses arbitrary address, seller, money and invalid quantities', () => {
  assert.equal(schemas.withdrawalCommandSchema.safeParse(command).success, true);
  for (const key of ['recipientAddress', 'tenantId', 'codAmount', 'shippingFeePayer'])
    assert.equal(
      schemas.withdrawalCommandSchema.safeParse({ ...command, [key]: 'forged' }).success,
      false,
    );
  for (const qty of [0, -1, 1.5, 1000001])
    assert.equal(schemas.withdrawalCommandSchema.safeParse({ ...command, qty }).success, false);
  assert.equal(
    schemas.withdrawalCommandSchema.safeParse({ ...command, addressVersion: 0 }).success,
    false,
  );
});
test('registered address requires phone and administrative identity', () => {
  const valid = {
    recipientName: 'Seller',
    recipientPhone: '0900000000',
    address: 'Registered street',
    provinceCode: '01',
    wardCode: '00001',
  };
  assert.equal(schemas.withdrawalAddressFormSchema.safeParse(valid).success, true);
  for (const invalid of [{ recipientPhone: 'bad' }, { address: '' }, { wardCode: '' }])
    assert.equal(
      schemas.withdrawalAddressFormSchema.safeParse({ ...valid, ...invalid }).success,
      false,
    );
});
test('only an active or suspended Owner sees withdrawal actions', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    for (const serviceStatus of ['ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_ACTIVATION']) {
      auth
        .getState()
        .setSession({
          accessToken: 'synthetic',
          expiresIn: 60,
          user: {
            userId: id,
            tenantId: role.startsWith('SELLER') ? id : null,
            actorScope: role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
            roles: [role],
            permissions: [],
            email: 'synthetic@example.test',
            fullName: 'Synthetic',
            serviceStatus,
          },
        });
      assert.equal(
        scope.sellerWithdrawalAccess(),
        role === 'SELLER_OWNER' && ['ACTIVE', 'SUSPENDED'].includes(serviceStatus),
      );
    }
  }
});
test('API preserves the exact request reference across retries and rejects unexpected response fields', async () => {
  const original = client.post,
    calls = [];
  client.post = async (path, input) => {
    calls.push({ path, input });
    return { data: { orderId: id, status: 'VALIDATED', replayed: calls.length > 1 } };
  };
  try {
    await api.withdrawalApi.create(command);
    const replay = await api.withdrawalApi.create(command);
    assert.equal(replay.replayed, true);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].path, '/v1/orders/withdrawals');
    client.post = async () => ({ data: { orderId: id, status: 'VALIDATED', token: 'unexpected' } });
    await assert.rejects(api.withdrawalApi.create(command));
  } finally {
    client.post = original;
  }
});
