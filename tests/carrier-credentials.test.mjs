import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let carrierCredentialApi;
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

const sampleCarrier = {
  id: 'c5d4f418-6dd6-46fa-808a-81ad8c97ebbf',
  code: 'GHTK',
  name: 'Giao Hàng Tiết Kiệm',
  logoUrl: 'https://smartchain-assets.s3.amazonaws.com/carriers/ghtk.svg',
};

const sampleCredential = {
  id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  tenantId: '00000000-0000-4000-8000-000000000002',
  carrierId: sampleCarrier.id,
  carrier: sampleCarrier,
  name: 'GHTK Kho Tổng Hà Nội',
  environment: 'SANDBOX',
  authType: 'API_TOKEN',
  maskedPreview: 'ghtk_****3f9a',
  status: 'UNVERIFIED',
  lastPingAt: null,
  lastPingMessage: null,
  createdAt: '2026-09-13T01:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
};

const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-09-13T01:00:00.000Z', path: '', requestId: 'test' },
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
  ({ carrierCredentialApi } = await server.ssrLoadModule(
    '/src/features/catalog/api/carrierCredentialApi.ts',
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

test('Task 1-16: carrierCredentialApi.create sends valid POST payload with bearer token', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/carrier-credentials');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');

    const body = JSON.parse(options.body);
    assert.equal(body.carrierId, sampleCarrier.id);
    assert.equal(body.name, 'GHTK Kho Tổng Hà Nội');
    assert.equal(body.environment, 'SANDBOX');
    assert.equal(body.credentials.apiToken, 'secret-api-token-value');

    return ok(sampleCredential);
  };

  const created = await carrierCredentialApi.create({
    carrierId: sampleCarrier.id,
    name: 'GHTK Kho Tổng Hà Nội',
    environment: 'SANDBOX',
    authType: 'API_TOKEN',
    credentials: { apiToken: 'secret-api-token-value' },
  });

  assert.equal(created.id, sampleCredential.id);
  assert.equal(created.maskedPreview, 'ghtk_****3f9a');
  assert.equal(created.status, 'UNVERIFIED');
});

test('Task 1-17: carrierCredentialApi.update sends PATCH with updated fields', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/carrier-credentials/${sampleCredential.id}`);
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');

    const body = JSON.parse(options.body);
    assert.equal(body.name, 'GHTK Đã Cập Nhật');
    return ok({ ...sampleCredential, name: 'GHTK Đã Cập Nhật' });
  };

  const updated = await carrierCredentialApi.update(sampleCredential.id, {
    name: 'GHTK Đã Cập Nhật',
  });

  assert.equal(updated.name, 'GHTK Đã Cập Nhật');
});

test('Task 1-18: carrierCredentialApi.delete calls DELETE endpoint to soft-delete credential', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/carrier-credentials/${sampleCredential.id}`);
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok({ message: 'Gỡ kết nối thành công.' });
  };

  const res = await carrierCredentialApi.delete(sampleCredential.id);
  assert.equal(res.message, 'Gỡ kết nối thành công.');
});

test('Task 1-19: carrierCredentialApi.pingTest calls /test endpoint and parses latency and CONNECTED status', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/carrier-credentials/${sampleCredential.id}/test`);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok({
      credentialId: sampleCredential.id,
      status: 'CONNECTED',
      latencyMs: 125,
      message: 'Kết nối thành công (HTTP 200, 125ms)',
      testedAt: '2026-09-13T01:10:00.000Z',
    });
  };

  const result = await carrierCredentialApi.pingTest(sampleCredential.id);
  assert.equal(result.status, 'CONNECTED');
  assert.equal(result.latencyMs, 125);
});

test('carrierCredentialApi.list handles query filters properly', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/carrier-credentials');
    assert.equal(requestUrl.searchParams.get('environment'), 'SANDBOX');
    assert.equal(requestUrl.searchParams.get('status'), 'UNVERIFIED');
    return ok([sampleCredential]);
  };

  const list = await carrierCredentialApi.list({
    environment: 'SANDBOX',
    status: 'UNVERIFIED',
  });

  assert.equal(list.length, 1);
  assert.equal(list[0].id, sampleCredential.id);
});

test('malformed carrier credential responses are rejected by Zod schema', async () => {
  globalThis.fetch = async () =>
    ok([
      {
        ...sampleCredential,
        status: 'INVALID_STATUS', // Không thuộc UNVERIFIED | CONNECTED | FAILED
      },
    ]);

  await assert.rejects(carrierCredentialApi.list(), {
    name: 'ZodError',
  });
});
