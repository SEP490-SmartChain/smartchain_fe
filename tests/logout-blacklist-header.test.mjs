import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let apiClient;
let useAuthStore;
const originalFetch = globalThis.fetch;
const ok = (data) => Response.json({ success: true, data, meta: {} });
const session = (accessToken) => ({
  accessToken,
  expiresIn: 900,
  user: {
    userId: 'test-user',
    tenantId: 'test-tenant',
    email: 'test@example.test',
    fullName: 'Test Seller',
    actorScope: 'TENANT',
    roles: ['SELLER_OWNER'],
    permissions: [],
  },
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
  ({ apiClient } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => useAuthStore.getState().clear());

test('SS-348 logout sends the current access token so the server can blacklist it', async () => {
  useAuthStore.getState().setSession(session('test-access'));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/logout');
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers.get('Authorization'), 'Bearer test-access');
    return ok(null);
  };
  await apiClient.logout();
  assert.equal(useAuthStore.getState().accessToken, null);
});

test('SS-348 cookie-only logout still works without triggering token refresh', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.get('Authorization'), null);
    return ok(null);
  };
  await apiClient.logout();
  assert.deepEqual(calls, ['/api/v1/auth/logout']);
});

test('SS-348 logout blacklists the rotated token after an already pending refresh settles', async () => {
  useAuthStore.getState().setSession(session('test-original'));
  let releaseRefresh;
  const refreshResponse = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/refresh')) return refreshResponse;
    assert.equal(options.headers.get('Authorization'), 'Bearer test-rotated');
    return ok(null);
  };
  const refresh = apiClient.refreshSession();
  const logout = apiClient.logout();
  assert.deepEqual(calls, ['/api/v1/auth/refresh']);
  releaseRefresh(ok(session('test-rotated')));
  await Promise.all([refresh, logout]);
  assert.deepEqual(calls, ['/api/v1/auth/refresh', '/api/v1/auth/logout']);
  assert.equal(useAuthStore.getState().accessToken, null);
});
