import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let webhookApi;
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

const mockWebhook = {
  id: 'b4e87534-331f-4234-a3ab-0fe18c41072c',
  tenantId: '00000000-0000-4000-8000-000000000002',
  url: 'https://erp.example.com/api/webhooks',
  maskedSecret: 'whsec_****Pjzo',
  hasSecret: true,
  eventTypes: ['order.ingested', 'carrier.status_update'],
  isActive: true,
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
};

const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-09-12T00:00:00.000Z', path: '', requestId: 'test' },
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
  ({ webhookApi } = await server.ssrLoadModule(
    '/src/features/tenants/api/webhookApi.ts',
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

test('webhookApi.list sends GET /api/v1/webhooks with query params', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/webhooks');
    assert.equal(requestUrl.searchParams.get('includeInactive'), 'true');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok([mockWebhook]);
  };

  const webhooks = await webhookApi.list(true);
  assert.equal(webhooks.length, 1);
  assert.equal(webhooks[0].id, mockWebhook.id);
  assert.equal(webhooks[0].url, mockWebhook.url);
});

test('webhookApi.create sends POST /api/v1/webhooks with payload', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/webhooks');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    const body = JSON.parse(options.body);
    assert.equal(body.url, 'https://erp.example.com/api/webhooks');
    assert.deepEqual(body.eventTypes, ['order.ingested']);
    return ok({ ...mockWebhook, eventTypes: ['order.ingested'], secret: 'whsec_raw12345678901234567890123456' });
  };

  const created = await webhookApi.create({
    url: 'https://erp.example.com/api/webhooks',
    eventTypes: ['order.ingested'],
    isActive: true,
  });

  assert.equal(created.id, mockWebhook.id);
  assert.equal(created.secret, 'whsec_raw12345678901234567890123456');
});

test('webhookApi.update sends PUT /api/v1/webhooks/:id with payload', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/webhooks/${mockWebhook.id}`);
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    assert.equal(body.isActive, false);
    return ok({ ...mockWebhook, isActive: false });
  };

  const updated = await webhookApi.update(mockWebhook.id, { isActive: false });
  assert.equal(updated.isActive, false);
});

test('webhookApi.delete handles 204 No Content response cleanly', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/webhooks/${mockWebhook.id}`);
    assert.equal(options.method, 'DELETE');
    return new Response(null, { status: 204 });
  };

  await assert.doesNotReject(webhookApi.delete(mockWebhook.id));
});

test('webhookApi.testPing sends POST /api/v1/webhooks/:id/test and parses result', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/webhooks/${mockWebhook.id}/test`);
    assert.equal(options.method, 'POST');
    return ok({
      success: true,
      statusCode: 200,
      responseTimeMs: 38,
      message: 'Ping successful',
    });
  };

  const result = await webhookApi.testPing(mockWebhook.id);
  assert.equal(result.success, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.responseTimeMs, 38);
});

test('malformed webhook response is rejected by Zod schema', async () => {
  globalThis.fetch = async () =>
    ok([
      {
        ...mockWebhook,
        id: 'not-a-valid-uuid',
      },
    ]);

  await assert.rejects(webhookApi.list(), {
    name: 'ZodError',
  });
});
