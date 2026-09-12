import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let apiClient;
let useAuthStore;
let useTenantStore;
let getLoginSchema;
let getPostLoginPath;
const originalFetch = globalThis.fetch;
const user = {
  userId: 'test-user',
  tenantId: 'test-tenant',
  email: 'test@example.com',
  fullName: 'Test User',
  roles: ['TENANT_ADMIN'],
  permissions: ['orders:read'],
};
const session = (accessToken = 'test-access') => ({ accessToken, expiresIn: 900, user });
const ok = (data) => Response.json({ success: true, data, meta: {} });
const fail = (status, code = 'AUTH.UNAUTHENTICATED') =>
  Response.json(
    {
      success: false,
      error: { code, message: 'Test error', statusCode: status },
      meta: {},
    },
    { status },
  );
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

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
  ({ useTenantStore } = await server.ssrLoadModule('/src/stores/tenantStore.ts'));
  ({ getLoginSchema } = await server.ssrLoadModule('/src/features/auth/schemas/loginSchema.ts'));
  ({ getPostLoginPath } = await server.ssrLoadModule('/src/lib/authRedirect.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  useAuthStore.getState().clear();
});

test('login sends the BE contract with cookies and stores the safe profile', async () => {
  const input = {
    email: user.email,
    password: 'Test-password-1',
    rememberSession: true,
    workspaceSlug: 'test-company',
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/login');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers.get('Authorization'), null);
    assert.deepEqual(JSON.parse(options.body), input);
    return ok(session());
  };
  assert.deepEqual(await apiClient.login(input), user);
  assert.equal(useAuthStore.getState().accessToken, 'test-access');
  assert.equal(useTenantStore.getState().activeTenantId, user.tenantId);
  assert.deepEqual(useTenantStore.getState().permissions, user.permissions);
});

test('invalid credentials keep the API error and never refresh or clear another session', async () => {
  useAuthStore.getState().setSession(session());
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return fail(401, 'AUTH.INVALID_CREDENTIALS');
  };
  await assert.rejects(
    apiClient.login({ email: user.email, password: 'incorrect', rememberSession: false }),
    { code: 'AUTH.INVALID_CREDENTIALS', status: 401, message: 'Test error' },
  );
  assert.deepEqual(calls, ['/api/v1/auth/login']);
  assert.equal(useAuthStore.getState().accessToken, 'test-access');
});

test('parallel startup calls restore a session with one cookie rotation', async () => {
  useAuthStore.setState({ status: 'initializing' });
  let calls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/v1/auth/refresh');
    calls++;
    return ok(session());
  };
  await Promise.all([apiClient.initializeSession(), apiClient.initializeSession()]);
  assert.equal(calls, 1);
  assert.equal(useAuthStore.getState().status, 'authenticated');
});

test('missing refresh cookie resolves initialization as anonymous', async () => {
  useAuthStore.setState({ status: 'initializing' });
  globalThis.fetch = async () => fail(401);
  await apiClient.initializeSession();
  assert.equal(useAuthStore.getState().status, 'anonymous');
  assert.equal(useAuthStore.getState().user, null);
});

test('a temporary network failure falls back to anonymous without expiring the cookie', async () => {
  useAuthStore.setState({ status: 'initializing' });
  globalThis.fetch = async () => {
    throw new TypeError('network offline');
  };
  await apiClient.initializeSession();
  assert.equal(useAuthStore.getState().status, 'anonymous');

  // Mạng khôi phục: request bảo vệ kế tiếp vẫn khôi phục được phiên (cookie không bị hủy).
  globalThis.fetch = async (url) => {
    if (url.endsWith('/refresh')) return ok(session());
    return ok(null);
  };
  await apiClient.get('/orders', { silent: true });
  assert.equal(useAuthStore.getState().status, 'authenticated');
  assert.equal(useAuthStore.getState().user.roles[0], 'TENANT_ADMIN');
});

test('parallel 401s share one refresh and replay with the new bearer token', async () => {
  useAuthStore.getState().setSession(session('old'));
  let refreshes = 0;
  const tokens = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/refresh')) {
      refreshes++;
      return ok(session('new'));
    }
    const token = options.headers.get('Authorization');
    tokens.push(token);
    return token === 'Bearer old' ? fail(401) : ok({ result: true });
  };
  const results = await Promise.all([
    apiClient.get('/orders', { silent: true }),
    apiClient.get('/inventory', { silent: true }),
  ]);
  assert.equal(refreshes, 1);
  assert.deepEqual(tokens, ['Bearer old', 'Bearer old', 'Bearer new', 'Bearer new']);
  assert.ok(results.every((result) => result.data.result));
});

test('a late 401 reuses the token already rotated by another request', async () => {
  useAuthStore.getState().setSession(session('old'));
  const late = deferred();
  let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/refresh')) {
      refreshes++;
      return ok(session('new'));
    }
    if (options.headers.get('Authorization') === 'Bearer new') return ok(null);
    if (url.endsWith('/slow')) return late.promise;
    return fail(401);
  };
  const slow = apiClient.get('/slow', { silent: true });
  await apiClient.get('/fast', { silent: true });
  late.resolve(fail(401));
  await slow;
  assert.equal(refreshes, 1);
});

test('expired access tokens refresh before sending a protected request', async () => {
  useAuthStore.getState().setSession(session('old'));
  useAuthStore.setState({ expiresAt: 0 });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/refresh')) return ok(session('new'));
    assert.equal(options.headers.get('Authorization'), 'Bearer new');
    return ok(null);
  };
  await apiClient.get('/orders', { silent: true });
  assert.deepEqual(calls, ['/api/v1/auth/refresh', '/api/orders']);
});

test('a rejected refresh clears identity and tenant state without looping', async () => {
  useAuthStore.getState().setSession(session());
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fail(401);
  };
  await assert.rejects(apiClient.get('/orders', { silent: true }), { status: 401 });
  assert.equal(calls, 2);
  assert.equal(useAuthStore.getState().accessToken, null);
  assert.equal(useTenantStore.getState().activeTenantId, null);
  assert.deepEqual(useTenantStore.getState().permissions, []);
});

test('a 401 after refresh retries at most once', async () => {
  useAuthStore.getState().setSession(session());
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    return url.endsWith('/refresh') ? ok(session('new')) : fail(401);
  };
  await assert.rejects(apiClient.get('/orders', { silent: true }), { status: 401 });
  assert.equal(calls, 3);
  assert.equal(useAuthStore.getState().user, null);
});

test('permission denial keeps the session and never refreshes', async () => {
  useAuthStore.getState().setSession(session());
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fail(403, 'AUTH.FORBIDDEN');
  };
  await assert.rejects(apiClient.get('/admin/tenants', { silent: true }), { status: 403 });
  assert.equal(calls, 1);
  assert.equal(useAuthStore.getState().accessToken, 'test-access');
});

test('current identity updates role and permission state from /me', async () => {
  useAuthStore.getState().setSession(session());
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/me');
    assert.equal(options.headers.get('Authorization'), 'Bearer test-access');
    return ok({ ...user, roles: ['DISPATCHER'], permissions: ['shipments:read'] });
  };
  await apiClient.currentUser();
  assert.deepEqual(useAuthStore.getState().user.roles, ['DISPATCHER']);
  assert.deepEqual(useTenantStore.getState().permissions, ['shipments:read']);
});

test('logout revokes the cookie on the server and clears all identity state', async () => {
  useAuthStore.getState().setSession(session());
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/logout');
    assert.equal(options.credentials, 'include');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {});
    return ok(null);
  };
  await apiClient.logout();
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useTenantStore.getState().activeTenantId, null);
});

test('logout waits for a pending rotation before revoking the cookie', async () => {
  useAuthStore.getState().setSession(session());
  const pending = deferred();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return url.endsWith('/refresh') ? pending.promise : ok(null);
  };
  const refresh = apiClient.refreshSession();
  const logout = apiClient.logout();
  assert.deepEqual(calls, ['/api/v1/auth/refresh']);
  pending.resolve(ok(session('rotated')));
  await Promise.all([refresh, logout]);
  assert.deepEqual(calls, ['/api/v1/auth/refresh', '/api/v1/auth/logout']);
  assert.equal(useAuthStore.getState().user, null);
});

test('late refresh results cannot resurrect a cleared identity', async () => {
  const pending = deferred();
  globalThis.fetch = async () => pending.promise;
  const refresh = apiClient.refreshSession();
  useAuthStore.getState().clear();
  pending.resolve(ok(session()));
  await assert.rejects(refresh, { code: 'AUTH.UNAUTHENTICATED' });
  assert.equal(useAuthStore.getState().user, null);
});

test('legacy or malformed login responses cannot establish a session', async () => {
  globalThis.fetch = async () => ok({ token: 'legacy', user });
  await assert.rejects(
    apiClient.login({ email: user.email, password: 'Test-password-1', rememberSession: false }),
  );
  assert.equal(useAuthStore.getState().user, null);
});

test('login validation normalizes email but preserves password and remember choice', () => {
  const schema = getLoginSchema((key) => key);
  const data = schema.parse({
    email: ' TEST@example.com ',
    password: ' password ',
    rememberSession: false,
    workspaceSlug: '',
  });
  assert.equal(data.email, 'test@example.com');
  assert.equal(data.password, ' password ');
  assert.equal(data.rememberSession, false);
  for (const invalid of [
    { email: 'invalid' },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { workspaceSlug: '../tenant' },
  ]) {
    assert.equal(schema.safeParse({ ...data, ...invalid }).success, false);
  }
});

test('post-login redirects preserve internal destinations and enforce admin access', () => {
  assert.equal(getPostLoginPath(user, { from: '/orders?page=2#items' }), '/orders?page=2#items');
  for (const from of [
    '//evil.test',
    'https://evil.test',
    '/\\evil.test',
    '/login',
    '/admin/tenants',
  ]) {
    assert.equal(getPostLoginPath(user, { from }), '/dashboard');
  }
  const admin = { ...user, tenantId: null, roles: ['SUPER_ADMIN'] };
  assert.equal(getPostLoginPath(admin, null), '/admin/tenants');
  assert.equal(getPostLoginPath(admin, { from: '/admin/carriers' }), '/admin/carriers');
});

test('new refresh attempts wait for logout and cannot rotate a revoked cookie', async () => {
  useAuthStore.getState().setSession(session());
  const pending = deferred();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return pending.promise;
  };
  const logout = apiClient.logout();
  const refresh = apiClient.refreshSession();
  const rejected = assert.rejects(refresh, { status: 401 });
  pending.resolve(ok(null));
  await Promise.all([logout, rejected]);
  assert.deepEqual(calls, ['/api/v1/auth/logout']);
  assert.equal(useAuthStore.getState().user, null);
});

test('logout failure retains the session for an explicit retry', async () => {
  useAuthStore.getState().setSession(session());
  globalThis.fetch = async () => fail(503, 'INTERNAL.UNEXPECTED_ERROR');
  await assert.rejects(apiClient.logout(), { status: 503 });
  assert.equal(useAuthStore.getState().accessToken, 'test-access');
  globalThis.fetch = async () => ok(null);
  await apiClient.logout();
  assert.equal(useAuthStore.getState().user, null);
});
