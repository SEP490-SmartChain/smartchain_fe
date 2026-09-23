import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let workspaceSettingsApi;
let uploadApi;
let useAuthStore;
const originalFetch = globalThis.fetch;
const admin = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'admin@example.test',
  fullName: 'Tenant Admin',
  roles: ['TENANT_ADMIN'],
  permissions: ['workspace.settings.manage'],
};
const settings = {
  tenantId: admin.tenantId,
  name: 'ABC Logistics',
  logoKey: null,
  updatedAt: '2026-09-22T00:00:00.000Z',
};
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-09-22T00:00:00.000Z',
      path: '',
      requestId: 'test',
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
  ({ workspaceSettingsApi } = await server.ssrLoadModule(
    '/src/features/settings/api/workspaceSettingsApi.ts',
  ));
  ({ uploadApi } = await server.ssrLoadModule('/src/services/uploadApi.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({
    accessToken: 'admin-token',
    expiresIn: 900,
    user: admin,
  });
});

test('workspace settings load from the tenant-scoped endpoint', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/workspace');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok(settings);
  };

  assert.deepEqual(await workspaceSettingsApi.get(), settings);
});

test('workspace settings update sends only name and logo key', async () => {
  const logoKey = `tenants/${admin.tenantId}/workspace/logo/logo.webp`;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/workspace');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), {
      name: 'Updated Workspace',
      logoKey,
    });
    return ok({ ...settings, name: 'Updated Workspace', logoKey });
  };

  await assert.doesNotReject(workspaceSettingsApi.update({ name: 'Updated Workspace', logoKey }));
});

test('workspace logo uses a purpose-scoped presign request and direct PUT', async () => {
  const file = new File(['logo'], 'logo.webp', { type: 'image/webp' });
  const objectKey = `tenants/${admin.tenantId}/workspace/logo/generated-logo.webp`;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(url, '/api/v1/uploads/presign');
      assert.deepEqual(JSON.parse(options.body), {
        purpose: 'WORKSPACE_LOGO',
        fileName: 'logo.webp',
        contentType: 'image/webp',
        fileSizeBytes: 4,
      });
      return ok({
        method: 'PUT',
        uploadUrl: 'https://storage.example.test/signed-put',
        objectKey,
        expiresInSeconds: 900,
        headers: { 'Content-Type': 'image/webp' },
      });
    }
    assert.equal(url, 'https://storage.example.test/signed-put');
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers['Content-Type'], 'image/webp');
    assert.equal(options.body, file);
    return new Response(null, { status: 200 });
  };

  const presigned = await uploadApi.presignWorkspaceLogo(file);
  await uploadApi.uploadDirect(presigned.uploadUrl, file, presigned.headers);
  assert.equal(presigned.objectKey, objectKey);
});
