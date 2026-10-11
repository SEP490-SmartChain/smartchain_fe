import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, auth, policy, scan;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const receiptId = '00000000-0000-4000-8000-000000000003';
const arrival = {
  asnId: id,
  asnCode: 'ASN-20261011-TEST0001',
  warehouseId,
  receiptId,
  arrivedAt: '2026-10-11T08:00:00.000Z',
  version: 2,
};
const ok = (data, pagination = { limit: 20, hasNext: false, nextCursor: null }) =>
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
  ({ receivingApi: api } = await server.ssrLoadModule('/src/features/inbound/api/receivingApi.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  scan = await server.ssrLoadModule('/src/features/inbound/schemas/asnScanSchema.ts');
  auth
    .getState()
    .setSession({
      accessToken: 'synthetic-arrival-token',
      expiresIn: 900,
      user: {
        userId: id,
        tenantId: null,
        email: 'staff@example.test',
        fullName: 'Arrival Staff',
        actorScope: 'PLATFORM',
        roles: ['WAREHOUSE_STAFF'],
        permissions: [],
      },
    });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('warehouse directory follows the server cursor and keeps only operational fields', async () => {
  const cursors = [];
  globalThis.fetch = async (url) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, '/api/v1/warehouses');
    assert.equal(request.searchParams.get('limit'), '50');
    cursors.push(request.searchParams.get('cursor'));
    return ok(
      [{ id: warehouseId, code: 'WH-01', name: 'Assigned warehouse', phone: 'not-needed' }],
      { limit: 50, hasNext: cursors.length === 1, nextCursor: cursors.length === 1 ? id : null },
    );
  };
  assert.deepEqual(
    await api.warehouses(),
    Array(2).fill({ id: warehouseId, code: 'WH-01', name: 'Assigned warehouse' }),
  );
  assert.deepEqual(cursors, [null, id]);
});

test('warehouse directory rejects a repeated cursor instead of hanging', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return ok([], { limit: 50, hasNext: true, nextCursor: id });
  };
  await assert.rejects(api.warehouses(), /Invalid warehouse pagination/);
  assert.equal(calls, 2);
});

test('warehouse directory rejects missing next cursor and invalid warehouse identity', async () => {
  globalThis.fetch = async () => ok([], { limit: 50, hasNext: true, nextCursor: null });
  await assert.rejects(api.warehouses(), /Invalid warehouse pagination/);
  globalThis.fetch = async () => ok([{ id: 'wrong', code: 'WH', name: 'Warehouse' }]);
  await assert.rejects(api.warehouses(), { name: 'ZodError' });
});

test('warehouse directory bounds pagination instead of silently truncating assignments', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return ok([], {
      limit: 50,
      hasNext: true,
      nextCursor: `00000000-0000-4000-8000-${String(calls).padStart(12, '0')}`,
    });
  };
  await assert.rejects(api.warehouses(), /page limit/);
  assert.equal(calls, 10);
});

test('warehouse ASN search sends scoped path, trimmed code, status and supplied cursor', async () => {
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, `/api/v1/warehouses/${warehouseId}/asns`);
    assert.equal(request.searchParams.get('search'), arrival.asnCode);
    assert.equal(request.searchParams.get('status'), 'SUBMITTED');
    assert.equal(request.searchParams.get('cursor'), id);
    assert.equal(request.searchParams.has('tenantId'), false);
    assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-arrival-token');
    return ok([]);
  };
  assert.deepEqual(
    (await api.list(warehouseId, ` ${arrival.asnCode} `, 'SUBMITTED', id)).items,
    [],
  );
});

test('malformed warehouse ASN never enters the workspace', async () => {
  globalThis.fetch = async () => ok([{ id, status: 'ARRIVED', lines: [{ receivedQty: -1 }] }]);
  await assert.rejects(api.list(warehouseId), { name: 'ZodError' });
});

test('arrival sends only expected version and validates the server receipt', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouseId}/asns/${id}/arrival`,
    );
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { version: 1 });
    return ok(arrival);
  };
  assert.deepEqual(await api.checkIn(warehouseId, id, 1), arrival);
});

for (const invalid of [
  { receiptId: 'not-a-uuid' },
  { arrivedAt: 'tomorrow' },
  { version: 0 },
  { version: 1.5 },
  { warehouseId: null },
]) {
  test(`arrival rejects invalid server field ${JSON.stringify(invalid)}`, async () => {
    globalThis.fetch = async () => ok({ ...arrival, ...invalid });
    await assert.rejects(api.checkIn(warehouseId, id, 1), { name: 'ZodError' });
  });
}

for (const [status, code] of [
  [409, 'INBOUND.ASN_VERSION_CONFLICT'],
  [403, 'AUTH.FORBIDDEN'],
  [404, 'INBOUND.ASN_NOT_FOUND'],
]) {
  test(`arrival ${status} remains recoverable without losing the session`, async () => {
    globalThis.fetch = async () =>
      Response.json(
        { success: false, error: { code, message: 'Reload or review assignment' } },
        { status },
      );
    await assert.rejects(api.checkIn(warehouseId, id, 1), { name: 'ApiError', status, code });
    assert.equal(auth.getState().accessToken, 'synthetic-arrival-token');
  });
}

test('scan accepts ASN/carton references and preserves an unrelated external reference', () => {
  assert.equal(scan.asnCodeFromScan(` ${arrival.asnCode}-C0001 `), arrival.asnCode);
  assert.equal(scan.asnCodeFromScan(arrival.asnCode), arrival.asnCode);
  assert.equal(scan.asnCodeFromScan(' PO-C0001 '), 'PO-C0001');
  assert.equal(scan.asnCodeFromScan(`${arrival.asnCode}-C1`), `${arrival.asnCode}-C1`);
  assert.equal(scan.asnScanSchema.safeParse({ code: '  ' }).success, false);
  assert.equal(scan.asnScanSchema.safeParse({ code: 'a'.repeat(101) }).success, false);
  assert.equal(scan.asnScanSchema.safeParse({ code: 'a'.repeat(100) }).success, true);
});

test('only Warehouse Staff grants check-in across all seven roles', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    assert.equal(policy.can([role], 'warehouse.asn.checkIn'), role === 'WAREHOUSE_STAFF', role);
  }
  assert.equal(policy.can(['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'], 'warehouse.asn.checkIn'), true);
  for (const roles of [
    [],
    ['WAREHOUSE_STAFF', 'SELLER_OWNER'],
    ['WAREHOUSE_STAFF', 'ADMIN'],
    ['unknown'],
  ])
    assert.equal(policy.can(roles, 'warehouse.asn.checkIn'), false);
  assert.equal(
    policy.can(policy.getEffectiveRoles(['WAREHOUSE_STAFF'], 'TENANT'), 'warehouse.asn.checkIn'),
    false,
  );
  assert.equal(
    policy.can(policy.getEffectiveRoles(['WAREHOUSE_STAFF'], undefined), 'warehouse.asn.checkIn'),
    false,
  );
});
