import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let workflows;
let can;
let store;
const originalFetch = globalThis.fetch;
const wh = '10250000-0000-4000-8000-000000000001';
const plan = '10250000-0000-4000-8000-000000000002';
const line = '10250000-0000-4000-8000-000000000003';
const staff = '10250000-0000-4000-8000-000000000004';
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-11-03T00:00:00Z', path: '', requestId: 'synthetic' },
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
  ({ inventoryWorkflowApi: workflows } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryWorkflowApi.ts',
  ));
  ({ can } = await server.ssrLoadModule('/src/lib/accessPolicy.ts'));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

function signIn(roles) {
  store.getState().setSession({
    accessToken: 'synthetic-s7-token',
    expiresIn: 900,
    user: {
      userId: staff,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles,
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
    },
  });
}

test('count options and plan creation use the narrow Manager endpoints', async () => {
  signIn(['WAREHOUSE_MANAGER']);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url), 'http://localhost');
    calls.push({ path: parsed.pathname, method: init?.method ?? 'GET', body: init?.body });
    if (parsed.pathname.endsWith('/counts/options'))
      return ok({
        bins: [{ id: line, code: 'A-01', barcode: null }],
        staff: [{ id: staff, fullName: 'Synthetic Staff' }],
        skuCodes: ['SKU-1'],
      });
    return ok({ id: plan, version: 1, status: 'PLANNED', lineCount: 1 });
  };
  const options = await workflows.countOptions(wh);
  assert.deepEqual(options.staff, [{ id: staff, fullName: 'Synthetic Staff' }]);
  const created = await workflows.createCount(wh, {
    operationId: plan,
    binIds: [line],
    assigneeId: staff,
    reason: 'Scheduled periodic count',
  });
  assert.equal(created.lineCount, 1);
  const post = calls.find((c) => c.method === 'POST');
  assert.match(post.path, /inventory-workflows\/counts$/);
  assert.deepEqual(JSON.parse(post.body).binIds, [line]);
});

test('Manager payload with the real line variancePercent parses; Staff never receives it', async () => {
  // CR-04: this is the exact shape the inventory service returns for a Manager projection.
  const managerPayload = {
    items: [
      {
        id: plan,
        version: 3,
        status: 'REVIEW',
        reviewReason: 'Verified physical count',
        round: 1,
        snapshotAt: '2026-11-03T00:00:00.000Z',
        assignedToPlatformUserId: staff,
        createReason: 'Scheduled periodic count',
        countWindowStart: null,
        countWindowEnd: null,
        lines: [
          {
            id: line,
            sku: 'SKU-1',
            observedQty: 9,
            reviewStatus: 'PENDING',
            hasEvidence: true,
            expectedQty: 12,
            varianceQty: -3,
            variancePercent: -25,
          },
          {
            id: line,
            sku: 'SKU-ZERO',
            observedQty: 2,
            reviewStatus: 'PENDING',
            hasEvidence: true,
            expectedQty: 0,
            varianceQty: 2,
            variancePercent: null,
          },
        ],
      },
    ],
    nextCursor: null,
  };
  signIn(['WAREHOUSE_MANAGER']);
  globalThis.fetch = async () => ok(managerPayload);
  const page = await workflows.counts(wh);
  assert.equal(page.items[0].lines[0].variancePercent, -25);
  assert.equal(page.items[0].lines[1].variancePercent, null);

  // Staff projection must not carry the snapshot at all, and the strict schema must reject any
  // payload that leaks expected/variance/money/contact into a blind count.
  signIn(['WAREHOUSE_STAFF']);
  const staffPayload = {
    items: [
      {
        id: plan,
        version: 1,
        status: 'PLANNED',
        reviewReason: null,
        lines: [
          {
            id: line,
            sku: 'SKU-1',
            observedQty: null,
            reviewStatus: 'PENDING',
            hasEvidence: false,
          },
        ],
      },
    ],
    nextCursor: null,
  };
  globalThis.fetch = async () => ok(staffPayload);
  const blind = await workflows.counts(wh);
  const blindLine = blind.items[0].lines[0];
  for (const forbidden of ['expectedQty', 'varianceQty', 'variancePercent'])
    assert.equal(
      Object.hasOwn(blindLine, forbidden),
      false,
      `blind projection must not expose ${forbidden}`,
    );

  // `expectedQty`/`varianceQty` stay optional in the shared schema because the Manager projection
  // really carries them (the backend integration test asserts the blind projection omits them).
  // What the FE must reject outright is anything financial, contact or ledger-private on a line.
  for (const leaked of ['unitCostVnd', 'recipientPhone', 'ledgerPayload', 'sellerApiKey']) {
    const line = { ...staffPayload.items[0].lines[0], [leaked]: 'x' };
    globalThis.fetch = async () =>
      ok({ ...staffPayload, items: [{ ...staffPayload.items[0], lines: [line] }] });
    await assert.rejects(workflows.counts(wh), `${leaked} must be rejected`);
  }
});

test('count options require the staff array contract, not a destructured object', async () => {
  signIn(['WAREHOUSE_MANAGER']);
  globalThis.fetch = async () =>
    ok({ bins: [], staff: { id: staff, fullName: 'Synthetic Staff' }, skuCodes: [] });
  await assert.rejects(workflows.countOptions(wh));
  globalThis.fetch = async () => ok({ bins: [], staff: [], skuCodes: [] });
  assert.deepEqual((await workflows.countOptions(wh)).staff, []);
  globalThis.fetch = async () =>
    ok({ bins: [], staff: [{ id: staff, fullName: 'Synthetic Staff' }], skuCodes: ['SKU-1'] });
  assert.deepEqual((await workflows.countOptions(wh)).staff, [
    { id: staff, fullName: 'Synthetic Staff' },
  ]);
});

test('observation carries the scanned bin, SKU and lot with the durable reference', async () => {
  signIn(['WAREHOUSE_STAFF']);
  let body;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/observation')) body = JSON.parse(init.body);
    return ok({ id: plan, version: 2, status: 'REVIEW' });
  };
  await workflows.command(wh, `counts/${plan}/observation`, {
    operationId: plan,
    expectedVersion: 1,
    lineId: line,
    observedQty: 0,
    binScan: 'A-01',
    skuScan: 'SKU-1',
    lotScan: 'LOT-1',
  });
  assert.deepEqual(
    {
      binScan: body.binScan,
      skuScan: body.skuScan,
      lotScan: body.lotScan,
      observedQty: body.observedQty,
      expectedVersion: body.expectedVersion,
      operationId: body.operationId,
    },
    {
      binScan: 'A-01',
      skuScan: 'SKU-1',
      lotScan: 'LOT-1',
      observedQty: 0,
      expectedVersion: 1,
      operationId: plan,
    },
  );
});

test('plan and post capability stay with the Manager; Staff keep blind observation only', () => {
  const roles = (list) => list;
  assert.equal(can(roles(['WAREHOUSE_MANAGER']), 'inventory.counts.plan'), true);
  assert.equal(can(roles(['WAREHOUSE_MANAGER']), 'inventory.counts.observe'), false);
  assert.equal(can(roles(['WAREHOUSE_STAFF']), 'inventory.counts.observe'), true);
  assert.equal(can(roles(['WAREHOUSE_STAFF']), 'inventory.counts.plan'), false);
  assert.equal(can(roles(['WAREHOUSE_STAFF']), 'inventory.counts.view'), true);
  assert.equal(
    can(roles(['WAREHOUSE_STAFF']), 'inventory.workflows.view'),
    true,
    'the screen grant never substitutes for the count mutation authority',
  );
  assert.equal(can(roles(['SELLER_OWNER']), 'inventory.counts.plan'), false);
  assert.equal(can(roles(['SELLER_OWNER']), 'inventory.counts.view'), false);
  assert.equal(can(roles(['ORCA_ADMIN']), 'inventory.counts.plan'), false);
  // Mixed/legacy scopes never union into a count authority.
  assert.equal(can(['WAREHOUSE_MANAGER', 'SELLER_OWNER'], 'inventory.counts.plan'), false);
});
