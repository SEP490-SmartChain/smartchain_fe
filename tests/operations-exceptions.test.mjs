import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, policy, api, client, pending, auth;
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
  ({ operationsExceptionApi: api } = await server.ssrLoadModule(
    '/src/features/orders/api/operationsExceptionApi.ts',
  ));
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  pending = await server.ssrLoadModule('/src/features/orders/lib/exceptionPending.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => server?.close());
const id = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const row = {
  id,
  reference: 'ORDER-TEST',
  sellerName: 'Synthetic seller',
  sourceStatus: 'FAILED',
  warehouseId: null,
  type: 'ORDER',
  reasonCode: 'ORDER.FAILED',
  status: 'OPEN',
  version: 1,
  assignedToPlatformUserId: null,
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
};
test('only Ops may mutate while Admin and Manager retain read access across all seven roles', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    const roles = policy.getEffectiveRoles(
      [role],
      role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
    );
    assert.equal(policy.can(roles, 'exceptions.manage'), role === 'OPS_DISPATCHER');
    assert.equal(
      policy.can(roles, 'exceptions.view'),
      ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'].includes(role),
    );
  }
  assert.equal(
    policy.can(policy.getEffectiveRoles(['OPS_DISPATCHER'], 'TENANT'), 'exceptions.manage'),
    false,
  );
});
test('list forwards bounded filters and abort signal, rejects private fields and unknown health states', async () => {
  const original = client.get;
  const signal = new AbortController().signal;
  const page = {
    items: [row],
    warehouses: [],
    nextCursor: null,
    collection: { status: 'UNAVAILABLE', queuesScanned: 0, checkedAt: null, lastSuccessAt: null },
  };
  const calls = [];
  client.get = async (url, options) => {
    calls.push({ url, options });
    return { data: page };
  };
  try {
    assert.equal(
      (await api.list({ status: 'OPEN', type: '', warehouseId: '' }, undefined, signal)).collection
        .status,
      'UNAVAILABLE',
    );
    assert.deepEqual(calls[0].options.params, { status: 'OPEN' });
    assert.equal(calls[0].options.signal, signal);
    client.get = async () => ({
      data: { ...page, items: [{ ...row, payload: { token: 'SECRET' } }] },
    });
    await assert.rejects(api.list({ status: '', type: '', warehouseId: '' }));
    client.get = async () => ({
      data: { ...page, collection: { ...page.collection, status: 'HEALTHY_WITH_NO_DATA' } },
    });
    await assert.rejects(api.list({ status: '', type: '', warehouseId: '' }));
  } finally {
    client.get = original;
  }
});
test('mutation response must match the selected exception and pending operation', async () => {
  const original = client.post;
  const input = { operationId, expectedVersion: 1, kind: 'RETRY', note: 'Investigated' };
  client.post = async () => ({
    data: { id, operationId, status: 'ASSIGNED', version: 2, outcome: 'QUEUED' },
  });
  try {
    assert.equal((await api.command(id, input)).outcome, 'QUEUED');
    client.post = async () => ({
      data: { id, operationId: id, status: 'ASSIGNED', version: 2, outcome: 'QUEUED' },
    });
    await assert.rejects(api.command(id, input));
  } finally {
    client.post = original;
  }
});
test('uncertain commands keep their original content/reference and scope changes erase investigation text', () => {
  const original = auth.getState();
  try {
    const first = pending.beginExceptionCommand(id, {
      expectedVersion: 1,
      kind: 'NOTE',
      note: 'Private investigation',
    });
    assert.deepEqual(
      pending.beginExceptionCommand(id, { expectedVersion: 9, kind: 'RETRY', note: 'Changed' }),
      first,
    );
    auth.setState({ revision: (original.revision ?? 0) + 1 });
    assert.equal(pending.pendingExceptionCommand(id), undefined);
  } finally {
    auth.setState(original);
    pending.completeExceptionCommand(id);
  }
});
test('UC-114 uses the protected correction route and refuses unexpected address or financial fields', async () => {
  const original = client.post;
  const calls = [];
  client.post = async (url, body) => {
    calls.push({ url, body });
    return { data: { id, operationId, status: 'ASSIGNED', version: 2, outcome: 'QUEUED' } };
  };
  const correction = {
    expectedOrderVersion: 3,
    recipientAddress: 'Synthetic delivery address',
    toProvinceCode: '01',
    toWardCode: '00001',
  };
  try {
    await api.command(id, {
      operationId,
      expectedVersion: 1,
      kind: 'RETRY',
      note: 'Supported location correction',
      correction,
    });
    assert.ok(calls[0].url.endsWith('/correction'));
    assert.equal(calls[0].body.expectedOrderVersion, 3);
    assert.equal(calls[0].body.kind, undefined);
    await assert.rejects(
      api.command(id, {
        operationId,
        expectedVersion: 1,
        kind: 'RETRY',
        note: 'Invalid extra data',
        correction: { ...correction, codAmount: '0' },
      }),
    );
    assert.equal(calls.length, 1);
  } finally {
    client.post = original;
  }
});
