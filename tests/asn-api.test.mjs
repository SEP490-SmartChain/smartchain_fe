import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let api;
let auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const asn = {
  id,
  tenantId: id,
  warehouseId: '00000400-0000-4000-8000-000000000001',
  asnCode: 'ASN-20261010-TEST0001',
  externalReference: 'PO-1001',
  status: 'DRAFT',
  expectedArrivalAt: null,
  arrivedAt: null,
  submittedAt: null,
  cartonLabelRefs: [],
  cartonCount: 2,
  cancellationReason: null,
  cancelledAt: null,
  receiptIds: [],
  discrepancyIds: [],
  createdByUserId: id,
  version: 1,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  lines: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      lineNo: 1,
      productId: '00000500-0000-4000-8000-000000000001',
      sku: 'SKU-001',
      productName: 'Test product',
      declaredQty: 10,
      receivedQty: 0,
      acceptedQty: 0,
      quarantinedQty: 0,
      rejectedQty: 0,
      declaredLotCode: null,
      declaredExpiryOn: null,
    },
  ],
};

const ok = (data, pagination = { limit: 100, hasNext: false, nextCursor: null }) =>
  Response.json({ success: true, data, meta: { pagination } });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ asnApi: api } = await server.ssrLoadModule('/src/features/inbound/api/asnApi.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  auth.getState().setSession({
    accessToken: 'synthetic-owner-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: id,
      email: 'owner@example.test',
      fullName: 'Owner',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
    },
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('list trims search, sends status and parses the envelope', async () => {
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, '/api/v1/asns');
    assert.equal(request.searchParams.get('search'), 'PO-1001');
    assert.equal(request.searchParams.get('status'), 'DRAFT');
    assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-owner-token');
    return ok([asn]);
  };
  assert.deepEqual((await api.list(' PO-1001 ', 'DRAFT')).items, [asn]);
});

test('create posts the seller payload and parses the created draft', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url, 'https://example.test').pathname, '/api/v1/asns');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      warehouseId: asn.warehouseId,
      cartonCount: 2,
      operationKey: id,
      lines: [{ productId: asn.lines[0].productId, declaredQty: 10 }],
    });
    return ok(asn);
  };
  assert.equal(
    (
      await api.create({
        warehouseId: asn.warehouseId,
        cartonCount: 2,
        operationKey: id,
        lines: [{ productId: asn.lines[0].productId, declaredQty: 10 }],
      })
    ).id,
    id,
  );
});

test('submit and cancel use the optimistic version in the command body', async () => {
  const paths = [];
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://example.test');
    paths.push(request.pathname);
    assert.equal(options.method, 'POST');
    assert.deepEqual(
      JSON.parse(options.body),
      request.pathname.endsWith('/cancel')
        ? { version: 1, reason: 'No longer needed' }
        : { version: 1 },
    );
    return ok(asn);
  };
  await api.submit(id, 1);
  await api.cancel(id, 1, 'No longer needed');
  assert.deepEqual(paths, [`/api/v1/asns/${id}/submit`, `/api/v1/asns/${id}/cancel`]);
});

test('malformed ASN data is rejected instead of reaching the page', async () => {
  globalThis.fetch = async () => ok([{ ...asn, version: 0 }]);
  await assert.rejects(api.list(), { name: 'ZodError' });
});

test('SKU options use the narrow ASN lookup, never priced catalog', async () => {
  const sku = { id, sku: 'SKU-001', name: 'Test product', trackLot: true, trackExpiry: false };
  globalThis.fetch = async (url) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, '/api/v1/asns/sku-options');
    assert.equal(request.searchParams.get('search'), 'SKU');
    assert.equal(request.searchParams.get('cursor'), id);
    return ok([sku]);
  };
  assert.deepEqual((await api.skuOptions(' SKU ', id)).items, [sku]);
});

test('pagination follows the supplied cursor', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url, 'https://example.test').searchParams.get('cursor'), id);
    return ok([asn], { limit: 20, hasNext: true, nextCursor: id });
  };
  assert.equal((await api.list('', undefined, id)).pagination.nextCursor, id);
});

test('draft edit sends lines and version, without selecting a new warehouse', async () => {
  const changes = { version: 1, cartonCount: 3, lines: [{ productId: id, declaredQty: 5 }] };
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url, 'https://example.test').pathname, `/api/v1/asns/${id}`);
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), changes);
    return ok({ ...asn, version: 2 });
  };
  assert.equal((await api.update(id, changes)).version, 2);
});

test('stale version remains a recoverable API conflict', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'INBOUND.ASN_VERSION_CONFLICT', message: 'Reload the ASN' },
      },
      { status: 409 },
    );
  await assert.rejects(api.submit(id, 1), {
    name: 'ApiError',
    code: 'INBOUND.ASN_VERSION_CONFLICT',
    status: 409,
  });
});

for (const invalid of [
  { cartonCount: 0 },
  { status: 'UNKNOWN' },
  { lines: [{ ...asn.lines[0], receivedQty: -1 }] },
]) {
  test(`rejects malformed server ASN ${JSON.stringify(invalid)}`, async () => {
    globalThis.fetch = async () => ok({ ...asn, ...invalid });
    await assert.rejects(api.get(id), { name: 'ZodError' });
  });
}

test('ASN form covers quantity/carton/date boundaries and cancellation reason', async () => {
  const { asnFormSchema, cancelAsnSchema } = await server.ssrLoadModule(
    '/src/features/inbound/schemas/asnSchema.ts',
  );
  const valid = {
    warehouseId: asn.warehouseId,
    cartonCount: 1,
    externalReference: '',
    expectedArrivalAt: '',
    lines: [{ productId: id, declaredQty: 1, declaredLotCode: '', declaredExpiryOn: '' }],
  };
  assert.equal(asnFormSchema.safeParse(valid).success, true);
  assert.equal(
    asnFormSchema.safeParse({
      ...valid,
      cartonCount: 1000,
      lines: [{ ...valid.lines[0], declaredQty: 1000000, declaredExpiryOn: '2028-02-29' }],
    }).success,
    true,
  );
  for (const declaredQty of [0, -1, 1.5, NaN, 1000001])
    assert.equal(
      asnFormSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], declaredQty }] }).success,
      false,
    );
  for (const cartonCount of [0, 1001, 1.5])
    assert.equal(asnFormSchema.safeParse({ ...valid, cartonCount }).success, false);
  assert.equal(asnFormSchema.safeParse({ ...valid, lines: [] }).success, false);
  assert.equal(
    asnFormSchema.safeParse({
      ...valid,
      lines: [{ ...valid.lines[0], declaredExpiryOn: '2026-02-30' }],
    }).success,
    false,
  );
  assert.equal(cancelAsnSchema.safeParse({ reason: '   ' }).success, false);
  assert.equal(cancelAsnSchema.safeParse({ reason: 'a'.repeat(501) }).success, false);
  assert.deepEqual(cancelAsnSchema.parse({ reason: ' Change plan ' }), { reason: 'Change plan' });
});
