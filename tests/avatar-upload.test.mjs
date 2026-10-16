import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server, avatarObjectKey, uploadApi, apiClient, useAuthStore;
const originalFetch = globalThis.fetch;
const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: null,
  actorScope: 'PLATFORM',
  fullName: 'Warehouse Manager',
  email: 'manager@example.test',
  roles: ['WAREHOUSE_MANAGER'],
  permissions: [],
  phone: null,
  avatarUrl: null,
};
const key = `platform/users/${user.userId}/avatars/avatar.webp`;
const ok = (data) => Response.json({ success: true, data, meta: {} });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ avatarObjectKey, uploadApi } = await server.ssrLoadModule('/src/services/uploadApi.ts'));
  ({ apiClient } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('recognizes platform object keys and storage URLs for navbar avatar resolution', () => {
  assert.equal(avatarObjectKey(key), key);
  assert.equal(avatarObjectKey(`https://storage.example.test/bucket/${key}?signed=test`), key);
  const sellerKey = 'tenants/seller/users/user/avatars/avatar.webp';
  assert.equal(avatarObjectKey(sellerKey), sellerKey);
  assert.equal(
    avatarObjectKey(`https://storage.example.test/bucket/${sellerKey}?signed=test`),
    sellerKey,
  );
  assert.equal(avatarObjectKey('https://cdn.example.test/public-avatar.webp'), null);
});

test('uploads a platform avatar without a tenant and preserves its reference when refreshing the session', async () => {
  useAuthStore.getState().setSession({ user, accessToken: 'test-access', expiresIn: 900 });
  const file = new File(['synthetic-image'], 'avatar.webp', { type: 'image/webp' });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url === 'https://storage.example.test/signed-put') {
      assert.equal(options.method, 'PUT');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.credentials, 'omit');
      return new Response(null, { status: 200 });
    }
    assert.equal(options.headers.get('Authorization'), 'Bearer test-access');
    if (url.endsWith('/uploads/presign')) {
      assert.equal(JSON.parse(options.body).purpose, 'AVATAR');
      assert.equal(JSON.parse(options.body).tenantId, undefined);
      return ok({
        method: 'PUT',
        uploadUrl: 'https://storage.example.test/signed-put',
        objectKey: key,
        expiresInSeconds: 900,
        headers: { 'Content-Type': file.type },
      });
    }
    if (url.endsWith('/uploads/avatar-url')) {
      assert.deepEqual(JSON.parse(options.body), { objectKey: key });
      return ok({ downloadUrl: 'https://storage.example.test/signed-get', expiresInSeconds: 900 });
    }
    if (url.endsWith('/auth/me')) return ok({ ...user, avatarUrl: key });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const signed = await uploadApi.presign({
    purpose: 'AVATAR',
    fileName: file.name,
    contentType: file.type,
    fileSizeBytes: file.size,
  });
  await uploadApi.uploadDirect(signed.uploadUrl, file, signed.headers);
  assert.equal(
    (await uploadApi.avatarDownloadUrl(signed.objectKey)).downloadUrl,
    'https://storage.example.test/signed-get',
  );
  await apiClient.currentUser();
  assert.equal(useAuthStore.getState().user.avatarUrl, key);
  assert.equal(calls.length, 4);
});
