import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, carrierAccountApi, useAuthStore;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const account = { id, warehouseId: id, carrierId: id, environment: 'SANDBOX', maskedPreview: 'ghn_****', pickupMapping: { shop_id: '12345' }, status: 'CONNECTED', lastHealthAt: null, updatedAt: '2026-10-07T00:00:00Z', orcaCarrier: { code: 'GHN', name: 'GHN' } };
const ok = (data, pagination) => Response.json({ success: true, data, meta: { timestamp: '2026-10-07T00:00:00Z', path: '', requestId: 'test', ...(pagination ? { pagination } : {}) } });
before(async () => {
  server = await createServer({ configFile: false, envFile: false, optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL('..', import.meta.url)), resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, server: { middlewareMode: true, watch: null, ws: false } });
  ({ carrierAccountApi } = await server.ssrLoadModule('/src/features/catalog/api/carrierAccountApi.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });
beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ accessToken: 'admin-test-token', expiresIn: 900, user: { userId: id, tenantId: null, actorScope: 'PLATFORM', email: 'admin@example.test', fullName: 'Admin', roles: ['ORCA_ADMIN'], permissions: [] } });
});
test('creates platform-owned account with explicit environment and no tenant identity', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/platform/carrier-accounts'));
    assert.equal(options.method, 'POST');
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer admin-test-token');
    const body = JSON.parse(options.body);
    assert.equal(body.environment, 'SANDBOX'); assert.equal(body.credentials.shopId, '12345');
    assert.equal(Object.hasOwn(body, 'tenantId'), false);
    return ok(account);
  };
  const result = await carrierAccountApi.create({ warehouseId: id, carrierId: id, environment: 'SANDBOX', credentials: { apiToken: 'test-token', shopId: '12345' }, pickupMapping: { shop_id: '12345' } });
  assert.equal(result.maskedPreview, 'ghn_****');
});
test('decodes the shared pagination envelope and sends warehouse/environment filters', async () => {
  globalThis.fetch = async url => {
    const query = new URL(String(url), 'http://localhost').searchParams;
    assert.equal(query.get('warehouseId'), id); assert.equal(query.get('environment'), 'PRODUCTION'); assert.equal(query.get('limit'), '20');
    return ok([account], { limit: 20, hasNext: true, nextCursor: id });
  };
  assert.deepEqual(await carrierAccountApi.list({ warehouseId: id, environment: 'PRODUCTION' }), { items: [account], hasMore: true, nextCursor: id });
});
test('rejects malformed list data instead of showing an empty success', async () => {
  globalThis.fetch = async () => ok([{ ...account, environment: 'STAGING' }], { limit: 20, hasNext: false, nextCursor: null });
  await assert.rejects(carrierAccountApi.list({}));
});
test('supports mapping-only update without resending or fabricating credentials', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith(`/v1/platform/carrier-accounts/${id}`)); assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { pickupMapping: { shop_id: '12345' } });
    return ok(account);
  };
  await carrierAccountApi.update(id, { pickupMapping: { shop_id: '12345' } });
});
test('test and revoke use explicit action endpoints', async () => {
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(String(url)); assert.equal(options.method, 'POST');
    return String(url).endsWith('/test') ? ok({ status: 'FAILED', latencyMs: 10 }) : ok({ ...account, status: 'REVOKED' });
  };
  assert.equal((await carrierAccountApi.test(id)).status, 'FAILED'); assert.equal((await carrierAccountApi.revoke(id)).status, 'REVOKED');
  assert.ok(paths[0].endsWith(`/${id}/test`)); assert.ok(paths[1].endsWith(`/${id}/revoke`));
});
test('loads all warehouse option pages without losing null platform tenancy', async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (calls === 2) assert.equal(new URL(String(url), 'http://localhost').searchParams.get('cursor'), id);
    return ok([{ id, code: `WH-${calls}`, name: 'Warehouse' }], { limit: 50, hasNext: calls === 1, nextCursor: calls === 1 ? id : null });
  };
  assert.equal((await carrierAccountApi.warehouses()).length, 2);
});
