import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, auth, policy, forms;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001',
  warehouse = '00000000-0000-4000-8000-000000000002',
  record = '00000000-0000-4000-8000-000000000003';
const input = {
  operationKey: id,
  expectedVersion: 2,
  acceptedQty: 7,
  quarantinedQty: 0,
  rejectedQty: 0,
  reasonCode: 'NONE',
  reason: '',
  photoIds: [],
};
const { operationKey, expectedVersion, ...values } = input;
const proposal = {
  ...values,
  id,
  receivingRecordId: record,
  inspectionVersion: 1,
  receiptVersion: 3,
  inspectedAt: '2026-10-12T01:00:00.000Z',
  status: 'PROPOSED',
};
const state = {
  receivingRecordId: record,
  receivedQty: 7,
  receiptVersion: 3,
  qcState: 'REVIEW_REQUIRED',
  items: [proposal],
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
  ({ inspectionApi: api } = await server.ssrLoadModule(
    '/src/features/inbound/api/inspectionApi.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  forms = await server.ssrLoadModule('/src/features/inbound/schemas/receiptInspectionSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth.getState().setSession({
    accessToken: 'synthetic-qc-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'staff@example.test',
      fullName: 'QC Staff',
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
test('reads scoped QC history and propagates cancellation', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/records/${record}/inspections`,
    );
    assert.ok(options.signal);
    return ok(state);
  };
  assert.deepEqual(await api.get(warehouse, id, record, controller.signal), state);
});
test('permits another inspection only when pending history has a Manager RETURN decision', async () => {
  globalThis.fetch = async () => ok({ ...state, qcState: 'PENDING', lastDecision: 'RETURN' });
  assert.equal((await api.get(warehouse, id, record)).qcState, 'PENDING');
  globalThis.fetch = async () => ok({ ...state, qcState: 'PENDING', lastDecision: 'APPROVE' });
  await assert.rejects(api.get(warehouse, id, record), { name: 'ZodError' });
});
test('rejects foreign identity, inconsistent quantities, revisions and duplicate history', async () => {
  for (const changed of [
    { receivingRecordId: id },
    { receivedQty: 8 },
    { receiptVersion: 2 },
    { items: [proposal, proposal] },
    { items: [{ ...proposal, receivingRecordId: id }] },
    { items: [{ ...proposal, inspectionVersion: 2 }] },
    { qcState: 'PENDING' },
  ]) {
    globalThis.fetch = async () => ok({ ...state, ...changed });
    await assert.rejects(api.get(warehouse, id, record));
  }
});
test('fails closed for unapproved private/financial fields in QC projection', async () => {
  for (const extra of [
    { tenantId: id },
    { payloadHash: 'private' },
    { inspectedByPlatformUserId: id },
    { declaredQty: 10 },
    { evidenceKey: 'private-object' },
    { orderValue: '10000' },
    { operationKey: id },
  ]) {
    globalThis.fetch = async () => ok({ ...state, items: [{ ...proposal, ...extra }] });
    await assert.rejects(api.get(warehouse, id, record), { name: 'ZodError' });
  }
});
test('preserves exact operation/payload for uncertain POST retries', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'POST');
    requests.push(JSON.parse(options.body));
    return ok(proposal);
  };
  assert.deepEqual(await api.propose(warehouse, id, record, input), proposal);
  await api.propose(warehouse, id, record, input);
  assert.deepEqual(requests, [input, input]);
});
test('rejects unrelated or changed response disposition and photo references', async () => {
  for (const changed of [
    { receivingRecordId: id },
    { acceptedQty: 6 },
    { quarantinedQty: 1 },
    { rejectedQty: 1 },
    { reason: 'changed' },
    { reasonCode: 'OTHER' },
    { photoIds: [id] },
    { status: 'APPROVED' },
  ]) {
    globalThis.fetch = async () => ok({ ...proposal, ...changed });
    await assert.rejects(api.propose(warehouse, id, record, input));
  }
});
test('accepts canonical photo order and trimmed reason on replay', async () => {
  const changed = {
    ...input,
    acceptedQty: 4,
    quarantinedQty: 2,
    rejectedQty: 1,
    reasonCode: 'DAMAGED',
    reason: ' Wet cartons ',
    photoIds: [record, id],
  };
  // Build only the allowlisted response shape.
  globalThis.fetch = async () =>
    ok({
      ...proposal,
      acceptedQty: 4,
      quarantinedQty: 2,
      rejectedQty: 1,
      reasonCode: 'DAMAGED',
      reason: 'Wet cartons',
      photoIds: [id, record],
    });
  assert.equal((await api.propose(warehouse, id, record, changed)).reason, 'Wet cartons');
});
test('surfaces 403/409 without replacing the command or logging the user out', async () => {
  for (const status of [403, 409]) {
    globalThis.fetch = async () =>
      Response.json(
        {
          success: false,
          error: { code: 'INBOUND.QC_CONFLICT', message: 'Reload receipt' },
          meta: {},
        },
        { status },
      );
    await assert.rejects(
      api.propose(warehouse, id, record, input),
      (error) => error.status === status,
    );
    assert.equal(auth.getState().user.roles[0], 'WAREHOUSE_STAFF');
  }
});
test('validates complete physical partitions including all quarantine and mixed damage', () => {
  assert.equal(forms.inspectionFormSchema(7, false).safeParse(values).success, true);
  assert.equal(
    forms.inspectionFormSchema(7, true).safeParse({
      ...values,
      acceptedQty: 0,
      quarantinedQty: 7,
      reasonCode: 'SHORT_SHELF_LIFE',
      reason: 'Below threshold',
    }).success,
    true,
  );
  assert.equal(
    forms.inspectionFormSchema(7, false).safeParse({
      ...values,
      acceptedQty: 4,
      quarantinedQty: 2,
      rejectedQty: 1,
      reasonCode: 'DAMAGED',
      reason: 'Crushed',
      photoIds: [id],
    }).success,
    true,
  );
});
for (const qty of [-1, 0.5, 1000001, NaN, Infinity, '7'])
  test(`QC form rejects invalid actual quantity ${qty}`, () => {
    assert.equal(
      forms.inspectionFormSchema(7, false).safeParse({ ...values, acceptedQty: qty }).success,
      false,
    );
  });
test('blocks missing partition, over/undercount and ineligible acceptance', () => {
  for (const changed of [
    { acceptedQty: 6 },
    { acceptedQty: 8 },
    { acceptedQty: undefined },
    { quarantinedQty: undefined },
  ])
    assert.equal(
      forms.inspectionFormSchema(7, false).safeParse({ ...values, ...changed }).success,
      false,
    );
  assert.equal(forms.inspectionFormSchema(7, true).safeParse(values).success, false);
});
test('requires exception reason and confirmed-photo reference for damage', () => {
  for (const changed of [
    { acceptedQty: 6, quarantinedQty: 1 },
    { acceptedQty: 6, rejectedQty: 1, reasonCode: 'OTHER', reason: '' },
    { acceptedQty: 6, quarantinedQty: 1, reasonCode: 'DAMAGED', reason: 'Wet', photoIds: [] },
    { photoIds: [id, id] },
    { photoIds: ['bad'] },
    { photoIds: Array(11).fill(id) },
    { reason: '\u0000' },
  ])
    assert.equal(
      forms.inspectionFormSchema(7, false).safeParse({ ...values, ...changed }).success,
      false,
    );
});
test('only warehouse Staff can submit QC; seven roles, same/mixed scope and legacy deny', () => {
  for (const role of [
    'SELLER_OWNER',
    'SELLER_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
  ])
    assert.equal(policy.can([role], 'warehouse.asn.inspect'), role === 'WAREHOUSE_STAFF');
  assert.equal(policy.can(['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER'], 'warehouse.asn.inspect'), true);
  for (const roles of [
    ['WAREHOUSE_STAFF', 'SELLER_OWNER'],
    ['WAREHOUSE_STAFF', 'UNKNOWN'],
    ['MANAGER'],
    [],
    ['WAREHOUSE_STAFF', 'ADMIN'],
  ])
    assert.equal(policy.can(roles, 'warehouse.asn.inspect'), false);
});
