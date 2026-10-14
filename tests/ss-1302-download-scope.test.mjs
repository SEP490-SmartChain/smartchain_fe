import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const warehouse = '00000000-0000-4000-8000-000000000002';
const record = '00000000-0000-4000-8000-000000000003';
const signed = {
  id,
  downloadUrl: 'https://storage.example.test/private-photo',
  expiresInSeconds: 300,
};
const roles = [
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
];
let server, api, auth;
const ok = (data) => Response.json({ success: true, data, meta: {} });
function user(role = 'WAREHOUSE_STAFF') {
  const seller = role.startsWith('SELLER');
  return {
    userId: id,
    tenantId: seller ? id : null,
    actorScope: seller ? 'TENANT' : 'PLATFORM',
    roles: [role],
    permissions: [],
    warehouseIds: [warehouse],
    email: 'download@example.test',
    fullName: 'Synthetic download actor',
  };
}
before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    configFile: false,
    envFile: false,
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ evidenceApi: api } = await server.ssrLoadModule('/src/features/inbound/api/evidenceApi.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() => {
  auth
    .getState()
    .setSession({ accessToken: 'synthetic-download-token', expiresIn: 900, user: user() });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

for (const role of roles) {
  test(`SS-1302: denied download keeps the ${role} session and never refreshes`, async () => {
    auth.getState().setUser(user(role));
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(new URL(url, 'https://example.test').pathname);
      return Response.json(
        {
          success: false,
          error: { code: 'AUTH.FORBIDDEN', message: 'Scope denied', statusCode: 403 },
          meta: {},
        },
        { status: 403 },
      );
    };
    await assert.rejects(api.download(warehouse, id, record, id), {
      name: 'ApiError',
      status: 403,
      code: 'AUTH.FORBIDDEN',
    });
    assert.deepEqual(calls, [
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/records/${record}/evidence/${id}/download`,
    ]);
    assert.equal(auth.getState().accessToken, 'synthetic-download-token');
    assert.deepEqual(auth.getState().user.roles, [role]);
  });
}
for (const field of [
  'objectKey',
  'tenantId',
  'uploadedByPlatformUserId',
  'apiSecret',
  'codAmount',
  'invoice',
  'recipientPhone',
]) {
  test(`SS-1302: a private download rejects unexpected field ${field}`, async () => {
    globalThis.fetch = async () => ok({ ...signed, [field]: 'synthetic-private' });
    await assert.rejects(api.download(warehouse, id, record, id), { name: 'ZodError' });
  });
}
for (const downloadUrl of [
  'javascript:alert(1)',
  'data:text/html,private',
  'http://storage.example.test/private',
  'https://user:password@storage.example.test/private',
]) {
  test(`SS-1302: private download rejects unsafe URL ${downloadUrl}`, async () => {
    globalThis.fetch = async () => ok({ ...signed, downloadUrl });
    await assert.rejects(api.download(warehouse, id, record, id), { name: 'ZodError' });
  });
}
for (const change of ['warehouse', 'role', 'seller', 'logout']) {
  test(`SS-1302: pending download is discarded after ${change} scope changes`, async () => {
    let release;
    let started;
    const requested = new Promise((resolve) => {
      started = resolve;
    });
    globalThis.fetch = () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const rejected = assert.rejects(api.download(warehouse, id, record, id), {
      code: 'AUTH.SCOPE_CHANGED',
    });
    await requested;
    if (change === 'logout') auth.getState().clear();
    else if (change === 'warehouse') auth.getState().setUser({ ...user(), warehouseIds: [] });
    else if (change === 'role')
      auth.getState().setUser({ ...user(), roles: ['WAREHOUSE_MANAGER'] });
    else auth.getState().setUser(user('SELLER_STAFF'));
    release(ok(signed));
    await rejected;
  });
}
test('SS-1302: a same-scope token rotation does not discard an authorized download', async () => {
  let release;
  let started;
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  globalThis.fetch = () => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const pending = api.download(warehouse, id, record, id);
  await requested;
  auth
    .getState()
    .setSession({ accessToken: 'synthetic-rotated-token', expiresIn: 900, user: user() });
  release(ok(signed));
  assert.deepEqual(await pending, signed);
});
