import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, store, policy;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const staff = {
  userId: id,
  fullName: 'Staff',
  email: 'staff@example.test',
  warehouseIds: [warehouseId],
};
const pagination = { limit: 20, hasNext: false, nextCursor: null };
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { pagination, timestamp: '2026-10-06T00:00:00Z', path: '', requestId: 'fixture' },
  });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ platformStaffApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/platformStaffApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'fixture-token',
    expiresIn: 900,
    user: {
      ...staff,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
    },
  });
});

test('staff access route, menu and action are restricted to ORCA_ADMIN', () => {
  for (const role of policy.ORCA_ROLES) {
    const allowed = role === 'ORCA_ADMIN';
    assert.equal(policy.can([role], 'iam.warehouses.assign'), allowed);
    assert.equal(policy.isRouteAllowed([role], '/admin/staff'), allowed);
    assert.equal(
      policy.getSearchLinks([role], false).some((item) => item.href === '/admin/staff'),
      allowed,
    );
  }
  assert.equal(policy.can(['ORCA_ADMIN', 'SELLER_OWNER'], 'iam.warehouses.assign'), false);
});
test('replacement sends PUT with only warehouse IDs and awaits server confirmation', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'http://fixture.test').pathname.endsWith(`/v1/admin/staff/${id}/warehouses`),
      true,
    );
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers.get('Authorization'), 'Bearer fixture-token');
    assert.deepEqual(JSON.parse(options.body), { warehouseIds: [warehouseId] });
    return ok({ ...staff, passwordHash: 'must-be-stripped' });
  };
  assert.deepEqual(await api.replace(id, { warehouseIds: [warehouseId] }), staff);
});
test('empty replacement revokes all assignments', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { warehouseIds: [] });
    return ok({ ...staff, warehouseIds: [] });
  };
  assert.deepEqual((await api.replace(id, { warehouseIds: [] })).warehouseIds, []);
});
test('duplicate or malformed IDs fail before any request', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return ok(staff);
  };
  await assert.rejects(api.replace(id, { warehouseIds: [warehouseId, warehouseId] }));
  await assert.rejects(api.replace(id, { warehouseIds: ['invalid'] }));
  assert.equal(calls, 0);
});
test('403 keeps the session and never reports a successful save', async () => {
  globalThis.fetch = async () =>
    Response.json(
      { success: false, error: { code: 'AUTH.FORBIDDEN', message: 'Access denied' } },
      { status: 403 },
    );
  await assert.rejects(api.replace(id, { warehouseIds: [] }), { code: 'AUTH.FORBIDDEN' });
  assert.equal(store.getState().accessToken, 'fixture-token');
});
test('list and warehouse options validate paginated responses and strip unknown fields', async () => {
  globalThis.fetch = async (url) =>
    new URL(url, 'http://fixture.test').pathname.endsWith('warehouse-options')
      ? ok([{ id: warehouseId, code: 'HUB', name: 'Hub', encryptedSecret: 'must-be-stripped' }])
      : ok([staff]);
  assert.deepEqual((await api.list()).items, [staff]);
  assert.deepEqual((await api.warehouseOptions()).items, [
    { id: warehouseId, code: 'HUB', name: 'Hub' },
  ]);
});
