import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let apiKeyApi;
let createApiKeySchema;
let useAuthStore;
const originalFetch = globalThis.fetch;

const admin = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'admin@example.test',
  fullName: 'Tenant Admin',
  roles: ['TENANT_ADMIN'],
  permissions: [],
};

const apiKey = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Odoo Production',
  keyPrefix: '0123456789abcdef',
  scopes: ['catalog:write'],
  status: 'ACTIVE',
  createdAt: '2026-09-24T03:00:00.000Z',
  expiresAt: null,
  lastUsedAt: '2026-09-24T04:00:00.000Z',
  revokedAt: null,
};
const RAW_KEY = `sck_0123456789abcdef_${'A'.repeat(43)}`;

const ok = (data, meta = {}) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-09-24T03:00:00.000Z', path: '', requestId: 'test', ...meta },
  });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ apiKeyApi } = await server.ssrLoadModule('/src/features/tenants/api/apiKeyApi.ts'));
  ({ createApiKeySchema } = await server.ssrLoadModule(
    '/src/features/tenants/schemas/apiKey.schemas.ts',
  ));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ accessToken: 'admin-token', expiresIn: 900, user: admin });
});

test('apiKeyApi.list reads keys and pagination from the envelope', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/iam/api-keys');
    assert.equal(requestUrl.searchParams.get('limit'), '50');
    assert.equal(requestUrl.searchParams.has('cursor'), false);
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok([apiKey], { pagination: { limit: 50, hasNext: true, nextCursor: apiKey.id } });
  };

  const page = await apiKeyApi.list();

  assert.deepEqual(page.items, [apiKey]);
  assert.deepEqual(page.pagination, { limit: 50, hasNext: true, nextCursor: apiKey.id });
});

test('apiKeyApi.list sends the cursor of the next page', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.searchParams.get('cursor'), apiKey.id);
    return ok([], { pagination: { limit: 50, hasNext: false, nextCursor: null } });
  };

  const page = await apiKeyApi.list(apiKey.id);

  assert.deepEqual(page.items, []);
});

test('apiKeyApi.create omits expiresInDays for a key that never expires', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/api-keys');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      name: 'Odoo Production',
      scopes: ['catalog:write'],
    });
    return ok({ apiKey, rawKey: RAW_KEY });
  };

  const created = await apiKeyApi.create({
    name: 'Odoo Production',
    scopes: ['catalog:write'],
    expiry: 'never',
  });

  assert.equal(created.rawKey, RAW_KEY);
  assert.equal(created.apiKey.id, apiKey.id);
});

test('apiKeyApi.create sends the chosen expiry as a number of days', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).expiresInDays, 90);
    return ok({ apiKey: { ...apiKey, expiresAt: '2026-12-23T03:00:00.000Z' }, rawKey: RAW_KEY });
  };

  const created = await apiKeyApi.create({
    name: 'Website',
    scopes: ['catalog:write'],
    expiry: '90',
  });

  assert.equal(created.apiKey.expiresAt, '2026-12-23T03:00:00.000Z');
});

test('apiKeyApi.revoke posts to the revoke action of the key', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/iam/api-keys/${apiKey.id}/revoke`);
    assert.equal(options.method, 'POST');
    return ok({ ...apiKey, status: 'REVOKED', revokedAt: '2026-09-25T00:00:00.000Z' });
  };

  const revoked = await apiKeyApi.revoke(apiKey.id);

  assert.equal(revoked.status, 'REVOKED');
});

test('apiKeyApi.create rejects a response without the raw key', async () => {
  globalThis.fetch = async () => ok({ apiKey });

  await assert.rejects(
    apiKeyApi.create({ name: 'Website', scopes: ['catalog:write'], expiry: 'never' }),
  );
});

test('apiKeyApi.revoke surfaces the server error for an already revoked key', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: {
          code: 'IAM.API_KEY_ALREADY_REVOKED',
          message: 'API key này đã bị thu hồi trước đó.',
          statusCode: 409,
        },
        meta: { timestamp: '2026-09-24T03:00:00.000Z', path: '', requestId: 'test' },
      },
      { status: 409 },
    );

  await assert.rejects(apiKeyApi.revoke(apiKey.id), /đã bị thu hồi/);
});

test('createApiKeySchema trims the name and requires 3 to 100 characters', () => {
  const valid = createApiKeySchema.safeParse({
    name: '  Odoo  ',
    scopes: ['catalog:write'],
    expiry: 'never',
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.name, 'Odoo');

  for (const name of ['ab', '     ', 'x'.repeat(101)]) {
    const result = createApiKeySchema.safeParse({
      name,
      scopes: ['catalog:write'],
      expiry: 'never',
    });
    assert.equal(result.success, false, `name "${name}" should be rejected`);
  }
});

test('createApiKeySchema requires a scope and a known expiry', () => {
  assert.equal(
    createApiKeySchema.safeParse({ name: 'Odoo', scopes: [], expiry: 'never' }).success,
    false,
  );
  assert.equal(
    createApiKeySchema.safeParse({ name: 'Odoo', scopes: ['catalog:write'], expiry: '7' }).success,
    false,
  );
});
