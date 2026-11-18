import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schemas, store, policy;
const originalFetch = globalThis.fetch;
const setting = {
  carrierCode: 'GHN',
  environment: 'SANDBOX',
  publicBaseUrl: 'https://api.example.test',
  callbackPath: '/api/v1/webhooks/carriers/GHN',
  callbackUrl: 'https://api.example.test/api/v1/webhooks/carriers/GHN',
  enabled: true,
  hasToken: true,
  source: 'DATABASE',
  version: 1,
};
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-11-18T00:00:00Z', path: '', requestId: 'test' },
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
  ({ carrierWebhookApi: api } = await server.ssrLoadModule(
    '/src/features/catalog/api/carrierWebhookApi.ts',
  ));
  schemas = await server.ssrLoadModule('/src/features/catalog/schemas/carrierWebhookSchema.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() =>
  store.getState().setSession({
    accessToken: 'synthetic-admin-token',
    expiresIn: 900,
    user: {
      userId: '00000000-0000-4000-8000-000000000001',
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
      email: 'admin@example.test',
      fullName: 'Admin',
    },
  }),
);

test('loads safe carrier metadata and rejects responses containing raw secrets', async () => {
  globalThis.fetch = async () => ok([setting]);
  assert.equal((await api.list())[0].carrierCode, 'GHN');
  globalThis.fetch = async () => ok([{ ...setting, token: 'must-not-be-returned' }]);
  await assert.rejects(api.list());
});
test('saves the provider and expected version with authentication, no chosen environment or tenant', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/platform/carrier-webhooks/GHN'));
    assert.equal(options.method, 'PATCH');
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer synthetic-admin-token');
    assert.deepEqual(JSON.parse(options.body), {
      publicBaseUrl: setting.publicBaseUrl,
      enabled: true,
      expectedVersion: 0,
      token: 'a'.repeat(64),
    });
    return ok(setting);
  };
  assert.equal(
    (
      await api.update('GHN', {
        publicBaseUrl: setting.publicBaseUrl,
        enabled: true,
        expectedVersion: 0,
        token: 'a'.repeat(64),
      })
    ).version,
    1,
  );
});
test('retains 409 conflicts instead of reporting a saved configuration', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'TRACKING.WEBHOOK_SETTINGS_STALE', message: 'Reload', statusCode: 409 },
        meta: { timestamp: '2026-11-18T00:00:00Z', path: '', requestId: 'test' },
      },
      { status: 409 },
    );
  await assert.rejects(
    api.update('GHN', { publicBaseUrl: setting.publicBaseUrl, enabled: false, expectedVersion: 0 }),
    (error) => error.status === 409,
  );
});
test('constructs GHTK hash URLs and keeps GHN and Viettel tokens out of the URL', () => {
  assert.equal(
    schemas.carrierCallbackUrl(setting.publicBaseUrl, 'GHTK', 'synthetic-secret'),
    'https://api.example.test/api/v1/webhooks/carriers/GHTK?hash=synthetic-secret',
  );
  for (const carrier of ['GHN', 'VIETTEL_POST'])
    assert.equal(
      new URL(schemas.carrierCallbackUrl(setting.publicBaseUrl, carrier, 'synthetic-secret'))
        .search,
      '',
    );
});
test('validates secret bounds and keeping an existing token', () => {
  const messages = { invalidToken: 'invalid token', tokenRequired: 'required' };
  const schema = schemas.carrierWebhookSchema(false, messages);
  const form = { status: 'enabled', token: 'a'.repeat(64) };
  assert.equal(schema.safeParse(form).success, true);
  for (const token of ['', 'short', 'a'.repeat(129), 'a'.repeat(31) + '!'])
    assert.equal(schema.safeParse({ ...form, token }).success, false);
  assert.equal(
    schemas.carrierWebhookSchema(true, messages).safeParse({ ...form, token: '' }).success,
    true,
  );
});
test('only a PLATFORM Admin has carrier secret configuration authority', () => {
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
    assert.equal(policy.can(roles, 'carriers.credentials.manage'), role === 'ORCA_ADMIN');
  }
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['ORCA_ADMIN', 'SELLER_OWNER'], 'PLATFORM'),
      'carriers.credentials.manage',
    ),
    false,
  );
});

test('derives the callback origin from the public API URL, then the API URL', () => {
  const page = 'https://app.orca.example';
  assert.equal(
    schemas.webhookPublicOrigin('https://api.orca.example/api', '/api', page),
    'https://api.orca.example',
  );
  for (const unusable of ['', 'http://api.orca.example/api', 'https://localhost/api'])
    assert.equal(schemas.webhookPublicOrigin(unusable, '/api', page), page);
  assert.equal(
    schemas.webhookPublicOrigin('', 'https://api2.orca.example/api', page),
    'https://api2.orca.example',
  );
  assert.equal(
    schemas.webhookPublicOrigin(undefined, undefined, 'http://localhost:2324'),
    'http://localhost:2324',
  );
});
