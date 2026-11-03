import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schema, policy, store;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const policyValue = {
  version: 1,
  divisor: 5000,
  roundingGram: 500,
  returnFeeVnd: '10000',
  declaredValuePpm: 0,
};
const band = {
  minWeightG: 0,
  maxWeightG: null,
  includedWeightG: 1000,
  stepWeightG: 500,
  basePriceVnd: '19000',
  stepPriceVnd: '5000',
};
const row = {
  id,
  version: 1,
  status: 'DRAFT',
  carrierId: id,
  serviceId: id,
  zone: 'Z1',
  volumeTierMin: 0,
  volumeTierMax: null,
  policy: policyValue,
  bands: [band],
  effectiveFrom: '2026-10-12T00:00:00.000Z',
  effectiveTo: null,
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-12T00:00:00Z',
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
  ({ freightTariffApi: api } = await server.ssrLoadModule(
    '/src/features/catalog/api/freightTariffApi.ts',
  ));
  schema = await server.ssrLoadModule('/src/features/catalog/schemas/freightTariffSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'test-token',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: null,
      email: 'test@orca.test',
      fullName: 'Test',
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
    },
  });
});
test('Accountant reaches tariffs without gaining carrier, credential or unrelated admin routes', () => {
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'tariffs.manage'), true);
  assert.equal(policy.isRouteAllowed(['ORCA_ACCOUNTANT'], '/admin/tariffs'), true);
  for (const route of ['/admin/carriers', '/admin/tenants', '/admin/unknown'])
    assert.equal(policy.isRouteAllowed(['ORCA_ACCOUNTANT'], route), false);
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'carriers.credentials.manage'), false);
  for (const roles of [
    ['SELLER_OWNER'],
    ['SELLER_STAFF'],
    ['WAREHOUSE_STAFF'],
    ['OPS_DISPATCHER'],
    ['ORCA_ADMIN', 'SELLER_OWNER'],
    ['ORCA_ADMIN', 'LEGACY'],
  ])
    assert.equal(policy.can(roles, 'tariffs.manage'), false);
});

test('tariff zone options use the credential-free tariff endpoint and reject malformed codes', async () => {
  let requested;
  globalThis.fetch = async (url) => {
    requested = String(url);
    return ok(['INTRA_PROVINCE']);
  };
  assert.deepEqual(await api.zoneCodes(id), ['INTRA_PROVINCE']);
  assert.ok(requested.endsWith(`/platform/tariffs/carriers/${id}/zone-codes`));
  globalThis.fetch = async () => ok(['not a zone']);
  await assert.rejects(api.zoneCodes(id));
});
test('purchase list decodes exact money and shared pagination without tenant impersonation', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/v1/platform/tariffs/purchase'));
    assert.equal(new URL(String(url), 'http://localhost').searchParams.has('tenantId'), false);
    return ok([row], { limit: 20, hasNext: true, nextCursor: id });
  };
  const result = await api.purchase();
  assert.equal(result.items[0].bands[0].basePriceVnd, '19000');
  assert.equal(result.pagination.nextCursor, id);
});
test('malformed money and incomplete pagination reject instead of fabricating a successful list', async () => {
  globalThis.fetch = async () =>
    ok([{ ...row, bands: [{ ...band, basePriceVnd: 19000 }] }], {
      limit: 20,
      hasNext: false,
      nextCursor: null,
    });
  await assert.rejects(api.purchase());
  globalThis.fetch = async () => ok([row]);
  await assert.rejects(api.purchase());
});
test('draft updates send expectedVersion and publishing uses an explicit action', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return ok(row);
  };
  await api.savePurchase({ carrierId: id, serviceId: id, zone: 'Z1' }, row);
  await api.publish('purchase', row);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.expectedVersion, 1);
  assert.ok(calls[1].url.endsWith(`/${id}/publish`));
  assert.deepEqual(calls[1].body, { expectedVersion: 1 });
});
function validForm() {
  return {
    kind: 'sell',
    serviceId: '',
    zone: '',
    code: 'BASIC',
    versionNo: 1,
    referenceSource: 'Published carrier list v1',
    effectiveFrom: '2026-10-12T00:00',
    effectiveTo: '',
    volumeTierMin: 0,
    volumeTierMax: null,
    policy: policyValue,
    bands: [
      {
        ...band,
        direction: 'OUTBOUND',
        laneCode: 'INTRA_PROVINCE',
        policy: policyValue,
        referenceBaseVnd: '22000',
        referenceStepVnd: '6000',
      },
    ],
  };
}
test('draft form rejects overlap, gaps, impossible dates and sell prices above the reference list', () => {
  assert.equal(schema.tariffFormSchema.safeParse(validForm()).success, true);
  assert.equal(
    schema.tariffFormSchema.safeParse({ ...validForm(), effectiveFrom: '2026-02-30T00:00' })
      .success,
    false,
  );
  assert.equal(
    schema.tariffFormSchema.safeParse({
      ...validForm(),
      bands: [{ ...validForm().bands[0], basePriceVnd: '23000' }],
    }).success,
    false,
  );
  assert.equal(
    schema.tariffFormSchema.safeParse({
      ...validForm(),
      bands: [
        { ...validForm().bands[0], maxWeightG: 1000 },
        { ...validForm().bands[0], minWeightG: 999 },
      ],
    }).success,
    false,
  );
  assert.equal(
    schema.tariffFormSchema.safeParse({
      ...validForm(),
      bands: [
        { ...validForm().bands[0], maxWeightG: 1000 },
        { ...validForm().bands[0], minWeightG: 1001 },
      ],
    }).success,
    false,
  );
});
test('invalid money produces form validation rather than a BigInt exception', () => {
  assert.equal(
    schema.tariffFormSchema.safeParse({
      ...validForm(),
      bands: [{ ...validForm().bands[0], basePriceVnd: 'invalid' }],
    }).success,
    false,
  );
});
test('purchase serialization strips seller-only fields and retains exact VND', () => {
  const form = { ...validForm(), kind: 'purchase', serviceId: id, zone: 'Z1' };
  const data = schema.purchaseInput(form, { id, carrierId: id });
  assert.equal(data.bands[0].basePriceVnd, '19000');
  assert.equal('referenceBaseVnd' in data.bands[0], false);
  assert.equal('laneCode' in data.bands[0], false);
  assert.equal(data.effectiveFrom, '2026-10-12T00:00:00.000Z');
});
test('ending a published window checks both revision and prior end date', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith(`/purchase/${id}/close`));
    assert.deepEqual(JSON.parse(options.body), {
      expectedVersion: 1,
      expectedEffectiveTo: null,
      effectiveTo: '2027-01-01T00:00:00.000Z',
    });
    return ok({ ...row, status: 'PUBLISHED', effectiveTo: '2027-01-01T00:00:00.000Z' });
  };
  assert.equal(
    (await api.close('purchase', row, '2027-01-01T00:00:00.000Z')).effectiveTo,
    '2027-01-01T00:00:00.000Z',
  );
});
