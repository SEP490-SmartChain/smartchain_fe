import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const id = '13020001-0000-4000-8000-000000000001';
const originalFetch = globalThis.fetch;
const roles = [
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
];
const signed = { downloadUrl: 'https://storage.example.test/private.pdf', expiresInSeconds: 300 };
let server, api, auth;
function user(role = 'SELLER_OWNER') {
  const seller = role.startsWith('SELLER');
  return {
    userId: id,
    tenantId: seller ? id : null,
    actorScope: seller ? 'TENANT' : 'PLATFORM',
    roles: [role],
    permissions: [],
    warehouseIds: [],
    email: 'audit@example.test',
    fullName: 'Synthetic audit actor',
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
  ({ commercialApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/commercialApi.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() =>
  auth.getState().setSession({ accessToken: 'synthetic-token', expiresIn: 900, user: user() }),
);
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
const downloads = {
  preview: () => api.preview(id),
  original: () => api.originalPdf(id),
  contract: () => api.contractPdf(id, id),
  signed: () => api.evidence(id),
};
for (const [name, download] of Object.entries(downloads)) {
  test(`SS-1302: ${name} accepts the exact private artifact contract`, async () => {
    globalThis.fetch = async () => Response.json({ success: true, data: signed, meta: {} });
    assert.deepEqual(await download(), signed);
  });
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,private',
    'file:///private.pdf',
    'http://external.example.test/private.pdf',
    'https://user:password@storage.example.test/private.pdf',
  ]) {
    test(`SS-1302: ${name} rejects unsafe URL ${url.split(':')[0]}`, async () => {
      globalThis.fetch = async () =>
        Response.json({ success: true, data: { ...signed, downloadUrl: url }, meta: {} });
      await assert.rejects(download(), { name: 'ZodError' });
    });
  }
  test(`SS-1302: ${name} rejects storage keys and private extra fields`, async () => {
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: {
          ...signed,
          objectKey: 'synthetic-private-key',
          apiSecret: 'synthetic-private-marker',
        },
        meta: {},
      });
    await assert.rejects(download(), { name: 'ZodError' });
  });
}
for (const role of roles) {
  test(`SS-1302: denied commercial download preserves ${role} session`, async () => {
    auth.getState().setUser(user(role));
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        {
          success: false,
          error: { code: 'AUTH.FORBIDDEN', message: 'Denied', statusCode: 403 },
          meta: {},
        },
        { status: 403 },
      );
    };
    await assert.rejects(api.evidence(id), { status: 403, code: 'AUTH.FORBIDDEN' });
    assert.equal(calls, 1);
    assert.equal(auth.getState().accessToken, 'synthetic-token');
  });
}
test('SS-1302: revoked Owner scope discards a pending signed PDF', async () => {
  let resolve;
  globalThis.fetch = () =>
    new Promise((done) => {
      resolve = done;
    });
  const result = api.evidence(id);
  auth.getState().setUser(user('SELLER_STAFF'));
  resolve(Response.json({ success: true, data: signed, meta: {} }));
  await assert.rejects(result, { code: 'AUTH.SCOPE_CHANGED' });
});
