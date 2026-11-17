import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, workflows, reports, store;
const originalFetch = globalThis.fetch;
const id = '10250000-0000-4000-8000-000000000001';
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-28T00:00:00Z',
      path: '',
      requestId: 'synthetic',
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
  ({ inventoryWorkflowApi: workflows } = await server.ssrLoadModule(
    '/src/features/inventory/api/inventoryWorkflowApi.ts',
  ));
  ({ webhookReportApi: reports } = await server.ssrLoadModule(
    '/src/features/analytics/api/webhookReportApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  store.getState().setSession({
    accessToken: 'synthetic-s5-token',
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
test('blind count API preserves pagination and refuses unexpected private fields', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), new RegExp(`/warehouses/${id}/inventory-workflows/counts`));
    return ok({
      items: [
        {
          id,
          version: 1,
          status: 'PLANNED',
          reviewReason: null,
          lines: [
            {
              id,
              sku: 'SKU',
              lotCode: 'LOT',
              binCode: 'A1',
              observedQty: null,
              reviewStatus: 'PENDING',
              hasEvidence: false,
            },
          ],
        },
      ],
      nextCursor: id,
    });
  };
  const page = await workflows.counts(id);
  assert.equal(page.nextCursor, id);
  assert.equal(Object.hasOwn(page.items[0].lines[0], 'expectedQty'), false);
  globalThis.fetch = async () =>
    ok({
      items: [{ id, version: 1, status: 'PLANNED', reviewReason: null, lines: [], secret: 'no' }],
      nextCursor: null,
    });
  await assert.rejects(workflows.counts(id));
});
test('count plan projections accept deployed metadata without weakening strict field validation', async () => {
  const line = {
    id,
    sku: 'SKU',
    lotCode: 'LOT',
    binCode: 'A1',
    observedQty: null,
    reviewStatus: 'PENDING',
    hasEvidence: false,
  };
  const plan = {
    id,
    version: 1,
    status: 'PLANNED',
    reviewReason: null,
    round: 1,
    createReason: 'Monthly count',
    countWindowStart: null,
    countWindowEnd: null,
    snapshotAt: '2026-11-05T00:00:00.000Z',
    assignedToPlatformUserId: id,
    lines: [line],
  };
  globalThis.fetch = async () => ok({ items: [plan], nextCursor: null });
  const staff = await workflows.counts(id);
  assert.equal(staff.items[0].round, 1);
  assert.equal(Object.hasOwn(staff.items[0].lines[0], 'expectedQty'), false);
  globalThis.fetch = async () =>
    ok({
      items: [
        {
          ...plan,
          lines: [{ ...line, expectedQty: 10, varianceQty: null, variancePercent: null }],
        },
      ],
      nextCursor: null,
    });
  assert.equal((await workflows.counts(id)).items[0].lines[0].expectedQty, 10);
  globalThis.fetch = async () =>
    ok({ items: [{ ...plan, lines: [{ ...line, codAmount: '100' }] }], nextCursor: null });
  await assert.rejects(workflows.counts(id));
});
test('workflow retries send the exact durable reference and version', async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /counts\/.*\/post/);
    bodies.push(JSON.parse(init.body));
    return ok({ id, version: 4, status: 'POSTED' });
  };
  const body = { operationId: id, expectedVersion: 3 };
  await workflows.command(id, `counts/${id}/post`, body);
  await workflows.command(id, `counts/${id}/post`, body);
  assert.deepEqual(bodies, [body, body]);
});
test('evidence validates format/size before signing and uploads only checksum-bound bytes', async () => {
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests++;
    if (String(url).startsWith('https://private.example.test')) {
      assert.equal(init.credentials, 'omit');
      assert.equal(init.method, 'PUT');
      assert.equal(init.body.size, 32);
      return new Response('', { status: 200 });
    }
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.match(body.sha256, /^[a-f0-9]{64}$/);
    assert.equal(body.fileSizeBytes, 32);
    return ok({
      method: 'PUT',
      uploadUrl: 'https://private.example.test/immutable',
      expiresInSeconds: 60,
      headers: { 'content-type': 'image/png' },
    });
  };
  await assert.rejects(
    workflows.evidence(
      id,
      `disposals/${id}/evidence`,
      new File(['small'], 'test.txt', { type: 'text/plain' }),
    ),
  );
  assert.equal(requests, 0);
  const data = await workflows.evidence(
    id,
    `disposals/${id}/evidence`,
    new File([new Uint8Array(32)], 'evidence.png', { type: 'image/png' }),
  );
  assert.equal(data.sha256, '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925');
  assert.equal(requests, 2);
});
test('webhook report reads period totals plus filtered metadata without losing exact counts', async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url), 'http://localhost');
    paths.push(parsed);
    return parsed.pathname.endsWith('/summary')
      ? ok({
          from: '2026-10-01',
          to: '2026-10-28',
          total: '9007199254740993',
          counts: { PENDING: '9007199254740993', DELIVERED: '0', FAILED: '0', EXHAUSTED: '0' },
        })
      : ok([], { limit: 50, hasNext: false, nextCursor: null });
  };
  const result = await reports.read({ from: '2026-10-01', to: '2026-10-28', status: 'FAILED' });
  assert.equal(result.summary.total, '9007199254740993');
  assert.equal(
    paths.find((p) => !p.pathname.endsWith('summary')).searchParams.get('status'),
    'FAILED',
  );
  assert.equal(paths.find((p) => p.pathname.endsWith('summary')).searchParams.has('status'), false);
});
test('webhook report rejects invalid ranges before requesting data', async () => {
  globalThis.fetch = async () => {
    throw new Error('Unexpected network');
  };
  await assert.rejects(reports.read({ from: '2026-10-28', to: '2026-10-01', status: '' }));
  await assert.rejects(reports.read({ from: '2026-01-01', to: '2026-10-28', status: '' }));
});
