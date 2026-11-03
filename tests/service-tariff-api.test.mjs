import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, store;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const row = {
  id,
  code: 'FULFILLMENT',
  versionNo: 1,
  status: 'DRAFT',
  effectiveFrom: '2026-11-01T00:00:00.000Z',
  effectiveTo: null,
  updatedAt: '2026-10-17T00:00:00.000Z',
  lines: [
    {
      feeType: 'PICK_PACK_ORDER',
      unit: 'ORDER',
      lowerBound: '0',
      upperBound: null,
      unitPriceVnd: '8000',
      rounding: 'CEIL_VND',
    },
  ],
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: row.updatedAt,
      path: '',
      requestId: 'test',
      ...(pagination ? { pagination } : {}),
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
  ({ serviceTariffApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/serviceTariffApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store
    .getState()
    .setSession({
      accessToken: 'test-token',
      expiresIn: 3600,
      user: {
        userId: id,
        tenantId: null,
        actorScope: 'PLATFORM',
        roles: ['ORCA_ACCOUNTANT'],
        permissions: [],
        email: 'synthetic@example.test',
        fullName: 'Synthetic Accountant',
      },
    });
});
test('reads shared cursor metadata without fabricating pagination or tenant context', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/v1/commercial/service-tariffs'));
    assert.equal(String(url).includes('tenantId'), false);
    return ok([row], { limit: 20, hasNext: false, nextCursor: null });
  };
  assert.equal((await api.list()).items[0].lines[0].unitPriceVnd, '8000');
  globalThis.fetch = async () => ok([row]);
  await assert.rejects(api.list());
});
test('draft saves and publication send exact optimistic revision and audit reason', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return ok(row);
  };
  await api.save(
    {
      code: row.code,
      versionNo: row.versionNo,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: '',
      lines: row.lines,
      reason: 'Reviewed',
    },
    row,
  );
  await api.publish(row, 'Publish reviewed rates');
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.expectedUpdatedAt, row.updatedAt);
  assert.equal(calls[0].body.effectiveTo, null);
  assert.ok(calls[1].url.endsWith(`/${id}/publish`));
  assert.deepEqual(calls[1].body, {
    expectedUpdatedAt: row.updatedAt,
    reason: 'Publish reviewed rates',
  });
});
test('closing a window does not transmit or overwrite published price lines', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith(`/${id}/close`));
    assert.deepEqual(JSON.parse(options.body), {
      expectedUpdatedAt: row.updatedAt,
      effectiveTo: '2027-01-01T00:00:00Z',
      reason: 'Successor version',
    });
    return ok(row);
  };
  await api.close(row, '2027-01-01T00:00:00Z', 'Successor version');
});
