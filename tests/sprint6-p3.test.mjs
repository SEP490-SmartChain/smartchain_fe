import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, returns, trace, store, schemas, policy;
const originalFetch = globalThis.fetch,
  id = '10280000-0000-4000-8000-000000000001',
  wh = '10280000-0000-4000-8000-000000000002';
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-10-28T00:00:00Z', path: '', requestId: 'synthetic' },
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
  ({ returnWorkflowApi: returns } = await server.ssrLoadModule(
    '/src/features/inventory/api/returnWorkflowApi.ts',
  ));
  trace = await server.ssrLoadModule('/src/features/inventory/api/lotTraceApi.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  schemas = await server.ssrLoadModule('/src/features/inventory/schemas/returnWorkflowSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  store.getState().setSession({
    accessToken: 'synthetic-p3-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
const line = {
  id,
  sourceId: id,
  lotId: id,
  sku: 'SYNTHETIC',
  lotCode: 'LOT',
  requestedQty: 2,
  receivedQty: 0,
  restockedQty: 0,
  quarantinedQty: 0,
  classification: 'PENDING',
  reviewed: false,
  hasEvidence: false,
  targetStockId: null,
  reviewReason: null,
};
const header = {
  id,
  version: 1,
  fulfillmentOrderId: id,
  kind: 'POST_DELIVERY',
  status: 'REQUESTED',
  reason: 'Synthetic return',
  requestedAt: '2026-10-28T00:00:00Z',
  arrivedAt: null,
  inspectionDueAt: null,
  inspectionOverdue: false,
  reverseBookingState: null,
  reverseTrackingNumber: null,
  reverseShipmentStatus: null,
  warehouseNoticeStatus: null,
  lines: [line],
};
test('return queue validates nullable reverse status and rejects unapproved private fields', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), new RegExp(`/warehouses/${wh}/returns`));
    return ok({ items: [header], nextCursor: id });
  };
  const page = await returns.list(wh);
  assert.equal(page.nextCursor, id);
  assert.equal(page.items[0].arrivedAt, null);
  assert.equal(page.items[0].lines[0].restockedQty, 0);
  globalThis.fetch = async () =>
    ok({ items: [{ ...header, codAmount: '1000' }], nextCursor: null });
  await assert.rejects(returns.list(wh));
  globalThis.fetch = async () =>
    ok({ items: [{ ...header, lines: [{ ...line, phone: '0000000000' }] }], nextCursor: null });
  await assert.rejects(returns.list(wh));
});
test('mutations preserve the same operation reference, expected version and original line across retry', async () => {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), new RegExp(`/returns/${id}/arrival`));
    sent.push(JSON.parse(init.body));
    return ok({ id, version: 3, status: 'ARRIVED' });
  };
  const input = { operationId: id, expectedVersion: 2, parcelScan: id };
  await returns.command(wh, `${id}/arrival`, input);
  await returns.command(wh, `${id}/arrival`, input);
  assert.deepEqual(sent, [input, input]);
});
test('return evidence uses its own signed endpoint and uploads bytes without application credentials', async () => {
  let signed = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://private.example.test')) {
      assert.equal(init.credentials, 'omit');
      assert.equal(init.redirect, 'error');
      assert.equal(new Headers(init.headers).has('authorization'), false);
      assert.equal(init.body.size, 32);
      return new Response('', { status: 200 });
    }
    assert.match(String(url), new RegExp(`/returns/${id}/lines/${id}/evidence`));
    assert.equal(JSON.parse(init.body).fileSizeBytes, 32);
    signed = true;
    return ok({
      method: 'PUT',
      uploadUrl: 'https://private.example.test/evidence',
      headers: { 'content-type': 'image/png' },
      expiresInSeconds: 60,
    });
  };
  const e = await returns.evidence(
    wh,
    id,
    id,
    new File([new Uint8Array(32)], 'proof.png', { type: 'image/png' }),
  );
  assert.equal(signed, true);
  assert.match(e.sha256, /^[0-9a-f]{64}$/);
});
test('private evidence never opens after session scope changes during a read', async () => {
  globalThis.fetch = async () => {
    store.setState({ revision: store.getState().revision + 1 });
    return ok({ downloadUrl: 'https://private.example.test/photo', expiresInSeconds: 60 });
  };
  await assert.rejects(returns.download(wh, id, id), { code: 'AUTH.SCOPE_CHANGED' });
});
test('return form requires a real pickup and a positive bounded physical quantity', () => {
  const input = {
    sourceId: id,
    qty: 1,
    reason: 'Synthetic return',
    name: 'Synthetic',
    phone: '0000000000',
    address: 'Synthetic address',
    provinceCode: '01',
    wardCode: '00001',
  };
  assert.equal(schemas.returnRequestSchema.safeParse(input).success, true);
  for (const override of [
    { qty: 0 },
    { qty: 1.5 },
    { sourceId: 'unknown' },
    { phone: '' },
    { reason: 'x' },
  ])
    assert.equal(schemas.returnRequestSchema.safeParse({ ...input, ...override }).success, false);
});
test('affected recipient CSV escapes formulas, quotes and newlines without exposing full contact fields', () => {
  const csv = trace.recallCsv([
    { id, orderId: id, parcelId: id, name: ' =HYPERLINK("bad")', phone: '***123', qty: 2 },
  ]);
  assert.match(csv, /"' =HYPERLINK\(""bad""\)"/);
  assert.match(csv, /\*\*\*123/);
  assert.equal(csv.split('\r\n').length, 2);
});
test('recall uses the original lot version and returns physical recovery counts', async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), new RegExp(`/trace/lots/${id}/recall`));
    assert.deepEqual(JSON.parse(init.body), {
      operationId: id,
      expectedVersion: 4,
      reason: 'Synthetic recall',
    });
    return ok({
      id,
      version: 5,
      status: 'RECALLED',
      releasedQty: 3,
      reallocatedQty: 2,
      recoveryCount: 1,
    });
  };
  assert.equal(
    (
      await trace.lotTraceApi.recall(wh, id, {
        operationId: id,
        expectedVersion: 4,
        reason: 'Synthetic recall',
      })
    ).recoveryCount,
    1,
  );
});
test('P3 action policy separates Owner, Ops, inspector and independent Manager', () => {
  const expected = {
    'returns.request': ['SELLER_OWNER', 'OPS_DISPATCHER'],
    'returns.authorize': ['OPS_DISPATCHER'],
    'returns.receive': ['WAREHOUSE_STAFF'],
    'returns.inspect': ['WAREHOUSE_STAFF'],
    'returns.review': ['WAREHOUSE_MANAGER'],
    'returns.restock': ['WAREHOUSE_STAFF'],
    'inventory.trace.forward': ['OPS_DISPATCHER'],
    'inventory.trace': ['OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
    'inventory.recall': ['OPS_DISPATCHER'],
  };
  for (const role of policy.ORCA_ROLES)
    for (const [action, allowed] of Object.entries(expected))
      assert.equal(policy.can([role], action), allowed.includes(role), `${role} ${action}`);
  for (const roles of [['SELLER_OWNER', 'WAREHOUSE_STAFF'], ['LEGACY'], []])
    assert.deepEqual(policy.getEffectiveRoles(roles, 'PLATFORM'), []);
});
test('return and trace translations have matching keys and ICU placeholders in both languages', () => {
  const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')),
    vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
  for (const key of ['Returns', 'LotTrace']) {
    assert.deepEqual(Object.keys(en[key]).sort(), Object.keys(vi[key]).sort());
    for (const name of Object.keys(en[key]))
      assert.deepEqual(
        en[key][name].match(/\{\w+\}/g) ?? [],
        vi[key][name].match(/\{\w+\}/g) ?? [],
      );
  }
});

test('reverse authorization measurements are bounded and notification uses only server-selected recipients', async () => {
  assert.equal(
    schemas.reverseParcelSchema.safeParse({ weightG: 500, lengthCm: 10, widthCm: 10, heightCm: 10 })
      .success,
    true,
  );
  for (const value of [
    { weightG: 0, lengthCm: 10, widthCm: 10, heightCm: 10 },
    { weightG: 500, lengthCm: 201, widthCm: 10, heightCm: 10 },
  ])
    assert.equal(schemas.reverseParcelSchema.safeParse(value).success, false);
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), body: JSON.parse(init.body) };
    return ok({ queued: 1, examined: 1, nextCursor: null });
  };
  const command = { operationId: id, expectedVersion: 2 };
  assert.equal((await trace.lotTraceApi.notify(wh, id, command)).queued, 1);
  assert.equal(captured.url.endsWith(`/lots/${id}/notifications`), true);
  assert.deepEqual(captured.body, command);
});
