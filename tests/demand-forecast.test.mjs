import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let demandForecastApi;
let canRetryForecast;
let summary;
let ApiError;
let useAuthStore;
const originalFetch = globalThis.fetch;
const owner = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'owner@example.test',
  fullName: 'Owner',
  roles: ['SELLER_OWNER'],
  actorScope: 'TENANT',
  permissions: [],
};
const jobId = '00000000-0000-4000-8000-000000000010';
const run = {
  jobId,
  productId: '00000000-0000-4000-8000-000000000020',
  region: 'NORTH',
  status: 'FAILED',
  attempts: 1,
  forecastStartDate: '2026-11-01',
  createdAt: '2026-11-01T01:00:00.000Z',
  result: null,
};
const meta = { timestamp: '2026-11-01T01:00:00.000Z', path: '', requestId: 'test' };
const ok = (data) => Response.json({ success: true, data, meta }, { status: 202 });
const fail = (statusCode, code) =>
  Response.json(
    { success: false, error: { code, message: 'Request failed', statusCode }, meta },
    { status: statusCode },
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
  ({ demandForecastApi, canRetryForecast } = await server.ssrLoadModule(
    '/src/features/inventory/api/demandForecastApi.ts',
  ));
  summary = await server.ssrLoadModule('/src/features/inventory/lib/demandForecastSummary.ts');
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ accessToken: 'owner-token', expiresIn: 900, user: owner });
});

test('retry posts to the run retry action and parses the re-queued run', async () => {
  const requeued = {
    ...run,
    jobId: '00000000-0000-4000-8000-000000000011',
    status: 'QUEUED',
    attempts: 2,
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url, 'https://app.example.test').pathname,
      `/api/v1/inventory/demand-forecasts/${jobId}/retry`,
    );
    assert.equal(options.method, 'POST');
    return ok(requeued);
  };

  const result = await demandForecastApi.retry(jobId, new AbortController().signal);

  assert.deepEqual(result, requeued);
});

test('retry surfaces the stable retry-limit error code', async () => {
  globalThis.fetch = async () => fail(429, 'INVENTORY.FORECAST_RETRY_LIMIT');

  await assert.rejects(
    () => demandForecastApi.retry(jobId, new AbortController().signal),
    (error) => error instanceof ApiError && error.code === 'INVENTORY.FORECAST_RETRY_LIMIT',
  );
});

test('run payload without attempts is rejected', async () => {
  const { attempts: _attempts, ...legacy } = run;
  globalThis.fetch = async () => ok(legacy);

  await assert.rejects(() => demandForecastApi.get(jobId, new AbortController().signal));
});

test('only failed or provider-unavailable runs with attempts left can be retried', () => {
  assert.equal(canRetryForecast(run), true);
  assert.equal(canRetryForecast({ ...run, status: 'PROVIDER_UNAVAILABLE', attempts: 2 }), true);
  assert.equal(canRetryForecast({ ...run, attempts: 3 }), false);
  assert.equal(canRetryForecast({ ...run, status: 'PREDICTED' }), false);
  assert.equal(canRetryForecast({ ...run, status: 'QUEUED' }), false);
  assert.equal(canRetryForecast(null), false);
});

const day = (offset) => new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);
const points = (from, length, units) =>
  Array.from({ length }, (_, index) => ({ date: day(from + index), units: units(from + index) }));

test('summary separates the sales-based total, the AI total and the last 30 days sold', () => {
  const result = summary.summarizeForecast({
    ...run,
    status: 'PREDICTED',
    result: {
      status: 'PREDICTED',
      history: points(-90, 90, () => 10),
      baseline: points(0, 30, () => 11),
      forecast: points(0, 30, () => 13.2),
    },
  });

  assert.equal(result.recentTotal, 300);
  assert.equal(result.baselineTotal, 330);
  assert.equal(Math.round(result.aiTotal), 396);
  assert.equal(result.periodStart, '2026-11-16');
  assert.equal(result.periodEnd, '2026-12-15');
  assert.equal(summary.percentChange(result.baselineTotal, result.recentTotal), 10);
});

test('summary keeps the sales-based forecast when AI is unavailable', () => {
  const result = summary.summarizeForecast({
    ...run,
    status: 'PROVIDER_UNAVAILABLE',
    result: {
      status: 'PROVIDER_UNAVAILABLE',
      fallback: 'WEEKDAY_TREND_V1',
      history: points(-90, 90, () => 4),
      baseline: points(0, 30, () => 4),
    },
  });

  assert.equal(result.aiTotal, null);
  assert.equal(result.baselineTotal, 120);
  assert.equal(result.recentTotal, 120);
});

test('peak weekdays are found only when they clearly stand out', () => {
  const weekend = (offset) =>
    [6, 0].includes(new Date(`${day(offset)}T00:00:00Z`).getUTCDay()) ? 13 : 9;

  assert.deepEqual([...summary.peakWeekdays(points(0, 30, weekend))].sort(), [6, 7]);
  assert.deepEqual(summary.peakWeekdays(points(0, 30, () => 5)), []);
  assert.equal(summary.percentChange(5, null), null);
});

test('run payload with a grounded market insight is accepted and insecure sources are rejected', async () => {
  const market = {
    mode: 'WEB_SEARCH',
    adjustmentPct: 15,
    summary: 'Mùa Tết làm nhu cầu tăng.',
    factors: [{ text: 'Tết Nguyên đán', impact: 'UP' }],
    sources: [{ title: 'Báo', uri: 'https://news.example.test/a' }],
    searchSuggestionsHtml: '<div></div>',
  };
  const predicted = {
    ...run,
    status: 'PREDICTED',
    result: { status: 'PREDICTED', modelVersion: 'gemini/x', market },
  };
  globalThis.fetch = async () => ok(predicted);
  const parsed = await demandForecastApi.get(jobId, new AbortController().signal);
  assert.deepEqual(parsed.result.market, market);

  // Knowledge-only answers have no sources; a payload without `mode` is an older web-grounded run.
  globalThis.fetch = async () =>
    ok({
      ...predicted,
      result: { ...predicted.result, market: { ...market, mode: 'KNOWLEDGE', sources: [] } },
    });
  const knowledge = await demandForecastApi.get(jobId, new AbortController().signal);
  assert.equal(knowledge.result.market.mode, 'KNOWLEDGE');
  const { mode: _mode, ...legacy } = market;
  globalThis.fetch = async () =>
    ok({ ...predicted, result: { ...predicted.result, market: legacy } });
  const old = await demandForecastApi.get(jobId, new AbortController().signal);
  assert.equal(old.result.market.mode, 'WEB_SEARCH');

  globalThis.fetch = async () =>
    ok({
      ...predicted,
      result: {
        ...predicted.result,
        market: { ...market, sources: [{ title: 'x', uri: 'http://insecure.test' }] },
      },
    });
  await assert.rejects(() => demandForecastApi.get(jobId, new AbortController().signal));
});

test('daily quota counts only runs from the Vietnam business date', () => {
  const runs = [
    { ...run, forecastStartDate: '2026-11-16' },
    { ...run, jobId: '00000000-0000-4000-8000-000000000012', forecastStartDate: '2026-11-16' },
    { ...run, jobId: '00000000-0000-4000-8000-000000000013', forecastStartDate: '2026-11-15' },
  ];

  assert.equal(summary.forecastsLeftToday(runs, '2026-11-16'), 18);
  assert.equal(summary.vietnamToday(new Date('2026-11-15T17:30:00Z')), '2026-11-16');
});
