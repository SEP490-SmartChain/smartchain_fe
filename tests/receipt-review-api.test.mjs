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
  expectedVersion: 4,
  decision: 'APPROVE',
  reason: 'Reviewed physical evidence',
  inspectionIds: [line],
  discrepancyIds: [],
};
const review = {
  id,
  receiptId: id,
  decision: 'APPROVE',
  reason: input.reason,
  inspectionIds: [line],
  discrepancyIds: [],
  receiptVersion: 5,
  reviewedAt: '2026-10-12T09:00:00.000Z',
  notificationState: 'PENDING',
};
const state = {
  receiptId: id,
  receiptVersion: 4,
  asnId: id,
  asnStatus: 'RECEIVING',
  status: 'RECEIVING',
  ready: true,
  canApprove: true,
  unreportedDiscrepancies: 0,
  inspectionIds: [line],
  discrepancyIds: [],
  records: [
    {
      receivingRecordId: line,
      lotCode: 'LOT-01',
      receivedQty: 7,
      qcState: 'REVIEW_REQUIRED',
      inspection: {
        id: line,
        acceptedQty: 7,
        quarantinedQty: 0,
        rejectedQty: 0,
        reasonCode: 'NONE',
        reason: '',
        photoIds: [],
      },
    },
  ],
  items: [],
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
  schemas = await server.ssrLoadModule('/src/features/inbound/api/reviewApi.ts');
  api = schemas.reviewApi;
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
      roles: ['WAREHOUSE_MANAGER'],
      permissions: [],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
test('reads only selected ASN review evidence and propagates cancellation', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/reviews`,
    );
    assert.ok(options.signal);
    return ok(state);
  };
  assert.deepEqual(await api.get(warehouse, id, new AbortController().signal), state);
});
test('submits only current evidence references, decision, revision and stable operation', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), input);
    return ok(review);
  };
  assert.deepEqual(await api.decide(warehouse, id, id, input), review);
});
test('retries the exact decision after a lost response instead of inventing another operation', async () => {
  const commands = [];
  globalThis.fetch = async (url, options) => {
    commands.push(JSON.parse(options.body));
    if (commands.length === 1) throw new TypeError('Synthetic lost response');
    return ok(review);
  };
  await assert.rejects(api.decide(warehouse, id, id, input));
  assert.deepEqual(await api.decide(warehouse, id, id, input), review);
  assert.deepEqual(commands, [input, input]);
});
for (const [name, changes] of Object.entries({
  foreign: { asnId: warehouse },
  incomplete: { records: [{ ...state.records[0], qcState: 'PENDING' }] },
  partition: { records: [{ ...state.records[0], receivedQty: 8 }] },
  duplicate: { records: [state.records[0], state.records[0]] },
  identity: { inspectionIds: [] },
  private: { payloadHash: 'secret' },
  financial: { orderValue: '10000' },
  eligibility: { unreportedDiscrepancies: 1 },
})) {
  test(`fails closed for ${name} review state`, async () => {
    globalThis.fetch = async () => ok({ ...state, ...changes });
    await assert.rejects(api.get(warehouse, id));
  });
}
for (const [name, changes] of Object.entries({
  receipt: { receiptId: warehouse },
  decision: { decision: 'RETURN' },
  revision: { receiptVersion: 6 },
  reason: { reason: 'Different' },
  evidence: { inspectionIds: [] },
  private: { actorId: id },
  notification: { notificationState: 'SENT' },
})) {
  test(`rejects a mismatched ${name} decision response`, async () => {
    globalThis.fetch = async () => ok({ ...review, ...changes });
    await assert.rejects(api.decide(warehouse, id, id, input));
  });
}
test('validates reason, UUID uniqueness and forbids client-supplied quantities', () => {
  for (const changes of [
    { reason: '' },
    { reason: 'bad\u0000reason' },
    { inspectionIds: [line, line] },
    { acceptedQty: 7 },
    { expectedVersion: 0 },
    { discrepancyIds: null },
  ])
    assert.equal(schemas.reviewInputSchema.safeParse({ ...input, ...changes }).success, false);
});
test('allows approval of an explicitly counted zero without fake lot evidence', () => {
  assert.equal(
    schemas.reviewStateSchema.safeParse({ ...state, records: [], inspectionIds: [] }).success,
    true,
  );
});
test('only pure-platform Manager receives the review capability', () => {
  for (const role of [
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    const subject = {
      actorScope: role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
      tenantId: role.startsWith('SELLER') ? id : null,
      roles: [role],
    };
    assert.equal(
      policy.can(
        policy.getEffectiveRoles(subject.roles, subject.actorScope),
        'warehouse.asn.review',
      ),
      role === 'WAREHOUSE_MANAGER',
    );
  }
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['WAREHOUSE_MANAGER', 'SELLER_OWNER'], 'PLATFORM'),
      'warehouse.asn.review',
    ),
    false,
  );
});

test('accepts server readiness reasons and rejects leaked or unrelated blocker fields', async () => {
  const blocked = {
    ...state,
    ready: false,
    canApprove: false,
    blockers: [{ code: 'INSPECTION_REQUIRED', inboundLineId: line, receivingRecordId: line }],
  };
  globalThis.fetch = async () => ok(blocked);
  assert.deepEqual(await api.get(warehouse, id), blocked);
  for (const blocker of [
    { ...blocked.blockers[0], declaredQty: 20 },
    { ...blocked.blockers[0], receivingRecordId: warehouse },
    { ...blocked.blockers[0], code: 'INTERNAL.SQL_ERROR' },
  ]) {
    globalThis.fetch = async () => ok({ ...blocked, blockers: [blocker] });
    await assert.rejects(api.get(warehouse, id));
  }
});
test('does not accept approval readiness that contradicts server blockers', () => {
  assert.equal(
    schemas.reviewStateSchema.safeParse({
      ...state,
      blockers: [{ code: 'COUNT_REQUIRED', inboundLineId: line, receivingRecordId: null }],
    }).success,
    false,
  );
  assert.equal(schemas.reviewStateSchema.safeParse({ ...state, blockers: [] }).success, true);
});
