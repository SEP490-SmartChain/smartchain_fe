import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, schemas, store, presentation;
const originalFetch = globalThis.fetch;
const id = '10290000-0000-4000-8000-000000000001';
const filters = {
  from: '2026-10-01',
  to: '2026-10-22',
  warehouseId: '',
  actorId: '',
  action: '',
  entityId: '',
  kind: '',
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-22T00:00:00Z',
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
  ({ reportApi: api } = await server.ssrLoadModule('/src/features/analytics/api/reportApi.ts'));
  schemas = await server.ssrLoadModule('/src/features/analytics/schemas/reportSchema.ts');
  presentation = await server.ssrLoadModule('/src/features/analytics/lib/reportPresentation.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: id,
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
    },
  });
});
test('report API uses GET, keeps warehouse as a filter and forwards cancellation', async () => {
  const abort = new AbortController();
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return ok({
      schemaVersion: 1,
      kind: 'seller',
      generatedAt: '2026-10-22T00:00:00Z',
      from: filters.from,
      to: filters.to,
      timezone: 'Asia/Ho_Chi_Minh',
      sections: [],
    });
  };
  await api.read('seller', { ...filters, warehouseId: id }, abort.signal);
  assert.match(captured.url, /\/v1\/reports\/seller\?/);
  assert.match(captured.url, /warehouseId=/);
  assert.doesNotMatch(captured.url, /tenantId=/);
  assert.equal(captured.init.signal, abort.signal);
  assert.equal(captured.init.method, 'GET');
});
test('VND and missing measurements remain exact strings and null', () => {
  const value = schemas.reportSchema.parse({
    schemaVersion: 1,
    kind: 'finance',
    generatedAt: '2026-10-22T00:00:00Z',
    from: filters.from,
    to: filters.to,
    timezone: 'Asia/Ho_Chi_Minh',
    sections: [
      {
        id: 'fees',
        status: 'PARTIAL',
        metrics: [
          { key: 'serviceFees', value: '9007199254740993', unit: 'VND', basis: 'events' },
          { key: 'actualMargin', value: null, unit: 'VND', basis: 'missing_actuals' },
        ],
      },
    ],
  });
  assert.equal(value.sections[0].metrics[0].value, '9007199254740993');
  assert.equal(value.sections[0].metrics[1].value, null);
  assert.equal(
    schemas.reportSchema.safeParse({
      ...value,
      sections: [
        { ...value.sections[0], metrics: [{ key: 'fee', value: 123, unit: 'VND', basis: 'bad' }] },
      ],
    }).success,
    false,
  );
});
test('unknown report kinds and malformed filtering are rejected', () => {
  assert.equal(schemas.reportKindSchema.safeParse('secret-admin').success, false);
  assert.equal(
    schemas.reportFilterSchema.safeParse({ ...filters, from: '2026-10-23' }).success,
    false,
  );
  assert.equal(
    schemas.reportFilterSchema.safeParse({ ...filters, actorId: 'unbounded-input' }).success,
    false,
  );
});
test('audit and technical requests only send their permitted filter fields', async () => {
  let url = '';
  globalThis.fetch = async (input) => {
    url = String(input);
    return ok([], { limit: 50, hasNext: false, nextCursor: null });
  };
  await api.logs(
    'audit',
    { ...filters, warehouseId: id, actorId: id, action: 'TARIFF_CHANGED', kind: 'SCAN' },
    '0123456789abcdef01234567',
  );
  assert.match(url, /action=TARIFF_CHANGED/);
  assert.doesNotMatch(url, /warehouseId=|kind=/);
  await api.logs('logs', {
    ...filters,
    warehouseId: id,
    actorId: id,
    action: 'ignored',
    entityId: id,
    kind: 'SCAN',
  });
  assert.match(url, /warehouseId=/);
  assert.match(url, /kind=SCAN/);
  assert.doesNotMatch(url, /action=|entityId=/);
});

test('a report response for another view is rejected instead of rendered', async () => {
  globalThis.fetch = async () =>
    ok({
      schemaVersion: 1,
      kind: 'finance',
      generatedAt: '2026-10-22T00:00:00Z',
      from: filters.from,
      to: filters.to,
      timezone: 'Asia/Ho_Chi_Minh',
      sections: [],
    });
  await assert.rejects(api.read('seller', filters));
});
test('per-view warehouse requirements and masked webhook evidence are validated', () => {
  const result = schemas.optionsSchema.parse({
    views: ['warehouse', 'audit'],
    warehouses: [],
    warehouseRequired: false,
    warehouseRequiredViews: ['warehouse'],
  });
  assert.deepEqual(result.warehouseRequiredViews, ['warehouse']);
  assert.equal(
    schemas.optionsSchema.safeParse({ ...result, warehouseRequiredViews: ['unknown-admin-view'] })
      .success,
    false,
  );
});

test('headline metrics cannot synthesize a financial field missing from the Staff response', () => {
  const metric = (key, value, unit = 'count') => ({ key, value, unit, basis: 'recorded' });
  const report = {
    kind: 'seller',
    sections: [
      { id: 'orders', status: 'AVAILABLE', metrics: [metric('orders', '2')] },
      {
        id: 'stock',
        status: 'AVAILABLE',
        metrics: [metric('onHand', '100'), metric('nearExpiry', '8'), metric('physicalFree', '70')],
      },
    ],
  };
  assert.deepEqual(
    presentation.headlineMetrics(report).map((row) => row.key),
    ['orders', 'onHand', 'physicalFree', 'nearExpiry'],
  );
  const owner = {
    ...report,
    sections: [
      ...report.sections,
      { id: 'fees', metrics: [metric('serviceFees', '9007199254740993', 'VND')] },
    ],
  };
  assert.equal(presentation.headlineMetrics(owner).at(-1).value, '9007199254740993');
});

test('dashboard formatting preserves exact money, genuine zero and unavailable values', () => {
  assert.equal(
    presentation.formatReportValue('9007199254740993', 'en', 'VND'),
    '9,007,199,254,740,993 VND',
  );
  assert.equal(
    presentation.formatReportValue('-9007199254740993', 'vi', 'VND'),
    '-9.007.199.254.740.993 VND',
  );
  assert.equal(presentation.formatReportValue(null, 'vi', 'VND'), '—');
  assert.equal(presentation.formatReportValue('0', 'en'), '0');
  assert.equal(presentation.formatReportValue('33.33', 'en', 'percent'), '33.33%');
  assert.equal(presentation.barPercent('9007199254740993', BigInt('9007199254740993')), 100);
  assert.equal(presentation.barPercent('0', BigInt('0')), 0);
  assert.equal(presentation.barPercent('-5', BigInt('10')), 0);
});

test('carrier presentation aggregates returned statuses exactly without guessing carrier identities', () => {
  const first = '10000000-0000-4000-8000-000000000001';
  const second = '10000000-0000-4000-8000-000000000002';
  const result = presentation.carrierBreakdown([
    { key: first + ':DELIVERED', value: '9007199254740993' },
    { key: first + ':IN_TRANSIT', value: '1' },
    { key: second + ':DELIVERED', value: '5' },
    { key: second + ':FAILED', value: '1' },
  ]);
  assert.equal(result.carriers.length, 2);
  assert.equal(result.carriers[0].id, first);
  assert.equal(result.carriers[0].total.toString(), '9007199254740994');
  assert.equal(result.groups.find((row) => row.key === 'DELIVERED').value, '9007199254740998');
  assert.equal('name' in result.carriers[0], false);
  assert.equal(
    presentation.carrierBreakdown([{ key: 'not-a-carrier:DELIVERED', value: '5' }]),
    null,
  );
  assert.equal(presentation.carrierBreakdown([{ key: first + ':FAILED', value: '-1' }]), null);
  assert.deepEqual(presentation.carrierBreakdown([]), { carriers: [], groups: [] });
});

test('carrier status colors communicate delivered, in-progress, failure and unknown separately', () => {
  assert.equal(presentation.reportTone('DELIVERED'), 'teal');
  assert.equal(presentation.reportTone('IN_TRANSIT'), 'blue');
  assert.equal(presentation.reportTone('FAILED'), 'red');
  assert.equal(presentation.reportTone('RETURNED'), 'amber');
  assert.equal(presentation.reportTone('UNKNOWN'), 'amber');
  assert.equal(presentation.reportTone('CANCELLED'), 'muted');
});

test('a booked freight price snapshot is a period metric, not current stock', () => {
  const metric = {
    key: 'sellerFreight',
    value: '900000',
    unit: 'VND',
    basis: 'seller_freight_snapshot_booked_cohort',
  };
  assert.equal(presentation.metricContextKey(metric, 'finance'), 'selectedPeriod');
  assert.equal(
    presentation.metricContextKey({ ...metric, basis: 'current_physical_snapshot' }, 'seller'),
    'currentStock',
  );
  assert.equal(presentation.metricContextKey({ ...metric, value: null }, 'finance'), 'notMeasured');
  assert.equal(
    presentation.metricContextKey(
      { ...metric, basis: 'recorded_job_execution_dlq_in_24h_not_live_queue' },
      'health',
    ),
    'last24Hours',
  );
});

test('carrier comparisons keep a consistent status order without changing cohort counts', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const data = presentation.carrierBreakdown([
    { key: id + ':FAILED', value: '2' },
    { key: id + ':RETURNED', value: '1' },
    { key: id + ':IN_TRANSIT', value: '3' },
    { key: id + ':DELIVERED', value: '14' },
  ]);
  assert.deepEqual(
    data.groups.map((row) => row.key),
    ['DELIVERED', 'IN_TRANSIT', 'RETURNED', 'FAILED'],
  );
  assert.deepEqual(
    data.carriers[0].groups.map((row) => row.key),
    ['DELIVERED', 'IN_TRANSIT', 'RETURNED', 'FAILED'],
  );
  assert.equal(data.carriers[0].total.toString(), '20');
  assert.equal(data.groups.find((row) => row.key === 'FAILED').value, '2');
});
