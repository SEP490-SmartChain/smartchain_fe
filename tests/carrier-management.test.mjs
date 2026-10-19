import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schemas, store, zones, zoneSchema;
const originalFetch = globalThis.fetch;
const id = 'cd882d2d-8dca-4111-add1-948cd7e9b095';
const updatedAt = '2026-10-14T01:00:00.000Z';
const values = {
  code: 'road',
  name: 'Road delivery',
  transportMode: 'ROAD',
  volumetricDivisor: 5000,
  maxWeightG: '',
  maxLengthCm: '',
  maxWidthCm: '',
  maxHeightCm: '',
  maxDimensionSumCm: '',
  isActive: true,
};
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ carrierManagementApi: api } = await server.ssrLoadModule(
    '/src/features/catalog/api/carrierManagementApi.ts',
  ));
  schemas = await server.ssrLoadModule('/src/features/catalog/schemas/carrierManagementSchema.ts');
  ({ carrierZoneApi: zones } = await server.ssrLoadModule(
    '/src/features/catalog/api/carrierZoneApi.ts',
  ));
  zoneSchema = await server.ssrLoadModule('/src/features/catalog/schemas/carrierZoneSchema.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

test('zone routes validate names, ETA and province codes without inventing coverage', () => {
  const input = { fromProvince: '79', toProvince: '79', zone: ' intra_province ', etaDays: 1 };
  assert.equal(zoneSchema.carrierZoneFormSchema.parse(input).zone, 'INTRA_PROVINCE');
  for (const changed of [
    { zone: '' },
    { zone: 'bad zone' },
    { etaDays: 0 },
    { etaDays: 61 },
    { fromProvince: '' },
  ]) {
    assert.equal(
      zoneSchema.carrierZoneFormSchema.safeParse({ ...input, ...changed }).success,
      false,
    );
  }
});

test('zone creation and stale-safe updates send only permitted route fields', async () => {
  const input = { fromProvince: '79', toProvince: '79', zone: 'INTRA_PROVINCE', etaDays: 1 };
  const row = { ...input, id, carrierId: id, createdAt: updatedAt, updatedAt };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return Response.json({
      success: true,
      data: row,
      meta: { timestamp: updatedAt, path: '', requestId: 'test' },
    });
  };
  await zones.save(id, input);
  await zones.save(id, { ...input, zone: 'CHANGED' }, row);
  assert.ok(calls[0].url.endsWith(`/platform/carriers/${id}/zones`));
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, input);
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(calls[1].body, { zone: 'CHANGED', etaDays: 1, expectedUpdatedAt: updatedAt });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'fixture',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      email: 'admin@local.test',
      fullName: 'Admin',
      roles: ['ORCA_ADMIN'],
      permissions: [],
    },
  });
});
function ok() {
  return Response.json({
    success: true,
    data: null,
    meta: { timestamp: updatedAt, path: '', requestId: 'fixture' },
  });
}
test('service blank limits remain null; invalid limits and malformed carrier codes are rejected', () => {
  const parsed = schemas.carrierServiceFormSchema.parse(values);
  assert.equal(schemas.servicePayload(parsed).maxWeightG, null);
  for (const maxWeightG of ['0', '-1', '1.5', '2147483648'])
    assert.equal(
      schemas.carrierServiceFormSchema.safeParse({ ...values, maxWeightG }).success,
      false,
    );
  for (const maxLengthCm of ['0', '1.234', '1000000'])
    assert.equal(
      schemas.carrierServiceFormSchema.safeParse({ ...values, maxLengthCm }).success,
      false,
    );
  assert.equal(
    schemas.carrierFormSchema.safeParse({ code: 'bad code', name: 'Carrier', isActive: false })
      .success,
    false,
  );
});
test('create carrier uses authenticated POST and does not imply an active integration', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url, 'http://fixture').pathname, '/api/v1/platform/carriers');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer fixture');
    assert.deepEqual(JSON.parse(options.body), {
      code: 'NEW_CARRIER',
      name: 'New carrier',
      isActive: false,
    });
    return ok();
  };
  await api.saveCarrier({ code: 'NEW_CARRIER', name: 'New carrier', isActive: false });
});
test('service update sends expected revision and null clears without rewriting code', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'http://fixture').pathname,
      `/api/v1/platform/carriers/${id}/services/${id}`,
    );
    assert.equal(options.method, 'PATCH');
    const body = JSON.parse(options.body);
    assert.equal(body.expectedUpdatedAt, updatedAt);
    assert.equal(body.maxLengthCm, null);
    assert.equal('code' in body, false);
    assert.equal(body.isActive, false);
    return ok();
  };
  await api.saveService(id, { ...values, isActive: false }, { id, updatedAt });
});
test('stale update is surfaced as a failure rather than success', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'CATALOG.STALE_UPDATE', message: 'Refresh before saving', statusCode: 409 },
        meta: { timestamp: updatedAt, path: '', requestId: 'fixture' },
      },
      { status: 409 },
    );
  await assert.rejects(
    api.saveCarrier({ code: 'GHN', name: 'GHN', isActive: true }, { id, updatedAt }),
  );
});
