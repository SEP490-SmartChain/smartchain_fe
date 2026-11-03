import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, policy, api, client;
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
  ({ operationsCancellationApi: api } = await server.ssrLoadModule(
    '/src/features/orders/api/operationsCancellationApi.ts',
  ));
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => server?.close());
test('Ops cancellation is a platform-only capability without seller intake or cross-scope fallback', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    const scope = role.startsWith('SELLER_') ? 'TENANT' : 'PLATFORM';
    assert.equal(
      policy.can(policy.getEffectiveRoles([role], scope), 'orders.cancellation.ops'),
      role === 'OPS_DISPATCHER',
    );
  }
  for (const roles of [['OPS_DISPATCHER', 'SELLER_OWNER'], ['LEGACY'], []])
    assert.equal(policy.can(roles, 'orders.cancellation.ops'), false);
  assert.equal(
    policy.can(policy.getEffectiveRoles(['OPS_DISPATCHER'], 'TENANT'), 'orders.cancellation.ops'),
    false,
  );
  assert.equal(policy.can(['OPS_DISPATCHER'], 'orders.create'), false);
  assert.equal(policy.can(['SELLER_OWNER'], 'orders.cancellation.manage'), true);
});
const id = '00000000-0000-4000-8000-000000000001';
test('Ops reads only the server-scoped candidates and rejects financial-field leakage', async () => {
  const original = client.get,
    calls = [],
    signal = new AbortController().signal;
  const row = {
    id,
    orderCode: 'REVIEW-1',
    sellerName: 'Seller',
    warehouses: ['HN', 'DN'],
    status: 'ALLOCATED',
    version: 1,
    holdReason: null,
  };
  client.get = async (url, options) => {
    calls.push({ url, options });
    return { data: { items: [row], nextCursor: null } };
  };
  try {
    assert.equal((await api.list('REVIEW-1', id, signal)).items[0].orderCode, 'REVIEW-1');
    assert.equal(calls[0].url, '/v1/orders/operations/cancellation-candidates');
    assert.deepEqual(calls[0].options.params, { search: 'REVIEW-1', cursor: id });
    assert.equal(calls[0].options.signal, signal);
    client.get = async () => ({
      data: { items: [{ ...row, codAmount: '100000' }], nextCursor: null },
    });
    await assert.rejects(api.list(''));
  } finally {
    client.get = original;
  }
});
