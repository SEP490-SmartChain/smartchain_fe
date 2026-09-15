import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let staffAccountApi;
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
const staff = {
  userId: '00000000-0000-4000-8000-000000000004',
  fullName: 'Test Staff',
  email: 'staff@example.test',
  roles: ['DISPATCHER'],
  lastSessionAt: '2026-09-10T02:00:00.000Z',
  status: 'ACTIVE',
};
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-09-11T02:00:00.000Z', path: '', requestId: 'test' },
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
  ({ staffAccountApi } = await server.ssrLoadModule(
    '/src/features/tenants/api/staffAccountApi.ts',
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

test('staff directory sends tenant filters through the authenticated API client', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/iam/users');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('search'), 'staff');
    assert.equal(requestUrl.searchParams.get('role'), 'DISPATCHER');
    assert.equal(requestUrl.searchParams.get('status'), 'ACTIVE');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok({
      items: [staff],
      pagination: { limit: 100, hasNext: false, nextCursor: null },
    });
  };

  const page = await staffAccountApi.list({
    search: ' staff ',
    role: 'DISPATCHER',
    status: 'ACTIVE',
  });

  assert.deepEqual(page.items, [staff]);
});

test('lock action uses PATCH with only the allowed status field', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/iam/users/${staff.userId}/status`);
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    assert.deepEqual(JSON.parse(options.body), { status: 'LOCKED' });
    return ok({ ...staff, status: 'LOCKED' });
  };

  await assert.doesNotReject(staffAccountApi.changeStatus(staff.userId, 'LOCKED'));
});

test('malformed staff responses are rejected before reaching the UI', async () => {
  globalThis.fetch = async () =>
    ok({
      items: [{ ...staff, status: 'SUSPENDED' }],
      pagination: { limit: 100, hasNext: false, nextCursor: null },
    });

  await assert.rejects(staffAccountApi.list({ search: '', role: '', status: '' }), {
    name: 'ZodError',
  });
});
