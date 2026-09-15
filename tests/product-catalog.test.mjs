import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let productApi;
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
const product = {
  id: '00000000-0000-4000-8000-000000000010',
  sku: 'SKU-001',
  name: 'Sample Product',
  weightG: 500,
  lengthCm: '10.5',
  widthCm: '5.25',
  heightCm: '3',
  declaredValue: '120000',
  isActive: true,
  createdAt: '2026-09-01T02:00:00.000Z',
};
const ok = (items, pagination) =>
  Response.json({
    success: true,
    data: items,
    meta: {
      timestamp: '2026-09-11T02:00:00.000Z',
      path: '',
      requestId: 'test',
      pagination,
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
  ({ productApi } = await server.ssrLoadModule('/src/features/catalog/api/productApi.ts'));
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

test('product catalog sends tenant filters through the authenticated API client', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/catalog/products');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('search'), 'sku');
    assert.equal(requestUrl.searchParams.get('isActive'), 'true');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok([product], { limit: 100, hasNext: false, nextCursor: null });
  };

  const page = await productApi.list({ search: ' sku ', isActive: 'true' });

  assert.deepEqual(page.items, [product]);
  assert.deepEqual(page.pagination, { limit: 100, hasNext: false, nextCursor: null });
});

test('omits isActive from the query when the filter is unset', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.searchParams.has('isActive'), false);
    return ok([], { limit: 100, hasNext: false, nextCursor: null });
  };

  await productApi.list({ search: '', isActive: '' });
});

test('malformed product responses are rejected before reaching the UI', async () => {
  globalThis.fetch = async () =>
    ok([{ ...product, weightG: 'not-a-number' }], {
      limit: 100,
      hasNext: false,
      nextCursor: null,
    });

  await assert.rejects(productApi.list({ search: '', isActive: '' }), {
    name: 'ZodError',
  });
});
