import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, store;
const fetchOriginal = globalThis.fetch;
const id = '12990001-0000-4000-8000-000000000001';
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ commercialApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/commercialApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  store.getState().setSession({
    accessToken: 'synthetic-test-only',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
      email: 'admin@example.test',
      fullName: 'Synthetic Admin',
    },
  });
});
after(async () => {
  globalThis.fetch = fetchOriginal;
  await server?.close();
});
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-10-23T00:00:00Z', path: '', requestId: 'fixture' },
  });
test('rejects an unapproved plan using authorized seller resource, version, audit reason and cancellation', async () => {
  const abort = new AbortController();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return ok({ id, status: 'REJECTED', effectiveOn: '2026-11-01' });
  };
  const result = await api.rejectPlanChange(id, id, 2, 'Missed approval cutoff', abort.signal);
  assert.equal(result.status, 'REJECTED');
  assert.ok(request.url.endsWith(`/v1/commercial/tenants/${id}/plan-changes/${id}/reject`));
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {
    expectedVersion: 2,
    reason: 'Missed approval cutoff',
  });
  assert.equal(request.options.signal, abort.signal);
});
test('does not accept a scheduled or malformed response as successful rejection', async () => {
  globalThis.fetch = async () => ok({ id, status: 'SCHEDULED', effectiveOn: '2026-11-01' });
  await assert.rejects(api.rejectPlanChange(id, id, 2, 'Reject request'));
});
test('surfaces stale version failures without losing the authenticated session', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'COMMERCIAL.PLAN_CHANGE_STALE', message: 'Reload request', statusCode: 409 },
        meta: {},
      },
      { status: 409 },
    );
  await assert.rejects(
    api.rejectPlanChange(id, id, 1, 'Reject request'),
    (error) => error.code === 'COMMERCIAL.PLAN_CHANGE_STALE',
  );
  assert.equal(store.getState().user.userId, id);
});

test('requestPlanChange forwards warehouseIds only when supplied and quotas parses warehouse selections', async () => {
  const whA = '00000400-0000-4000-8000-000000000001';
  const whB = '00000400-0000-4000-8000-000000000002';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), method: options.method, body: options.body });
    if (String(url).includes('/v1/commercial/plan-changes')) {
      return ok({ id, status: 'REQUESTED', effectiveOn: '2026-12-01' });
    }
    return ok({
      tenantId: id,
      serviceStatus: 'ACTIVE',
      plan: {
        id,
        name: 'Standard',
        code: 'STANDARD',
        versionNo: 1,
        monthlyFeeVnd: '12000000',
        warehouseAllowance: 3,
        salesOrderAllowance: 1500,
        storageAllowanceM3: '30',
      },
      usage: null,
      changes: [
        {
          id,
          planVersionId: id,
          status: 'REQUESTED',
          effectiveOn: '2026-12-01',
          selectedWarehouseIds: [whA, whB],
        },
      ],
      selectedWarehouses: [{ id: whA, code: 'WH-HN', name: 'Kho Hà Nội' }],
    });
  };

  await api.requestPlanChange(id, 2, id, undefined, [whA, whB]);
  assert.deepEqual(JSON.parse(requests[0].body), {
    planVersionId: id,
    expectedVersion: 2,
    operationKey: id,
    warehouseIds: [whA, whB],
  });

  await api.requestPlanChange(id, 2, id);
  assert.deepEqual(JSON.parse(requests[1].body), {
    planVersionId: id,
    expectedVersion: 2,
    operationKey: id,
  });

  const quota = await api.quotas();
  assert.deepEqual(quota.selectedWarehouses, [{ id: whA, code: 'WH-HN', name: 'Kho Hà Nội' }]);
  assert.deepEqual(quota.changes[0].selectedWarehouseIds, [whA, whB]);
});
