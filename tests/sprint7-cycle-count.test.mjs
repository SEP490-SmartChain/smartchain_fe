import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let workflows;
let can;
let store;
let wire;
let policy;
let isRouteAllowed;
let isWorkflowQuantityValid;
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
const conflict = (code = 'INVENTORY.VERSION_CONFLICT') =>
  Response.json(
    { success: false, error: { code, message: 'Synthetic version conflict' } },
    { status: 409 },
  );

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
  ({ P3_WIRE: wire } = await server.ssrLoadModule(
    '/src/features/inventory/api/p3-wire.generated.ts',
  ));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ can, isRouteAllowed } = policy);
  ({ isWorkflowQuantityValid } = await server.ssrLoadModule(
    '/src/features/inventory/components/InventoryWorkflowAction.tsx',
  ));
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

/**
 * Cross-checks a captured request body against the frozen C02 wire catalog generated from the
 * backend DTOs. The API modules are typed with those interfaces; this is the runtime proof that
 * the typed payload actually leaves the browser with exactly those fields.
 */
function wirePayloadProblems(root, payload) {
  const type = wire.types[wire.roots.requests[root]];
  assert.ok(type, `missing generated request type for ${root}`);
  const problems = [];
  for (const [key, field] of Object.entries(type.fields))
    if (!(key in payload) && !field.optional) problems.push(`${root}.${key}: required key missing`);
  for (const key of Object.keys(payload))
    if (!(key in type.fields)) problems.push(`${root}.${key}: field not in wire contract`);
  return problems;
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

test('typed count payloads match the frozen C02 request contract and responses stay Zod-validated', async () => {
  // The generated C02 artifact is the single source for the request shapes the API is typed
  // with; every count root must be present before a payload can claim to be typed against it.
  assert.deepEqual(
    {
      countPlan: wire.roots.requests.countPlan,
      countAssignment: wire.roots.requests.countAssignment,
      countObservation: wire.roots.requests.countObservation,
      countReview: wire.roots.requests.countReview,
      countCommand: wire.roots.requests.countCommand,
      countEvidence: wire.roots.requests.countEvidence,
    },
    {
      countPlan: 'CountPlanInput',
      countAssignment: 'CountAssignmentInput',
      countObservation: 'CountObservationInput',
      countReview: 'CountReviewInput',
      countCommand: 'CountCommandInput',
      countEvidence: 'CountEvidenceInput',
    },
  );

  signIn(['WAREHOUSE_MANAGER']);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url), 'http://localhost');
    calls.push({ path: parsed.pathname, body: JSON.parse(init.body) });
    if (parsed.pathname.endsWith('/assignment'))
      return ok({ id: plan, version: 2, status: 'COUNTING' });
    if (parsed.pathname.endsWith('/observation'))
      return ok({ id: plan, version: 3, status: 'REVIEW' });
    if (parsed.pathname.endsWith('/review'))
      return ok({ id: plan, version: 4, status: 'APPROVED' });
    if (parsed.pathname.endsWith('/post')) return ok({ id: plan, version: 5, status: 'POSTED' });
    return ok({ id: plan, version: 1, status: 'COUNTING', lineCount: 2 });
  };

  const planInput = {
    operationId: plan,
    binIds: [line],
    skuCodes: ['SKU-1'],
    countWindowStart: '2026-11-13T01:00:00.000Z',
    countWindowEnd: '2026-11-13T03:00:00.000Z',
    assigneeId: staff,
    reason: 'Scheduled periodic count',
  };
  assert.deepEqual(wirePayloadProblems('countPlan', planInput), []);
  const created = await workflows.createCount(wh, planInput);
  assert.equal(created.lineCount, 2);
  assert.match(calls.at(-1).path, /inventory-workflows\/counts$/);
  assert.deepEqual(calls.at(-1).body, planInput);

  const assignmentInput = {
    operationId: plan,
    expectedVersion: 1,
    assigneeId: staff,
    reason: 'Assign the blind count to the night shift',
  };
  assert.deepEqual(wirePayloadProblems('countAssignment', assignmentInput), []);
  assert.equal(
    (await workflows.command(wh, `counts/${plan}/assignment`, assignmentInput)).version,
    2,
  );
  assert.deepEqual(calls.at(-1).body, assignmentInput);

  const observationInput = {
    operationId: plan,
    expectedVersion: 2,
    lineId: line,
    observedQty: 0,
    binScan: 'A-01',
    skuScan: 'SKU-1',
    lotScan: 'LOT-1',
    evidence: { contentType: 'image/png', fileSizeBytes: 12, sha256: '0'.repeat(64) },
  };
  assert.deepEqual(wirePayloadProblems('countObservation', observationInput), []);
  assert.equal(
    wire.types.CountEvidenceInput.fields.contentType.enum.includes(
      observationInput.evidence.contentType,
    ),
    true,
  );
  assert.equal(
    (await workflows.command(wh, `counts/${plan}/observation`, observationInput)).status,
    'REVIEW',
  );
  assert.deepEqual(calls.at(-1).body, observationInput);

  const reviewInput = {
    operationId: plan,
    expectedVersion: 3,
    decision: 'APPROVE',
    reason: 'Count difference reviewed',
  };
  assert.deepEqual(wirePayloadProblems('countReview', reviewInput), []);
  assert.equal(
    (await workflows.command(wh, `counts/${plan}/review`, reviewInput)).status,
    'APPROVED',
  );
  assert.deepEqual(calls.at(-1).body, reviewInput);
  assert.equal(
    wire.types.CountReviewInput.fields.decision.enum.includes(reviewInput.decision),
    true,
  );

  const postInput = { operationId: plan, expectedVersion: 4 };
  assert.deepEqual(wirePayloadProblems('countCommand', postInput), []);
  assert.equal((await workflows.command(wh, `counts/${plan}/post`, postInput)).status, 'POSTED');
  assert.deepEqual(calls.at(-1).body, postInput);
});

test('shared disposal/putback commands keep their typed payloads after the count integration', async () => {
  signIn(['WAREHOUSE_MANAGER']);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url), 'http://localhost');
    calls.push({ path: parsed.pathname, body: JSON.parse(init.body) });
    return ok({ id: line, version: 2, status: 'REQUESTED' });
  };
  const disposalInput = {
    operationId: plan,
    stockId: line,
    qty: 2,
    reason: 'Expired stock disposal',
    authorizationMode: 'CONSENT',
  };
  assert.deepEqual(wirePayloadProblems('disposalRequest', disposalInput), []);
  assert.equal((await workflows.command(wh, 'disposals', disposalInput)).status, 'REQUESTED');
  assert.match(calls.at(-1).path, /\/inventory-workflows\/disposals$/);
  assert.deepEqual(calls.at(-1).body, disposalInput);

  const putbackInput = {
    operationId: plan,
    expectedVersion: 1,
    binScan: 'A-01',
    skuScan: 'SKU-1',
    lotScan: 'LOT-1',
  };
  assert.deepEqual(wirePayloadProblems('putbackConfirm', putbackInput), []);
  await workflows.command(wh, `putbacks/${line}/confirm`, putbackInput);
  assert.match(calls.at(-1).path, /\/putbacks\/[^/]+\/confirm$/);
  assert.deepEqual(calls.at(-1).body, putbackInput);
});

test('count action and route authority deny every role outside the Manager/Staff split', () => {
  const split = {
    'inventory.counts.view': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
    'inventory.counts.plan': ['WAREHOUSE_MANAGER'],
    'inventory.counts.observe': ['WAREHOUSE_STAFF'],
  };
  for (const role of policy.ORCA_ROLES) {
    for (const [action, allowed] of Object.entries(split))
      assert.equal(policy.can([role], action), allowed.includes(role), `${role} ${action}`);
    assert.equal(
      isRouteAllowed([role], '/warehouse/counts'),
      ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(role),
      `${role} /warehouse/counts`,
    );
  }
  // The generic workflow screen grant (and the tenant disposal screen) never becomes a count
  // mutation or a count route for Owner/Staff.
  assert.equal(can(['SELLER_OWNER'], 'inventory.workflows.view'), true);
  assert.equal(isRouteAllowed(['SELLER_OWNER'], '/warehouse/counts'), false);
  for (const action of Object.keys(split))
    assert.equal(can(['SELLER_OWNER'], action), false, `SELLER_OWNER ${action}`);
  // Unknown/mixed-scope/legacy principals fail closed for both action and route.
  for (const roles of [
    ['WAREHOUSE_MANAGER', 'SELLER_OWNER'],
    ['WAREHOUSE_STAFF', 'SELLER_STAFF'],
    ['LEGACY_SUPER_ADMIN'],
    [],
  ]) {
    for (const action of Object.keys(split))
      assert.equal(can(roles, action), false, `${JSON.stringify(roles)} ${action}`);
    assert.equal(isRouteAllowed(roles, '/warehouse/counts'), false, JSON.stringify(roles));
  }
});

test('zero is a real blind count result, not a missing observation', async () => {
  // Form rule: only blind observation accepts a physical zero; a disposal/putback movement of
  // zero units is invalid, and so is a negative or fractional physical quantity.
  assert.equal(isWorkflowQuantityValid('observe', 0, 10), true);
  assert.equal(isWorkflowQuantityValid('observe', 1, 10), true);
  assert.equal(isWorkflowQuantityValid('observe', -1, 10), false);
  assert.equal(isWorkflowQuantityValid('observe', 1.5, 10), false);
  assert.equal(isWorkflowQuantityValid('observe', 11, 10), false);
  for (const kind of ['disposalRequest', 'putbackRequest'])
    assert.equal(isWorkflowQuantityValid(kind, 0, 10), false, kind);
  assert.equal(isWorkflowQuantityValid('putbackRequest', 1, 10), true);

  signIn(['WAREHOUSE_STAFF']);
  globalThis.fetch = async () =>
    ok({
      items: [
        {
          id: plan,
          version: 1,
          status: 'COUNTING',
          reviewReason: null,
          lines: [
            {
              id: line,
              sku: 'SKU-ZERO',
              observedQty: 0,
              reviewStatus: 'PENDING',
              hasEvidence: true,
            },
            {
              id: staff,
              sku: 'SKU-UNSET',
              observedQty: null,
              reviewStatus: 'PENDING',
              hasEvidence: false,
            },
          ],
        },
      ],
      nextCursor: null,
    });
  const page = await workflows.counts(wh);
  assert.equal(page.items[0].lines[0].observedQty, 0);
  assert.notEqual(page.items[0].lines[0].observedQty, null);
  assert.equal(page.items[0].lines[1].observedQty, null);

  // Payload: a zero observation keeps the numeric zero and the response still parses.
  let observedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/observation')) observedBody = JSON.parse(init.body);
    return ok({ id: plan, version: 2, status: 'REVIEW' });
  };
  const result = await workflows.command(wh, `counts/${plan}/observation`, {
    operationId: plan,
    expectedVersion: 1,
    lineId: line,
    observedQty: 0,
    binScan: 'A-01',
    skuScan: 'SKU-ZERO',
    lotScan: 'LOT-1',
    evidence: { contentType: 'image/jpeg', fileSizeBytes: 12, sha256: '1'.repeat(64) },
  });
  assert.equal(Object.hasOwn(observedBody, 'observedQty'), true);
  assert.equal(observedBody.observedQty, 0);
  assert.equal(result.status, 'REVIEW');
});

test('an unknown count outcome retries the same operationId and expectedVersion', async () => {
  signIn(['WAREHOUSE_MANAGER']);
  const bodies = [];
  let attempt = 0;
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    attempt += 1;
    return attempt === 1 ? conflict() : ok({ id: plan, version: 4, status: 'POSTED' });
  };
  const input = { operationId: plan, expectedVersion: 3 };
  assert.deepEqual(wirePayloadProblems('countCommand', input), []);
  await assert.rejects(workflows.command(wh, `counts/${plan}/post`, input), (failure) => {
    assert.equal(failure.status, 409);
    assert.equal(failure.code, 'INVENTORY.VERSION_CONFLICT');
    return true;
  });
  const retried = await workflows.command(wh, `counts/${plan}/post`, input);
  // The server response version is not promoted into the operation key or the retry version.
  assert.equal(retried.version, 4);
  assert.deepEqual(bodies, [input, input]);
});

test('in-flight count responses and evidence URLs from a previous auth scope are discarded', async () => {
  signIn(['WAREHOUSE_MANAGER']);
  globalThis.fetch = async () => {
    store.setState({ revision: store.getState().revision + 1 });
    return ok({ items: [], nextCursor: null });
  };
  await assert.rejects(workflows.counts(wh), { code: 'AUTH.SCOPE_CHANGED' });

  // The signed evidence upload must never start once the auth scope changed while the digest
  // request was in flight.
  let signedUploads = 0;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://private.example.test')) {
      signedUploads += 1;
      return new Response('', { status: 200 });
    }
    store.setState({ revision: store.getState().revision + 1 });
    return ok({
      method: 'PUT',
      uploadUrl: 'https://private.example.test/evidence',
      expiresInSeconds: 60,
      headers: { 'content-type': 'image/png' },
    });
  };
  await assert.rejects(
    workflows.evidence(
      wh,
      `counts/${plan}/evidence?lineId=${line}`,
      new File([new Uint8Array(32)], 'evidence.png', { type: 'image/png' }),
    ),
    { code: 'AUTH.SCOPE_CHANGED' },
  );
  assert.equal(signedUploads, 0);

  globalThis.fetch = async () => {
    store.setState({ revision: store.getState().revision + 1 });
    return ok({ downloadUrl: 'https://private.example.test/photo', expiresInSeconds: 60 });
  };
  await assert.rejects(workflows.download(wh, 'counts', line), { code: 'AUTH.SCOPE_CHANGED' });
});
