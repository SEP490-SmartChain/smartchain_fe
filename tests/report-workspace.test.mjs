import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, schemas, store;
const originalFetch = globalThis.fetch;
const id = '10290000-0000-4000-8000-000000000001';
const filters = {
  from: '2026-10-01',
  to: '2026-10-22',
  warehouseId: '',
  actorId: '',
  action: '',
  entityId: '',
  kind: '',
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-22T00:00:00Z',
      path: '',
      requestId: 'synthetic',
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
  ({ reportApi: api } = await server.ssrLoadModule('/src/features/analytics/api/reportApi.ts'));
  schemas = await server.ssrLoadModule('/src/features/analytics/schemas/reportSchema.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: id,
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
    },
  });
});
test('report API uses GET, keeps warehouse as a filter and forwards cancellation', async () => {
  const abort = new AbortController();
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return ok({
      schemaVersion: 1,
      kind: 'seller',
      generatedAt: '2026-10-22T00:00:00Z',
      from: filters.from,
      to: filters.to,
      timezone: 'Asia/Ho_Chi_Minh',
      sections: [],
    });
  };
  await api.read('seller', { ...filters, warehouseId: id }, abort.signal);
  assert.match(captured.url, /\/v1\/reports\/seller\?/);
  assert.match(captured.url, /warehouseId=/);
  assert.doesNotMatch(captured.url, /tenantId=/);
  assert.equal(captured.init.signal, abort.signal);
  assert.equal(captured.init.method, 'GET');
});
test('VND and missing measurements remain exact strings and null', () => {
  const value = schemas.reportSchema.parse({
    schemaVersion: 1,
    kind: 'finance',
    generatedAt: '2026-10-22T00:00:00Z',
    from: filters.from,
    to: filters.to,
    timezone: 'Asia/Ho_Chi_Minh',
    sections: [
      {
        id: 'fees',
        status: 'PARTIAL',
        metrics: [
          { key: 'serviceFees', value: '9007199254740993', unit: 'VND', basis: 'events' },
          { key: 'actualMargin', value: null, unit: 'VND', basis: 'missing_actuals' },
        ],
      },
    ],
  });
  assert.equal(value.sections[0].metrics[0].value, '9007199254740993');
  assert.equal(value.sections[0].metrics[1].value, null);
  assert.equal(
    schemas.reportSchema.safeParse({
      ...value,
      sections: [
        { ...value.sections[0], metrics: [{ key: 'fee', value: 123, unit: 'VND', basis: 'bad' }] },
      ],
    }).success,
    false,
  );
});
test('unknown report kinds and malformed filtering are rejected', () => {
  assert.equal(schemas.reportKindSchema.safeParse('secret-admin').success, false);
  assert.equal(
    schemas.reportFilterSchema.safeParse({ ...filters, from: '2026-10-23' }).success,
    false,
  );
  assert.equal(
    schemas.reportFilterSchema.safeParse({ ...filters, actorId: 'unbounded-input' }).success,
    false,
  );
});
test('audit and technical requests only send their permitted filter fields', async () => {
  let url = '';
  globalThis.fetch = async (input) => {
    url = String(input);
    return ok([], { limit: 50, hasNext: false, nextCursor: null });
  };
  await api.logs(
    'audit',
    { ...filters, warehouseId: id, actorId: id, action: 'TARIFF_CHANGED', kind: 'SCAN' },
    '0123456789abcdef01234567',
  );
  assert.match(url, /action=TARIFF_CHANGED/);
  assert.doesNotMatch(url, /warehouseId=|kind=/);
  await api.logs('logs', {
    ...filters,
    warehouseId: id,
    actorId: id,
    action: 'ignored',
    entityId: id,
    kind: 'SCAN',
  });
  assert.match(url, /warehouseId=/);
  assert.match(url, /kind=SCAN/);
  assert.doesNotMatch(url, /action=|entityId=/);
});

test('a report response for another view is rejected instead of rendered', async () => {
  globalThis.fetch = async () =>
    ok({
      schemaVersion: 1,
      kind: 'finance',
      generatedAt: '2026-10-22T00:00:00Z',
      from: filters.from,
      to: filters.to,
      timezone: 'Asia/Ho_Chi_Minh',
      sections: [],
    });
  await assert.rejects(api.read('seller', filters));
});
test('per-view warehouse requirements and masked webhook evidence are validated', () => {
  const result = schemas.optionsSchema.parse({
    views: ['warehouse', 'audit'],
    warehouses: [],
    warehouseRequired: false,
    warehouseRequiredViews: ['warehouse'],
  });
  assert.deepEqual(result.warehouseRequiredViews, ['warehouse']);
  assert.equal(
    schemas.optionsSchema.safeParse({ ...result, warehouseRequiredViews: ['unknown-admin-view'] })
      .success,
    false,
  );
});
