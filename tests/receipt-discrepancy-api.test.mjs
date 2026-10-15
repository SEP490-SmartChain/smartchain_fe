import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, schemas, auth, policy;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001',
  warehouse = '00000000-0000-4000-8000-000000000002',
  line = '00000000-0000-4000-8000-000000000003';
const input = {
  operationKey: id,
  expectedVersion: 3,
  inboundLineId: line,
  discrepancyType: 'SHORT',
  reason: 'Physical short',
};
const report = {
  id,
  inboundLineId: line,
  receivingRecordId: null,
  discrepancyType: 'SHORT',
  qty: 3,
  reason: 'Physical short',
  photoIds: [],
  receiptVersion: 4,
  status: 'OPEN',
  reportedAt: '2026-10-12T08:00:00.000Z',
};
const state = {
  receiptId: id,
  receiptVersion: 4,
  asnId: id,
  asnStatus: 'DISCREPANCY',
  ready: true,
  lines: [
    {
      inboundLineId: line,
      lineNo: 1,
      declaredQty: null,
      variance: { discrepancyType: 'SHORT', qty: 3 },
      receivedQty: 7,
      exceptions: [],
    },
  ],
  items: [report],
};
const ok = (data) => Response.json({ success: true, data, meta: {} });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/inbound/api/discrepancyApi.ts');
  api = schemas.discrepancyApi;
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth.getState().setSession({
    accessToken: 'synthetic-discrepancy-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'staff@example.test',
      fullName: 'Test Staff',
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
test('reads selected warehouse/ASN discrepancy state with cancellation', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/discrepancies`,
    );
    assert.ok(options.signal);
    return ok(state);
  };
  assert.deepEqual(await api.get(warehouse, id, controller.signal), state);
});
test('sends only reference/reason/revision, derives no physical quantities in the command', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), input);
    return ok(report);
  };
  assert.deepEqual(await api.report(warehouse, id, input), report);
});
for (const changed of [
  { asnId: line },
  { receiptVersion: 3 },
  { lines: [state.lines[0], state.lines[0]] },
  { items: [report, report] },
  { items: [{ ...report, inboundLineId: id }] },
  { items: [{ ...report, qty: -1 }] },
  { items: [{ ...report, evidenceKey: 'private' }] },
  { items: [{ ...report, reportedByPlatformUserId: id }] },
])
  test(`rejects foreign/inconsistent/private state ${JSON.stringify(changed)}`, async () => {
    globalThis.fetch = async () => ok({ ...state, ...changed });
    await assert.rejects(api.get(warehouse, id));
  });
test('never accepts raw declarations and withholds server variance before complete count/QC', () => {
  assert.equal(
    schemas.discrepancyStateSchema.safeParse({
      ...state,
      ready: false,
      items: [],
      lines: [{ ...state.lines[0], variance: null }],
    }).success,
    true,
  );
  assert.equal(schemas.discrepancyStateSchema.safeParse({ ...state, ready: false }).success, false);
  assert.equal(
    schemas.discrepancyStateSchema.safeParse({
      ...state,
      lines: [{ ...state.lines[0], declaredQty: 10 }],
    }).success,
    false,
  );
  assert.equal(
    schemas.discrepancyStateSchema.safeParse({
      ...state,
      items: [],
      lines: [{ ...state.lines[0], receivedQty: 0 }],
    }).success,
    true,
  );
});
test('quality reports require the counted lot and verified photo provenance for damage', () => {
  assert.equal(
    schemas.discrepancyInputSchema.safeParse({ ...input, discrepancyType: 'DAMAGED' }).success,
    false,
  );
  assert.equal(
    schemas.discrepancyInputSchema.safeParse({
      ...input,
      discrepancyType: 'DAMAGED',
      receivingRecordId: id,
    }).success,
    true,
  );
  assert.equal(
    schemas.discrepancySchema.safeParse({
      ...report,
      discrepancyType: 'DAMAGED',
      receivingRecordId: id,
    }).success,
    false,
  );
  assert.equal(
    schemas.discrepancySchema.safeParse({
      ...report,
      discrepancyType: 'DAMAGED',
      receivingRecordId: id,
      photoIds: [line],
    }).success,
    true,
  );
});
test('rejects forged physical quantities, photos, reason and revision input before sending', () => {
  for (const changed of [
    { qty: 999 },
    { photoIds: [id] },
    { expectedVersion: 0 },
    { expectedVersion: '3' },
    { expectedVersion: 2147483647 },
    { reason: ' ' },
    { reason: '\u0000' },
    { reason: 'x'.repeat(1001) },
    { receivingRecordId: id },
    { tenantId: id },
  ])
    assert.equal(schemas.discrepancyInputSchema.safeParse({ ...input, ...changed }).success, false);
});
test('rejects response for a different line/type/reason/revision', async () => {
  for (const changed of [
    { inboundLineId: id },
    { discrepancyType: 'OVER' },
    { reason: 'Other reason' },
    { receiptVersion: 8 },
  ]) {
    globalThis.fetch = async () => ok({ ...report, ...changed });
    await assert.rejects(api.report(warehouse, id, input));
  }
});
test('uncertain retry reuses the exact operation/payload', async () => {
  const attempts = [];
  globalThis.fetch = async (url, options) => {
    attempts.push(JSON.parse(options.body));
    if (attempts.length === 1) throw new TypeError('Lost committed response');
    return ok(report);
  };
  await assert.rejects(api.report(warehouse, id, input));
  assert.deepEqual(await api.report(warehouse, id, input), report);
  assert.deepEqual(attempts, [input, input]);
});
test('403/409 remain actionable and preserve authenticated Staff scope', async () => {
  for (const status of [403, 409]) {
    globalThis.fetch = async () =>
      Response.json(
        {
          success: false,
          error: { code: 'INBOUND.DISCREPANCY_CONFLICT', message: 'Reload', details: null },
          meta: {},
        },
        { status },
      );
    await assert.rejects(api.report(warehouse, id, input), (error) => error.status === status);
    assert.equal(auth.getState().user.roles[0], 'WAREHOUSE_STAFF');
  }
});
test('only Staff may submit discrepancy; seven roles and legacy/mixed/missing identity deny', () => {
  for (const role of [
    'SELLER_OWNER',
    'SELLER_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
  ]) {
    const actor = {
      actorScope: role.startsWith('SELLER_') ? 'TENANT' : 'PLATFORM',
      tenantId: role.startsWith('SELLER_') ? id : null,
      roles: [role],
      permissions: [],
    };
    assert.equal(
      policy.can(
        policy.getEffectiveRoles(actor.roles, actor.actorScope),
        'warehouse.asn.reportDiscrepancy',
      ),
      role === 'WAREHOUSE_STAFF',
    );
  }
  for (const actor of [
    { roles: ['WAREHOUSE_STAFF'] },
    { actorScope: 'TENANT', roles: ['WAREHOUSE_STAFF'] },
    { actorScope: 'PLATFORM', roles: ['WAREHOUSE_STAFF', 'SELLER_OWNER'] },
    { actorScope: 'PLATFORM', roles: ['MANAGER'] },
  ])
    assert.equal(
      policy.can(
        policy.getEffectiveRoles(actor.roles, actor.actorScope),
        'warehouse.asn.reportDiscrepancy',
      ),
      false,
    );
});
