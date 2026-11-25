import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const WAREHOUSE_A = '00000400-0000-4000-8000-000000000001';
const WAREHOUSE_B = '00000400-0000-4000-8000-000000000002';
const PARCEL_1 = '00000000-0000-4000-8000-000000000001';
const PARCEL_2 = '00000000-0000-4000-8000-000000000002';
const PARCEL_3 = '00000000-0000-4000-8000-000000000003';
const PARCEL_4 = '00000000-0000-4000-8000-000000000004';
const WAVE_1 = '00000500-0000-4000-8000-000000000001';
const LINE_1 = '00000600-0000-4000-8000-000000000001';
const EXC_1 = '00000700-0000-4000-8000-000000000001';

const managerUser = {
  userId: '00000300-0000-4000-8000-000000000003',
  tenantId: null,
  email: 'manager@example.test',
  fullName: 'Warehouse Manager',
  roles: ['WAREHOUSE_MANAGER'],
  actorScope: 'PLATFORM',
  permissions: [],
};

const originalFetch = globalThis.fetch;

let server;
let riskApi;
let useAuthStore;

function makeRiskItem(overrides = {}) {
  return {
    fulfillmentOrderId: PARCEL_1,
    orderCode: 'ORD-001',
    parcelNo: 1,
    stage: 'PICKING',
    deadlineAt: '2026-11-22T10:30:00.000Z',
    tier: 'HIGH',
    probability: null,
    reasons: [
      {
        code: 'SHORT_TIME_TO_CUTOFF',
        evidence: { minutesRemaining: 45, p50Minutes: 30, p80Minutes: 60 },
      },
      {
        code: 'PICK_BACKLOG_HIGH',
        evidence: { stageOtherParcelsCount: 5, warehouseTotalActiveCount: 12 },
      },
    ],
    recommendationCode: 'REVIEW_PICK_BACKLOG',
    ...overrides,
  };
}

function makePayload(overrides = {}) {
  return {
    state: 'READY',
    warehouseId: WAREHOUSE_A,
    warehouseTimeZone: 'Asia/Ho_Chi_Minh',
    asOf: '2026-11-22T09:00:00.000Z',
    validUntil: '2026-11-22T09:10:00.000Z',
    source: 'EMPIRICAL_DURATION',
    modelVersion: 'uc166-empirical-v1',
    coverage: {
      eligible: 3,
      scored: 2,
      missingCalendar: 0,
      unsupported: 1,
      blocked: 0,
      insufficientData: 0,
      activeOver30Days: 0,
      invalidatedSinceAsOf: 0,
    },
    summary: {
      validTotal: 2,
      highCount: 1,
      mediumCount: 1,
      lowCount: 0,
      topHighStage: 'PICKING',
      topHighStageCount: 1,
    },
    hasMore: false,
    risks: [makeRiskItem()],
    ...overrides,
  };
}

function makeExplanationPayload(overrides = {}) {
  return {
    fulfillmentOrderId: PARCEL_1,
    warehouseId: WAREHOUSE_A,
    asOf: '2026-11-22T09:00:00.000Z',
    validUntil: '2026-11-22T09:10:00.000Z',
    locale: 'vi',
    source: 'GEMINI',
    explanationTemplateId: 'SHORTAGE_WITH_TIME_PRESSURE',
    recommendationCode: 'CHECK_PICK_SHORTAGE',
    candidateAction: 'VIEW_OPEN_SHORTAGE',
    candidatesCount: 2,
    target: {
      kind: 'picking_shortage_line',
      waveId: WAVE_1,
      waveCode: 'PICK-0001',
      lineId: LINE_1,
      exceptionId: EXC_1,
    },
    facts: [
      {
        factId: 'OPEN_PICK_SHORTAGE',
        kind: 'BLOCKER_EVENT',
        reasonCode: 'OPEN_PICK_SHORTAGE',
        metrics: { remainingPickQty: 3 },
      },
      {
        factId: 'TIME_REMAINING',
        kind: 'SCORE_DRIVER',
        reasonCode: 'SHORT_TIME_TO_CUTOFF',
        metrics: { minutesRemaining: 22 },
      },
    ],
    ...overrides,
  };
}

function wrapApi(data) {
  return Response.json(
    {
      success: true,
      data,
      meta: { timestamp: '2026-11-22T09:00:00.000Z', path: '', requestId: 'req-1' },
    },
    { status: 200 },
  );
}

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  riskApi = await server.ssrLoadModule('/src/features/orders/api/fulfillmentSlaRiskApi.ts');
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore
    .getState()
    .setSession({ accessToken: 'mgr-token', expiresIn: 900, user: managerUser });
});

test('strict Zod schemas validate GET and POST explanation payloads and reject unknown fields or invalid numbers', () => {
  const empirical = makePayload();
  assert.equal(riskApi.parseFulfillmentSlaRiskResponse(empirical).state, 'READY');

  const calibrated = makePayload({
    source: 'CALIBRATED_LOGISTIC',
    risks: [
      makeRiskItem({
        probability: 0.78,
        reasons: [{ code: 'DISPATCH_FAILURE', evidence: { stageAgeMinutes: 22 } }],
        recommendationCode: 'CHECK_DISPATCH_FAILURE',
      }),
    ],
  });
  assert.equal(riskApi.parseFulfillmentSlaRiskResponse(calibrated).risks[0].probability, 0.78);

  const disabled = makePayload({
    state: 'DISABLED',
    asOf: null,
    validUntil: null,
    source: null,
    modelVersion: null,
    coverage: null,
    summary: null,
    risks: [],
  });
  assert.equal(riskApi.parseFulfillmentSlaRiskResponse(disabled).state, 'DISABLED');

  // Extra sensitive/private fields rejected strictly.
  for (const forbiddenField of ['tenantId', 'codAmount', 'holdReason', 'recipientPhone']) {
    assert.throws(() =>
      riskApi.parseFulfillmentSlaRiskResponse(
        makePayload({
          risks: [makeRiskItem({ [forbiddenField]: 'leak' })],
        }),
      ),
    );
  }

  for (const badProb of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() =>
      riskApi.parseFulfillmentSlaRiskResponse(
        makePayload({ risks: [makeRiskItem({ probability: badProb })] }),
      ),
    );
  }
  assert.throws(() =>
    riskApi.parseFulfillmentSlaRiskResponse(makePayload({ state: 'UNKNOWN_STATE' })),
  );

  // POST explanation schema: accepts valid token-structured advicePattern; rejects legacy summaryText, adviceText, extra keys, or >2 facts.
  const validExp = makeExplanationPayload({
    advicePattern: 'Bạn nên {{action}} trước. {{reason}}',
  });
  assert.equal(
    riskApi.parseFulfillmentSlaRiskExplanationResponse(validExp).explanationTemplateId,
    'SHORTAGE_WITH_TIME_PRESSURE',
  );
  assert.equal(
    riskApi.parseFulfillmentSlaRiskExplanationResponse(validExp).advicePattern,
    validExp.advicePattern,
  );
  assert.throws(() =>
    riskApi.parseFulfillmentSlaRiskExplanationResponse({
      ...validExp,
      adviceText: 'Legacy unverified free text must be rejected',
    }),
  );
  assert.throws(() =>
    riskApi.parseFulfillmentSlaRiskExplanationResponse({
      ...validExp,
      summaryText: 'Free text must never be accepted after H2',
    }),
  );
  assert.throws(() =>
    riskApi.parseFulfillmentSlaRiskExplanationResponse({
      ...validExp,
      freeText: 'hallucinated',
    }),
  );
  assert.throws(() =>
    riskApi.parseFulfillmentSlaRiskExplanationResponse({
      ...validExp,
      facts: [...validExp.facts, validExp.facts[0]],
    }),
  );
});

test('probability % is gated on non-null probability and deadlines format in warehouseTimeZone', () => {
  assert.equal(riskApi.formatRiskProbability(null, 'vi'), null);
  assert.equal(riskApi.formatRiskProbability(null, 'en'), null);
  assert.equal(riskApi.formatRiskProbability(Number.NaN, 'en'), null);
  assert.match(riskApi.formatRiskProbability(0.73, 'en'), /73\s*%/);
  assert.match(riskApi.formatRiskProbability(0.73, 'vi'), /73\s*%/);
  // Section 2: Never round high/low tail probabilities to 100% or 0%.
  for (const extremeHigh of [0.99, 0.995, 0.999, 1.0]) {
    assert.equal(riskApi.formatRiskProbability(extremeHigh, 'vi'), 'trên 99%');
    assert.equal(riskApi.formatRiskProbability(extremeHigh, 'en'), 'over 99%');
  }
  for (const extremeLow of [0.0, 0.004, 0.01]) {
    assert.equal(riskApi.formatRiskProbability(extremeLow, 'vi'), 'dưới 1%');
    assert.equal(riskApi.formatRiskProbability(extremeLow, 'en'), 'under 1%');
  }
  // Natural elapsed durations & warehouse-local relative cutoff labels.
  assert.equal(riskApi.formatElapsedMinutes(45, 'vi'), '45 phút');
  assert.equal(riskApi.formatElapsedMinutes(120, 'vi'), '2 giờ');
  assert.equal(riskApi.formatElapsedMinutes(202, 'vi'), '3 giờ 22 phút');
  assert.equal(riskApi.formatElapsedMinutes(202, 'en'), '3h 22m');
  assert.deepEqual(
    riskApi.formatWarehouseDeadline(
      '2026-11-23T03:00:00.000Z',
      'Asia/Ho_Chi_Minh',
      'vi',
      Date.parse('2026-11-23T01:44:00.000Z'),
    ),
    { kind: 'today', time: '10:00' },
  );
  assert.deepEqual(
    riskApi.formatWarehouseDeadline(
      '2026-11-24T03:00:00.000Z',
      'Asia/Ho_Chi_Minh',
      'en',
      Date.parse('2026-11-23T01:44:00.000Z'),
    ),
    { kind: 'tomorrow', time: '10:00' },
  );

  assert.equal(
    riskApi.isRiskSnapshotExpired(
      '2026-11-22T09:10:00.000Z',
      Date.parse('2026-11-22T09:09:59.000Z'),
    ),
    false,
  );
  assert.equal(
    riskApi.isRiskSnapshotExpired(
      '2026-11-22T09:10:00.000Z',
      Date.parse('2026-11-22T09:10:00.000Z'),
    ),
    true,
  );
});

test('fetchFulfillmentSlaRisks and fetchFulfillmentSlaRiskExplanation enforce identity, 404, 409, and 403', async () => {
  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url, 'https://app.example.test');
    assert.equal(parsedUrl.pathname, '/api/v1/warehouse-ops/fulfillment-sla-risks');
    assert.equal(parsedUrl.searchParams.get('warehouseId'), WAREHOUSE_A);
    assert.equal(parsedUrl.searchParams.get('limit'), '20');
    return wrapApi(makePayload());
  };
  const ok = await riskApi.fetchFulfillmentSlaRisks(WAREHOUSE_A, 20);
  assert.equal(ok.kind, 'ok');
  assert.equal(ok.data.risks[0].orderCode, 'ORD-001');

  globalThis.fetch = async () => wrapApi(makePayload({ warehouseId: WAREHOUSE_B }));
  assert.equal((await riskApi.fetchFulfillmentSlaRisks(WAREHOUSE_A, 20)).kind, 'error');

  globalThis.fetch = async () =>
    Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'N/A' } },
      { status: 404 },
    );
  assert.equal(
    (await riskApi.fetchFulfillmentSlaRisks(WAREHOUSE_A, 20)).kind,
    'endpoint_unavailable',
  );

  globalThis.fetch = async () =>
    Response.json(
      { success: false, error: { code: 'AUTH.FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    );
  assert.equal((await riskApi.fetchFulfillmentSlaRisks(WAREHOUSE_A, 20)).kind, 'forbidden');
  assert.ok(useAuthStore.getState().accessToken);

  // POST explanation: 200 ok, mismatched warehouse rejected, 409 conflict, 403 forbidden, 404 unavailable.
  globalThis.fetch = async (url, init) => {
    const parsedUrl = new URL(url, 'https://app.example.test');
    assert.equal(
      parsedUrl.pathname,
      `/api/v1/warehouse-ops/fulfillment-sla-risks/${PARCEL_1}/explanation`,
    );
    assert.equal(parsedUrl.searchParams.get('warehouseId'), WAREHOUSE_A);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      asOf: '2026-11-22T09:00:00.000Z',
      locale: 'vi',
    });
    return wrapApi(makeExplanationPayload());
  };
  const expOk = await riskApi.fetchFulfillmentSlaRiskExplanation(
    WAREHOUSE_A,
    PARCEL_1,
    '2026-11-22T09:00:00.000Z',
    'vi',
  );
  assert.equal(expOk.kind, 'ok');
  assert.equal(expOk.data.source, 'GEMINI');

  globalThis.fetch = async () => wrapApi(makeExplanationPayload({ warehouseId: WAREHOUSE_B }));
  const expCrossWh = await riskApi.fetchFulfillmentSlaRiskExplanation(
    WAREHOUSE_A,
    PARCEL_1,
    '2026-11-22T09:00:00.000Z',
    'vi',
  );
  assert.equal(expCrossWh.kind, 'unavailable');

  globalThis.fetch = async () =>
    Response.json({ success: false, error: { code: 'COMMON.CONFLICT' } }, { status: 409 });
  assert.equal(
    (
      await riskApi.fetchFulfillmentSlaRiskExplanation(
        WAREHOUSE_A,
        PARCEL_1,
        '2026-11-22T09:00:00.000Z',
        'vi',
      )
    ).kind,
    'conflict',
  );

  globalThis.fetch = async () =>
    Response.json({ success: false, error: { code: 'AUTH.FORBIDDEN' } }, { status: 403 });
  assert.equal(
    (
      await riskApi.fetchFulfillmentSlaRiskExplanation(
        WAREHOUSE_A,
        PARCEL_1,
        '2026-11-22T09:00:00.000Z',
        'vi',
      )
    ).kind,
    'forbidden',
  );
});

test('Phase B verified navigation gates every recommendationCode & WAITING_LABEL sub-case by real route & permission', () => {
  const fullPerms = {
    canManagePicking: true,
    canPackingRoute: true,
    canHandoverRoute: true,
    canShipmentsRoute: true,
    canExceptionsRoute: true,
  };

  // Verified picking deep-link targets (UI1): shortage line, progress line, and wave.
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'PICKING',
        recommendationCode: 'CHECK_PICK_SHORTAGE',
        target: {
          kind: 'picking_shortage_line',
          waveId: WAVE_1,
          waveCode: 'PICK-0001',
          lineId: LINE_1,
          exceptionId: EXC_1,
        },
      }),
      WAREHOUSE_A,
      fullPerms,
    ),
    {
      kind: 'open_picking_line',
      waveId: WAVE_1,
      waveCode: 'PICK-0001',
      lineId: LINE_1,
      exceptionId: EXC_1,
      labelKey: 'actionOpenShortageLine',
    },
  );
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({ stage: 'PICKING', recommendationCode: 'REVIEW_PICK_BACKLOG' }),
      WAREHOUSE_A,
      fullPerms,
      {
        kind: 'picking_progress_line',
        waveId: WAVE_1,
        waveCode: 'PICK-0001',
        lineId: LINE_1,
      },
    ),
    {
      kind: 'open_picking_line',
      waveId: WAVE_1,
      waveCode: 'PICK-0001',
      lineId: LINE_1,
      labelKey: 'actionOpenPickLine',
    },
  );
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'PICKING',
        recommendationCode: 'REVIEW_PICK_BACKLOG',
        target: { kind: 'picking_wave', waveId: WAVE_1, waveCode: 'PICK-0001' },
      }),
      WAREHOUSE_A,
      fullPerms,
    ),
    {
      kind: 'open_picking_wave',
      waveId: WAVE_1,
      waveCode: 'PICK-0001',
      labelKey: 'actionOpenWave',
    },
  );

  // Without verified line/wave target, CHECK_PICK_SHORTAGE & PICKING fall back honestly to waves list.
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({ stage: 'PICKING', recommendationCode: 'CHECK_PICK_SHORTAGE' }),
      WAREHOUSE_A,
      fullPerms,
    ),
    { kind: 'focus_waves', labelKey: 'actionViewWaves' },
  );

  // CHECK_RESERVATION routes to backlog only if manager can view picking backlog.
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({ stage: 'WAITING_PICK', recommendationCode: 'CHECK_RESERVATION' }),
      WAREHOUSE_A,
      fullPerms,
    ),
    { kind: 'focus_backlog', labelKey: 'actionViewBacklog' },
  );
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({ stage: 'WAITING_PICK', recommendationCode: 'CHECK_RESERVATION' }),
      WAREHOUSE_A,
      { ...fullPerms, canManagePicking: false },
    ),
    { kind: 'none' },
  );

  // WAITING_LABEL split:
  // 1) CHECK_LABEL_VERIFICATION -> deep-link to Packing detail (shows LABEL_VERIFYING status & awaitingLabel).
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_LABEL',
        recommendationCode: 'CHECK_LABEL_VERIFICATION',
      }),
      WAREHOUSE_A,
      fullPerms,
    ),
    {
      kind: 'link',
      target: 'packing',
      to: `/warehouse/packing?warehouse=${WAREHOUSE_A}&fulfillment=${PARCEL_1}`,
      labelKey: 'actionCheckLabel',
    },
  );
  // 2) CHECK_DISPATCH_FAILURE -> Shipments list (NOT Packing, because Packing does not show carrier failure codes!).
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_LABEL',
        recommendationCode: 'CHECK_DISPATCH_FAILURE',
      }),
      WAREHOUSE_A,
      fullPerms,
    ),
    {
      kind: 'link',
      target: 'shipments',
      to: '/shipments',
      labelKey: 'actionViewShipments',
    },
  );
  // Falls back to warehouse-filtered Exceptions list if Shipments disallowed, or none if neither allowed.
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_LABEL',
        recommendationCode: 'CHECK_DISPATCH_FAILURE',
      }),
      WAREHOUSE_A,
      { ...fullPerms, canShipmentsRoute: false, canExceptionsRoute: true },
    ),
    {
      kind: 'link',
      target: 'exceptions',
      to: `/exceptions?warehouse=${WAREHOUSE_A}`,
      labelKey: 'actionViewExceptions',
    },
  );
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_LABEL',
        recommendationCode: 'CHECK_DISPATCH_FAILURE',
      }),
      WAREHOUSE_A,
      { ...fullPerms, canShipmentsRoute: false, canExceptionsRoute: false },
    ),
    { kind: 'none' },
  );

  // WAITING_HANDOVER -> Handover with permission-checked ?warehouse=&fulfillment= deep-link (UI1).
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_HANDOVER',
        recommendationCode: 'REVIEW_HANDOVER_QUEUE',
      }),
      WAREHOUSE_A,
      fullPerms,
    ),
    {
      kind: 'link',
      target: 'handover',
      to: `/warehouse/handover?warehouse=${WAREHOUSE_A}&fulfillment=${PARCEL_1}`,
      labelKey: 'actionViewHandover',
    },
  );
  assert.equal(
    riskApi.buildOverdueExceptionsPath(WAREHOUSE_A),
    `/exceptions?warehouse=${WAREHOUSE_A}&reason=SLA.HANDOVER_OVERDUE`,
  );
  assert.deepEqual(
    riskApi.resolveRiskNavigation(
      makeRiskItem({
        stage: 'WAITING_HANDOVER',
        recommendationCode: 'REVIEW_HANDOVER_QUEUE',
      }),
      WAREHOUSE_A,
      { ...fullPerms, canHandoverRoute: false },
    ),
    { kind: 'none' },
  );
});

test('Phase B cardinality & scope cases: 0, 1, 3, 4, >50 items, duplicate orderCode, partial coverage, low-only, and 403 on load-more', async () => {
  const scopeKey = `mgr:1:${WAREHOUSE_A}`;
  const nowMs = Date.parse('2026-11-22T09:04:00.000Z');

  // 0 items (eligible=0)
  const v0 = riskApi.evaluateRiskViewState(
    {
      scopeKey,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          coverage: {
            eligible: 0,
            scored: 0,
            missingCalendar: 0,
            unsupported: 0,
            blocked: 0,
            insufficientData: 0,
            activeOver30Days: 0,
            invalidatedSinceAsOf: 0,
          },
          summary: {
            validTotal: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            topHighStage: null,
            topHighStageCount: 0,
          },
          risks: [],
        }),
      },
    },
    scopeKey,
    nowMs,
  );
  assert.equal(v0.kind, 'READY');
  assert.equal(v0.activeRisks.length, 0);
  assert.equal(v0.summary.validTotal, 0);

  // Duplicate orderCode across two distinct UUIDs + 4 items (> default 3) + >50 hasMore flag + partial coverage.
  const fourItems = [
    makeRiskItem({ fulfillmentOrderId: PARCEL_1, orderCode: 'DUP-001', parcelNo: 1, tier: 'HIGH' }),
    makeRiskItem({ fulfillmentOrderId: PARCEL_2, orderCode: 'DUP-001', parcelNo: 2, tier: 'HIGH' }),
    makeRiskItem({
      fulfillmentOrderId: PARCEL_3,
      orderCode: 'ORD-003',
      parcelNo: 1,
      tier: 'MEDIUM',
    }),
    makeRiskItem({
      fulfillmentOrderId: PARCEL_4,
      orderCode: 'ORD-004',
      parcelNo: 1,
      tier: 'MEDIUM',
    }),
  ];
  const vMore = riskApi.evaluateRiskViewState(
    {
      scopeKey,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          coverage: {
            eligible: 60,
            scored: 52,
            missingCalendar: 8,
            unsupported: 0,
            blocked: 0,
            insufficientData: 0,
            activeOver30Days: 0,
            invalidatedSinceAsOf: 0,
          },
          summary: {
            validTotal: 52,
            highCount: 12,
            mediumCount: 30,
            lowCount: 10,
            topHighStage: 'PICKING',
            topHighStageCount: 8,
          },
          hasMore: true,
          risks: fourItems,
        }),
      },
    },
    scopeKey,
    nowMs,
  );
  assert.equal(vMore.kind, 'READY');
  assert.equal(vMore.summaryScope, 'warehouse');
  assert.equal(vMore.summary.highCount, 12);
  assert.equal(vMore.hasMore, true);
  assert.equal(new Set(vMore.activeRisks.map((r) => r.fulfillmentOrderId)).size, 4);

  // Only LOW tier items: summary reflects highCount=0, mediumCount=0, lowCount=1.
  const vLowOnly = riskApi.evaluateRiskViewState(
    {
      scopeKey,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          summary: {
            validTotal: 1,
            highCount: 0,
            mediumCount: 0,
            lowCount: 1,
            topHighStage: null,
            topHighStageCount: 0,
          },
          risks: [makeRiskItem({ tier: 'LOW' })],
        }),
      },
    },
    scopeKey,
    nowMs,
  );
  assert.equal(vLowOnly.kind, 'READY');
  assert.equal(vLowOnly.summary.highCount, 0);
  assert.equal(vLowOnly.summary.mediumCount, 0);
  assert.equal(vLowOnly.summary.lowCount, 1);

  // Losing permission (403) when clicking "Show more" (limit=50) clears previously rendered rows immediately!
  let loadStep = 0;
  const ctrl = riskApi.createScopedRiskController(async (_wh, limit) => {
    loadStep += 1;
    if (loadStep === 1) {
      assert.equal(limit, 20);
      return { kind: 'ok', data: makePayload({ hasMore: true, risks: fourItems }) };
    }
    assert.equal(limit, 50);
    return { kind: 'forbidden' };
  });
  const first = await ctrl.load(scopeKey, WAREHOUSE_A, 20);
  assert.equal(first.result.kind, 'ok');
  const second = await ctrl.load(scopeKey, WAREHOUSE_A, 50);
  assert.equal(second.result.kind, 'forbidden');
  assert.equal(second.result.data, undefined);
});

test('H6 & Phase C explanation controller handles dedup, warehouse switch/return, expiry during provider call, 409, and 403', async () => {
  let fakeNow = Date.parse('2026-11-22T09:04:00.000Z');
  const expiresAtMs = Date.parse('2026-11-22T09:05:00.000Z');
  let fetchCalls = 0;
  let resolveSlow;
  let abortedFirst = false;
  let conflictCount = 0;
  let forbiddenCount = 0;

  const ctrl = riskApi.createScopedExplanationController(
    async (warehouseId, fulfillmentOrderId, _asOf, _locale, signal) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        signal.addEventListener('abort', () => {
          abortedFirst = true;
        });
        return new Promise((resolve) => {
          resolveSlow = resolve;
        });
      }
      if (warehouseId === WAREHOUSE_B) {
        return {
          kind: 'ok',
          data: makeExplanationPayload({
            warehouseId: WAREHOUSE_B,
            fulfillmentOrderId,
          }),
        };
      }
      if (fulfillmentOrderId === PARCEL_2) return { kind: 'conflict' };
      if (fulfillmentOrderId === PARCEL_3) return { kind: 'forbidden' };
      return { kind: 'ok', data: makeExplanationPayload({ fulfillmentOrderId }) };
    },
    {
      onConflict: () => {
        conflictCount += 1;
      },
      onForbidden: () => {
        forbiddenCount += 1;
      },
    },
    () => fakeNow,
  );

  // Two concurrent requests for same scope+parcel deduplicate to 1 POST call.
  const scopeA = `mgr:1:${WAREHOUSE_A}:2026-11-22T09:00:00.000Z`;
  const req1 = ctrl.request({
    scopePrefix: scopeA,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  const req2 = ctrl.request({
    scopePrefix: scopeA,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  assert.equal(fetchCalls, 1, 'duplicate concurrent expand must not fire second POST');

  // Switch warehouse while provider call is in-flight -> aborts Warehouse A request and clears entries.
  const scopeB = `mgr:1:${WAREHOUSE_B}:2026-11-22T09:00:00.000Z`;
  const reqB = ctrl.request({
    scopePrefix: scopeB,
    warehouseId: WAREHOUSE_B,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  assert.equal(abortedFirst, true, 'warehouse switch must abort in-flight Gemini request');
  resolveSlow({ kind: 'ok', data: makeExplanationPayload() });
  await Promise.all([req1, req2, reqB]);
  assert.equal(ctrl.getEntries()[`${scopeA}:${PARCEL_1}`], undefined);
  assert.equal(ctrl.getEntries()[`${scopeB}:${PARCEL_1}`].data.warehouseId, WAREHOUSE_B);

  // Switch back to Warehouse A: 409 triggers conflict callback; 403 triggers forbidden & clears all entries.
  await ctrl.request({
    scopePrefix: scopeA,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_2,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  assert.equal(conflictCount, 1);

  await ctrl.request({
    scopePrefix: scopeA,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_3,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  assert.equal(forbiddenCount, 1);
  assert.deepEqual(ctrl.getEntries(), {});

  // Parcel expires while provider is loading -> late response MUST be dropped!
  let resolveExpiring;
  const expiringCtrl = riskApi.createScopedExplanationController(
    () =>
      new Promise((resolve) => {
        resolveExpiring = resolve;
      }),
    undefined,
    () => fakeNow,
  );
  const pExp = expiringCtrl.request({
    scopePrefix: scopeA,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  fakeNow = Date.parse('2026-11-22T09:05:00.000Z'); // hits deadlineAt during provider wait!
  resolveExpiring({ kind: 'ok', data: makeExplanationPayload() });
  const lateResult = await pExp;
  assert.equal(lateResult, null, 'response arriving after parcel expiry must be discarded');
  assert.deepEqual(expiringCtrl.getEntries(), {});
});

test('H6 fake-clock expiry hides rows, summary and actions at min(deadlineAt, validUntil) and rejects older late responses', async () => {
  const scopeKey = `mgr:1:${WAREHOUSE_A}`;
  const twoItemPayload = makePayload({
    asOf: '2026-11-22T09:00:00.000Z',
    validUntil: '2026-11-22T09:10:00.000Z',
    summary: {
      validTotal: 2,
      highCount: 1,
      mediumCount: 1,
      lowCount: 0,
      topHighStage: 'PICKING',
      topHighStageCount: 1,
    },
    risks: [
      makeRiskItem({
        fulfillmentOrderId: PARCEL_1,
        deadlineAt: '2026-11-22T09:05:00.000Z',
        tier: 'HIGH',
      }),
      makeRiskItem({
        fulfillmentOrderId: PARCEL_2,
        orderCode: 'ORD-002',
        stage: 'WAITING_PACK',
        deadlineAt: '2026-11-22T09:30:00.000Z',
        tier: 'MEDIUM',
        recommendationCode: 'REVIEW_PACK_QUEUE',
      }),
    ],
  });

  const snapshot = {
    scopeKey,
    loading: false,
    result: { kind: 'ok', data: twoItemPayload },
  };

  const v1 = riskApi.evaluateRiskViewState(
    snapshot,
    scopeKey,
    Date.parse('2026-11-22T09:04:00.000Z'),
  );
  assert.equal(v1.kind, 'READY');
  assert.equal(v1.activeRisks.length, 2);
  assert.equal(v1.summaryScope, 'warehouse');
  assert.equal(v1.nextExpiryMs, Date.parse('2026-11-22T09:05:00.000Z'));

  // PARCEL_1 expires at 09:05 -> dropped immediately, summary becomes 'displayed'.
  const v2 = riskApi.evaluateRiskViewState(
    snapshot,
    scopeKey,
    Date.parse('2026-11-22T09:05:00.000Z'),
  );
  assert.equal(v2.kind, 'READY');
  assert.deepEqual(
    v2.activeRisks.map((r) => r.fulfillmentOrderId),
    [PARCEL_2],
  );
  assert.equal(v2.summaryScope, 'displayed');
  assert.equal(v2.summary.highCount, 0);

  // Snapshot validUntil expires at 09:10 -> STALE with 0 rows.
  const v3 = riskApi.evaluateRiskViewState(
    snapshot,
    scopeKey,
    Date.parse('2026-11-22T09:10:00.000Z'),
  );
  assert.equal(v3.kind, 'STALE');
  assert.deepEqual(v3.activeRisks, []);
  assert.equal(v3.hasMore, false);

  // Older asOf late response rejected by scoped controller.
  let fakeNow = Date.parse('2026-11-22T09:04:00.000Z');
  let callCount = 0;
  const ctrl = riskApi.createScopedRiskController(
    async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          kind: 'ok',
          data: makePayload({
            asOf: '2026-11-22T09:03:00.000Z',
            validUntil: '2026-11-22T09:13:00.000Z',
          }),
        };
      }
      return {
        kind: 'ok',
        data: makePayload({
          asOf: '2026-11-22T09:00:00.000Z',
          validUntil: '2026-11-22T09:10:00.000Z',
        }),
      };
    },
    undefined,
    () => fakeNow,
  );
  await ctrl.load(scopeKey, WAREHOUSE_A, 20);
  await ctrl.load(scopeKey, WAREHOUSE_A, 20);
  assert.equal(ctrl.getState().result.data.asOf, '2026-11-22T09:03:00.000Z');
});

test('L1 & §1.1 wording: accurate p50 median / p80 80th-pct labels and quantitative gating', () => {
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));

  // p50 must say "trung vị" / "median"; p80 must say "mốc 80%" / "80%"; NEVER "thời gian trung bình" or "average".
  assert.match(vi.FulfillmentSlaRisk.facts.COHORT_BENCHMARK_BOTH, /trung vị/i);
  assert.match(vi.FulfillmentSlaRisk.facts.COHORT_BENCHMARK_BOTH, /80%/);
  assert.equal(/thời gian trung bình/i.test(JSON.stringify(vi.FulfillmentSlaRisk)), false);
  assert.equal(/\baverage\b/i.test(JSON.stringify(en.FulfillmentSlaRisk)), false);
  assert.equal(/thiếu nhân viên/i.test(JSON.stringify(vi.FulfillmentSlaRisk)), false);

  // G1 quantitative gate: 360 min remaining vs p50=40, p80=60 MUST NOT select SHORTAGE_WITH_TIME_PRESSURE!
  const looseTimeShortage = riskApi.buildLocalParcelExplanation(
    makeRiskItem({
      stage: 'PICKING',
      tier: 'HIGH',
      recommendationCode: 'CHECK_PICK_SHORTAGE',
      reasons: [
        { code: 'OPEN_PICK_SHORTAGE', evidence: { remainingPickQty: 3 } },
        {
          code: 'SHORT_TIME_TO_CUTOFF',
          evidence: { minutesRemaining: 360, p50Minutes: 40, p80Minutes: 60 },
        },
      ],
    }),
  );
  assert.equal(looseTimeShortage.explanationTemplateId, 'SHORTAGE_PRIMARY');
  assert.equal(looseTimeShortage.hasMultipleInterpretations, true);

  // Product opt-in: every parcel with verified facts (all stages & risk tiers) requests
  // token-structured Gemini phrasing (`advicePattern`), while zero-fact parcels stay local-only.
  const singlePlan = riskApi.buildLocalParcelExplanation(
    makeRiskItem({
      stage: 'WAITING_PACK',
      tier: 'HIGH',
      recommendationCode: 'REVIEW_PACK_QUEUE',
      reasons: [{ code: 'SHORT_TIME_TO_CUTOFF', evidence: { minutesRemaining: 25 } }],
    }),
  );
  assert.equal(singlePlan.hasMultipleInterpretations, true);
  assert.equal(singlePlan.facts.length, 1);

  const lowPickingPlan = riskApi.buildLocalParcelExplanation(
    makeRiskItem({
      stage: 'PICKING',
      tier: 'LOW',
      recommendationCode: 'REVIEW_PICK_BACKLOG',
      reasons: [{ code: 'SHORT_TIME_TO_CUTOFF', evidence: { minutesRemaining: 90 } }],
    }),
  );
  assert.equal(lowPickingPlan.hasMultipleInterpretations, true);

  const emptyFactsPlan = riskApi.buildLocalParcelExplanation(
    makeRiskItem({
      stage: 'PICKING',
      tier: 'HIGH',
      recommendationCode: 'REVIEW_PICK_BACKLOG',
      reasons: [],
    }),
  );
  assert.equal(emptyFactsPlan.hasMultipleInterpretations, false);

  // Multi-signal HIGH PICKING parcel with tight time -> SHORTAGE_WITH_TIME_PRESSURE, capped at 2 facts.
  const multiPlan = riskApi.buildLocalParcelExplanation(
    makeRiskItem({
      stage: 'PICKING',
      tier: 'HIGH',
      recommendationCode: 'CHECK_PICK_SHORTAGE',
      reasons: [
        { code: 'OPEN_PICK_SHORTAGE', evidence: { remainingPickQty: 3 } },
        {
          code: 'SHORT_TIME_TO_CUTOFF',
          evidence: { minutesRemaining: 22, p50Minutes: 35, p80Minutes: 55 },
        },
        {
          code: 'PICK_BACKLOG_HIGH',
          evidence: { stageOtherParcelsCount: 10, warehouseTotalActiveCount: 30 },
        },
      ],
    }),
  );
  assert.equal(multiPlan.explanationTemplateId, 'SHORTAGE_WITH_TIME_PRESSURE');
  assert.equal(multiPlan.hasMultipleInterpretations, true);
  assert.equal(multiPlan.facts.length, 2);

  // G1 + M4 + Section 2 honest wording: OPEN_PICK_SHORTAGE shows stage + open shortage,
  // NEVER presenting parcel remainingPickQty as shortage delta or unreserved qty.
  const sig = riskApi.resolvePrimarySignal(
    makeRiskItem({
      stage: 'PICKING',
      reasons: [{ code: 'OPEN_PICK_SHORTAGE', evidence: { remainingPickQty: 3 } }],
    }),
  );
  assert.deepEqual(sig, {
    key: 'signals.OPEN_PICK_SHORTAGE',
    values: {},
    stageKey: 'PICKING',
  });
  assert.equal(vi.FulfillmentSlaRisk.signals.OPEN_PICK_SHORTAGE, '{stage} · Có phiếu báo thiếu');
  assert.equal(/Thiếu \{qty\} sản phẩm/i.test(JSON.stringify(vi.FulfillmentSlaRisk)), false);

  const resSig = riskApi.resolvePrimarySignal(
    makeRiskItem({
      reasons: [{ code: 'RESERVATION_ISSUE', evidence: { remainingPickQty: 7 } }],
    }),
  );
  assert.deepEqual(resSig, { key: 'signals.RESERVATION_ISSUE', values: {} });
  assert.equal(vi.FulfillmentSlaRisk.signals.RESERVATION_ISSUE, 'Có vấn đề giữ tồn');
  assert.equal(/Chưa giữ tồn \{qty\}/i.test(JSON.stringify(vi.FulfillmentSlaRisk)), false);

  // TIME_REMAINING fact anchors to snapshot asOfClock when provided and handles <1 min cleanly.
  const timeFact = {
    factId: 'TIME_REMAINING',
    kind: 'SCORE_DRIVER',
    reasonCode: 'SHORT_TIME_TO_CUTOFF',
    metrics: { minutesRemaining: 25 },
  };
  assert.deepEqual(riskApi.resolveFactTranslation(timeFact), {
    key: 'facts.TIME_REMAINING',
    values: { minutes: 25 },
  });
  assert.deepEqual(riskApi.resolveFactTranslation(timeFact, '23:04'), {
    key: 'facts.TIME_REMAINING_AT',
    values: { minutes: 25, asOf: '23:04' },
  });
  assert.deepEqual(
    riskApi.resolveFactTranslation({ ...timeFact, metrics: { minutesRemaining: 0 } }, '23:29'),
    {
      key: 'facts.TIME_REMAINING_UNDER_MINUTE_AT',
      values: { asOf: '23:29' },
    },
  );
});

test('PickingWorkspace & HandoverWorkspace integration and i18n parity without forbidden loanwords', () => {
  const pickingSource = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const packingSource = readFileSync(
    new URL('../src/features/orders/components/PackingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const handoverSource = readFileSync(
    new URL('../src/features/orders/components/HandoverWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const panelSource = readFileSync(
    new URL('../src/features/orders/components/FulfillmentSlaRiskPanel.tsx', import.meta.url),
    'utf8',
  );
  const exceptionsSource = readFileSync(
    new URL('../src/features/shipments/components/SlaExceptionsPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.ok(pickingSource.includes("can('warehouse.fulfillmentSlaRisk.view')"));
  assert.ok(pickingSource.includes('key={`${actorId}:${revision}:${warehouse}`}'));
  assert.ok(pickingSource.includes('onFocusWaves={focusWaves}'));
  assert.ok(pickingSource.includes('onOpenPickingTarget={handleOpenPickingTarget}'));
  assert.ok(pickingSource.includes('data-pick-line-id={line.id}'));
  assert.ok(pickingSource.includes('prefers-reduced-motion'));
  // M1: Deep-link intent stays out of detail fetch deps and survives warehouse init for matching scope.
  assert.equal(pickingSource.includes('pendingDeepLink?.waveId'), false);
  assert.ok(pickingSource.includes('preserveDeepLink'));
  // M2: Deep-link target verifies live exceptionId & remainingQty before highlighting.
  assert.ok(pickingSource.includes('targetLine.shortage.id === pendingDeepLink.exceptionId'));
  assert.ok(pickingSource.includes("t('deepLinkShortageResolved')"));
  assert.ok(pickingSource.includes("t('deepLinkLineCompleted')"));
  assert.equal(packingSource.includes('FulfillmentSlaRiskPanel'), false);
  assert.equal(handoverSource.includes('FulfillmentSlaRiskPanel'), false);
  assert.ok(handoverSource.includes("searchParams.get('warehouse')"));
  assert.ok(handoverSource.includes("searchParams.get('fulfillment')"));
  assert.ok(handoverSource.includes('data-handover-fulfillment-id={s.fulfillmentOrderId}'));
  assert.ok(exceptionsSource.includes("searchParams.get('warehouse')"));
  assert.ok(exceptionsSource.includes("searchParams.get('reason')"));
  // M5: SlaExceptionsPanel passes warehouseFilter & reasonFilter to server BEFORE pagination.
  assert.ok(exceptionsSource.includes('warehouseId: warehouseFilter'));
  assert.ok(exceptionsSource.includes('reasonCode: reasonFilter'));
  // M6: Desktop table uses 4 real <td> cells per parcel row and opens parcel details in a Modal popup (no inline colSpan=4 dropdown).
  assert.equal(panelSource.includes('grid-cols-[minmax(0,1.25fr)'), false);
  assert.equal(panelSource.includes('colSpan={4}'), false);
  assert.ok(panelSource.includes('<Modal'));
  assert.ok(panelSource.includes('handleOpenParcelModal'));
  // Snapshot rollover (409 SLA_RISK.SNAPSHOT_SUPERSEDED) keeps the open popup alive and re-requests Gemini seamlessly.
  assert.ok(panelSource.includes('conflictRefreshing'));
  assert.ok(panelSource.includes('lastScopePrefixRef'));
  // M3: Load-more advances apiLimit only on genuine loadMoreSucceeded and exposes load-more for LOW-only warehouses.
  assert.ok(panelSource.includes('nextState.loadMoreSucceeded &&'));
  assert.ok(panelSource.includes('visiblePriorityRisks.length === 0 &&'));
  // Low-1: INSUFFICIENT_DATA checked on tab foreground return.
  assert.ok(panelSource.includes("currentData.state === 'INSUFFICIENT_DATA'"));
  // Accessibility & UI2-UI6: ResizeObserver, dialog trigger, polite live region, zero summaryText rendering.
  assert.ok(panelSource.includes('ResizeObserver'));
  assert.ok(panelSource.includes('aria-haspopup="dialog"'));
  assert.ok(panelSource.includes('aria-live="polite"'));
  assert.ok(panelSource.includes("t('whyButton')"));
  assert.ok(panelSource.includes('visibilitychange'));
  assert.equal(panelSource.includes('summaryText'), false);
  // Visual separation: Gemini-only suggestion card (never flashes ORCA fallback suggestion) & System overdue alerts.
  assert.ok(
    panelSource.includes(
      "verifiedRemote?.source === 'GEMINI' && !geminiPatternRejected ? 'GEMINI' : 'TEMPLATE'",
    ),
  );
  assert.ok(panelSource.includes('data-explanation-source={sourceKind}'));
  assert.ok(panelSource.includes("t('geminiSuggestionBadge')"));
  assert.ok(panelSource.includes("t('geminiUnavailable')"));
  assert.equal(panelSource.includes("t('systemSuggestionBadge')"), false);
  assert.ok(panelSource.includes("t('overdueSystemBanner'"));

  const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));

  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'string' ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`),
    );

  const enMap = new Map(flatten(en.FulfillmentSlaRisk));
  const viMap = new Map(flatten(vi.FulfillmentSlaRisk));
  assert.deepEqual([...viMap.keys()].sort(), [...enMap.keys()].sort());

  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const forbiddenVi =
    /\b(pick|putback|putaway|wave|booking|retry|reservation|manager|staff|admin|cut-off|downtime|barcode|zoom|snapshot|payload|quarantine|sellable|QC|ASN|SKU)\b/i;

  for (const [key, viText] of viMap.entries()) {
    assert.deepEqual(placeholders(viText), placeholders(enMap.get(key)), key);
    const visible = viText.replace(/\{[^{}]*\}/g, '');
    assert.equal(forbiddenVi.test(visible), false, `${key}: ${viText}`);
  }
});

test('Overdue handoff & coverage edge cases: deadline crossing, invalidated STALE, multi-warehouse filtering, pagination, and abort isolation', async () => {
  const scopeA = `mgr:1:${WAREHOUSE_A}`;
  const scopeB = `mgr:1:${WAREHOUSE_B}`;

  // Case 1: All parcels cross deadlineAt before validUntil -> STALE with staleReason='all_past_deadline'.
  const allPast = riskApi.evaluateRiskViewState(
    {
      scopeKey: scopeA,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          asOf: '2026-11-22T09:00:00.000Z',
          validUntil: '2026-11-22T09:10:00.000Z',
          risks: [makeRiskItem({ deadlineAt: '2026-11-22T09:05:00.000Z' })],
        }),
      },
    },
    scopeA,
    Date.parse('2026-11-22T09:05:01.000Z'),
  );
  assert.equal(allPast.kind, 'STALE');
  assert.equal(allPast.staleReason, 'all_past_deadline');

  // Case 2: Partial parcels cross deadlineAt -> READY with expiredByDeadlineCount = 1.
  const partialPast = riskApi.evaluateRiskViewState(
    {
      scopeKey: scopeA,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          asOf: '2026-11-22T09:00:00.000Z',
          validUntil: '2026-11-22T09:10:00.000Z',
          risks: [
            makeRiskItem({
              fulfillmentOrderId: PARCEL_1,
              deadlineAt: '2026-11-22T09:05:00.000Z',
            }),
            makeRiskItem({
              fulfillmentOrderId: PARCEL_2,
              deadlineAt: '2026-11-22T09:30:00.000Z',
            }),
          ],
        }),
      },
    },
    scopeA,
    Date.parse('2026-11-22T09:05:01.000Z'),
  );
  assert.equal(partialPast.kind, 'READY');
  assert.equal(partialPast.expiredByDeadlineCount, 1);
  assert.equal(partialPast.activeRisks.length, 1);

  // Case 4: Server returns STALE before validUntil with invalidatedSinceAsOf > 0 -> staleReason='invalidated'.
  const invalidatedStale = riskApi.evaluateRiskViewState(
    {
      scopeKey: scopeA,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({
          state: 'STALE',
          asOf: '2026-11-22T09:00:00.000Z',
          validUntil: '2026-11-22T09:10:00.000Z',
          coverage: {
            eligible: 6,
            scored: 6,
            missingCalendar: 0,
            unsupported: 0,
            blocked: 0,
            insufficientData: 0,
            activeOver30Days: 0,
            invalidatedSinceAsOf: 6,
          },
          summary: null,
          risks: [],
        }),
      },
    },
    scopeA,
    Date.parse('2026-11-22T09:04:00.000Z'),
  );
  assert.equal(invalidatedStale.kind, 'STALE');
  assert.equal(invalidatedStale.staleReason, 'invalidated');

  // Case 9: Excluded coverage summary sums missingCalendar + blocked + unsupported + activeOver30Days.
  assert.deepEqual(
    riskApi.summarizeExcludedCoverage({
      eligible: 0,
      scored: 0,
      missingCalendar: 2,
      unsupported: 1,
      blocked: 3,
      insufficientData: 0,
      activeOver30Days: 4,
      invalidatedSinceAsOf: 0,
    }),
    { total: 10, missingCalendar: 2, blocked: 3, unsupported: 1, activeOver30Days: 4 },
  );

  // Case 7: fetchWarehouseOverdueHandoverSummary filters strictly by warehouseId + SLA.HANDOVER_OVERDUE + OPEN/ASSIGNED,
  // deduplicates aggregateId, and reports hasMorePages honestly.
  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url, 'https://app.example.test');
    assert.equal(parsedUrl.pathname, '/api/v1/sla-exceptions');
    assert.equal(parsedUrl.searchParams.get('openOnly'), 'true');
    assert.equal(parsedUrl.searchParams.get('warehouseId'), WAREHOUSE_A);
    assert.equal(parsedUrl.searchParams.get('reasonCode'), 'SLA.HANDOVER_OVERDUE');
    return Response.json({
      success: true,
      data: [
        {
          id: 'e1',
          reasonCode: 'SLA.HANDOVER_OVERDUE',
          status: 'OPEN',
          aggregateId: PARCEL_1,
          warehouseId: WAREHOUSE_A,
        },
        {
          id: 'e2',
          reasonCode: 'SLA.HANDOVER_OVERDUE',
          status: 'ASSIGNED',
          aggregateId: PARCEL_2,
          warehouseId: WAREHOUSE_A,
        },
        {
          id: 'e3',
          reasonCode: 'SLA.TRACKING_STALLED',
          status: 'OPEN',
          aggregateId: PARCEL_3,
          warehouseId: WAREHOUSE_A,
        },
        {
          id: 'e4',
          reasonCode: 'SLA.HANDOVER_OVERDUE',
          status: 'OPEN',
          aggregateId: PARCEL_4,
          warehouseId: WAREHOUSE_B,
        },
      ],
      meta: {
        timestamp: '2026-11-22T09:00:00.000Z',
        path: '',
        requestId: 'req-overdue',
        pagination: { limit: 50, hasNext: true, nextCursor: '2026-11-22T08:00:00.000Z' },
      },
    });
  };
  const overdueSummary = await riskApi.fetchWarehouseOverdueHandoverSummary(WAREHOUSE_A);
  assert.deepEqual(overdueSummary, { count: 2, hasMorePages: true });

  // Case 8: Overdue fetch fails silently on 403/500 without throwing, and scoped controller aborts cross-warehouse race.
  globalThis.fetch = async () =>
    Response.json({ success: false, error: { code: 'AUTH.FORBIDDEN' } }, { status: 403 });
  assert.equal(await riskApi.fetchWarehouseOverdueHandoverSummary(WAREHOUSE_A), null);

  let resolveA;
  let abortedA = false;
  const overdueCtrl = riskApi.createScopedOverdueController(async (wh, signal) => {
    if (wh === WAREHOUSE_A) {
      signal.addEventListener('abort', () => {
        abortedA = true;
      });
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    }
    return { count: 1, hasMorePages: false };
  });
  const pA = overdueCtrl.load(scopeA, WAREHOUSE_A);
  const pB = overdueCtrl.load(scopeB, WAREHOUSE_B);
  assert.equal(abortedA, true);
  resolveA({ count: 9, hasMorePages: false });
  await Promise.all([pA, pB]);
  assert.deepEqual(overdueCtrl.getState(), {
    scopeKey: scopeB,
    status: 'ready',
    count: 1,
    hasMorePages: false,
  });

  // Case 10: Enriched overdue summary captures parcel preview metadata and highlight deep-link path.
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      data: [
        {
          id: 'e-enriched',
          reasonCode: 'SLA.HANDOVER_OVERDUE',
          status: 'OPEN',
          aggregateId: PARCEL_1,
          warehouseId: WAREHOUSE_A,
          fulfillmentOrderId: PARCEL_1,
          orderCode: 'UC166-DEMO-06',
          parcelNo: 1,
          fulfillmentStatus: 'PACKED',
          deadline: '2026-11-22T07:00:00.000Z',
        },
      ],
      meta: {
        timestamp: '2026-11-22T09:00:00.000Z',
        path: '',
        requestId: 'req-overdue-enriched',
        pagination: { limit: 50, hasNext: false, nextCursor: null },
      },
    });
  const enrichedSummary = await riskApi.fetchWarehouseOverdueHandoverSummary(WAREHOUSE_A);
  assert.equal(enrichedSummary.count, 1);
  assert.equal(enrichedSummary.parcels?.length, 1);
  assert.equal(enrichedSummary.parcels?.[0]?.orderCode, 'UC166-DEMO-06');
  assert.equal(enrichedSummary.parcels?.[0]?.parcelNo, 1);
  assert.equal(
    riskApi.buildOverdueExceptionsPath(WAREHOUSE_A, PARCEL_1),
    `/exceptions?warehouse=${WAREHOUSE_A}&reason=SLA.HANDOVER_OVERDUE&highlight=${PARCEL_1}`,
  );
  assert.deepEqual(
    riskApi.formatOverdueElapsedDuration(
      '2026-11-22T07:35:00.000Z',
      Date.parse('2026-11-22T09:00:00.000Z'),
    ),
    { kind: 'hours_minutes', hours: 1, minutes: 25 },
  );
  assert.equal(
    riskApi.formatOverdueElapsedDuration(
      '2026-11-22T09:30:00.000Z',
      Date.parse('2026-11-22T09:00:00.000Z'),
    ),
    null,
  );
});

test('UI2 controlled foreground auto-refresh backoff and UI4 load-more preserves valid rows on transient error', async () => {
  const scopeKey = `mgr:1:${WAREHOUSE_A}`;
  const nowMs = Date.parse('2026-11-22T09:04:00.000Z');
  const readyView = riskApi.evaluateRiskViewState(
    { scopeKey, loading: false, result: { kind: 'ok', data: makePayload() } },
    scopeKey,
    nowMs,
  );
  // Hidden tab -> null (no background polling).
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: readyView,
      isVisible: false,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    null,
  );
  // READY visible -> schedules right after validUntil (6 min = 360_000ms + 1_500ms).
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: readyView,
      isVisible: true,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    361_500,
  );
  // WARMING_UP / STALE -> bounded backoff 15s -> 30s -> 60s -> 120s.
  const warmingView = riskApi.evaluateRiskViewState(
    {
      scopeKey,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({ state: 'WARMING_UP', asOf: null, validUntil: null, risks: [] }),
      },
    },
    scopeKey,
    nowMs,
  );
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: warmingView,
      isVisible: true,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    15_000,
  );
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: warmingView,
      isVisible: true,
      loading: false,
      retryAttempt: 3,
      nowMs,
    }),
    120_000,
  );
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: warmingView,
      isVisible: true,
      loading: false,
      retryAttempt: 99,
      nowMs,
    }),
    120_000,
  );
  // Forbidden / DISABLED -> never auto-refreshes.
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: { kind: 'forbidden' },
      isVisible: true,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    null,
  );

  // Low-1: INSUFFICIENT_DATA enters controlled foreground auto-refresh backoff (paused when hidden).
  const insufficientView = riskApi.evaluateRiskViewState(
    {
      scopeKey,
      loading: false,
      result: {
        kind: 'ok',
        data: makePayload({ state: 'INSUFFICIENT_DATA', asOf: null, validUntil: null, risks: [] }),
      },
    },
    scopeKey,
    nowMs,
  );
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: insufficientView,
      isVisible: true,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    15_000,
  );
  assert.equal(
    riskApi.computeNextAutoRefreshDelayMs({
      view: insufficientView,
      isVisible: false,
      loading: false,
      retryAttempt: 0,
      nowMs,
    }),
    null,
  );

  // Low-2: fetchFulfillmentSlaRisks opts in to includeTargets=true so older strict clients stay compatible.
  let capturedRiskUrl = '';
  globalThis.fetch = async (url) => {
    capturedRiskUrl = String(url);
    return Response.json({
      success: true,
      data: makePayload(),
      meta: { timestamp: '2026-11-22T09:00:00.000Z', path: '', requestId: 'req-targets' },
    });
  };
  await riskApi.fetchFulfillmentSlaRisks(WAREHOUSE_A, 20);
  assert.equal(
    new URL(capturedRiskUrl, 'https://app.example.test').searchParams.get('includeTargets'),
    'true',
  );

  // UI4 + M3: Load-more transient error preserves valid READY rows with loadMoreError=true and
  // loadMoreSucceeded=false (so retry re-requests the SAME limit), then genuine success sets loadMoreSucceeded=true,
  // while 403 still fails closed!
  let step = 0;
  const ctrl = riskApi.createScopedRiskController(
    async () => {
      step += 1;
      if (step === 1) return { kind: 'ok', data: makePayload({ hasMore: true }) };
      if (step === 2) return { kind: 'error' };
      if (step === 3) return { kind: 'ok', data: makePayload({ hasMore: true }) };
      return { kind: 'forbidden' };
    },
    undefined,
    () => nowMs,
  );
  const initialLoad = await ctrl.load(scopeKey, WAREHOUSE_A, 20);
  assert.equal(initialLoad.loadMoreSucceeded, false);

  const afterTransient = await ctrl.load(scopeKey, WAREHOUSE_A, 30, {
    isLoadMore: true,
    preserveOnError: true,
  });
  assert.equal(afterTransient.result.kind, 'ok');
  assert.equal(afterTransient.result.data.risks.length, 1);
  assert.equal(afterTransient.loadMoreError, true);
  assert.equal(afterTransient.loadMoreSucceeded, false);

  const afterRetrySuccess = await ctrl.load(scopeKey, WAREHOUSE_A, 30, {
    isLoadMore: true,
    preserveOnError: true,
  });
  assert.equal(afterRetrySuccess.result.kind, 'ok');
  assert.equal(afterRetrySuccess.loadMoreError, false);
  assert.equal(afterRetrySuccess.loadMoreSucceeded, true);

  const afterForbidden = await ctrl.load(scopeKey, WAREHOUSE_A, 40, {
    isLoadMore: true,
    preserveOnError: true,
  });
  assert.equal(afterForbidden.result.kind, 'forbidden');
  assert.equal(afterForbidden.loadMoreError, false);
  assert.equal(afterForbidden.loadMoreSucceeded, false);
});

test('Gemini display review (Sections 1, 2, 3): framing, dedup facts, 404 parcel eviction, target-change cache invalidation, same-parcel fallback, and composite cursor', async () => {
  // 1. Section 1 & 2: OPEN_PICK_SHORTAGE deduplicates qty when PICK_REMAINING is present; STAGE_AGE formats hours+minutes with asOf clock.
  const shortageFact = {
    factId: 'OPEN_PICK_SHORTAGE',
    kind: 'BLOCKER_EVENT',
    reasonCode: 'OPEN_PICK_SHORTAGE',
    metrics: { remainingPickQty: 15 },
  };
  assert.deepEqual(
    riskApi.resolveFactTranslation(shortageFact, '08:41', 'vi', { hasPickRemainingFact: true }),
    { key: 'facts.OPEN_PICK_SHORTAGE_SIMPLE', values: {} },
  );
  assert.deepEqual(
    riskApi.resolveFactTranslation(shortageFact, '08:41', 'vi', { hasPickRemainingFact: false }),
    { key: 'facts.OPEN_PICK_SHORTAGE', values: { qty: 15 } },
  );

  const stageAgeFact = {
    factId: 'STAGE_AGE_ELEVATED',
    kind: 'SCORE_DRIVER',
    reasonCode: 'STAGE_AGE_ELEVATED',
    metrics: { stage: 'WAITING_PACK', stageAgeMinutes: 202 },
  };
  assert.deepEqual(riskApi.resolveFactTranslation(stageAgeFact, '08:41', 'vi'), {
    key: 'facts.STAGE_AGE_ELEVATED_AT',
    values: { duration: '3 giờ 22 phút', asOf: '08:41' },
    stageKey: 'WAITING_PACK',
  });
  const stageAgeSignal = riskApi.resolvePrimarySignal(
    makeRiskItem({
      stage: 'WAITING_PACK',
      reasons: [
        { code: 'STAGE_AGE_ELEVATED', evidence: { stage: 'WAITING_PACK', stageAgeMinutes: 202 } },
      ],
    }),
    'vi',
  );
  assert.deepEqual(stageAgeSignal, {
    key: 'signals.STAGE_AGE_ELEVATED',
    values: { duration: '3 giờ 22 phút' },
    stageKey: 'WAITING_PACK',
  });

  // 2. Medium #1 + Medium #3: HTTP 404 with SLA_RISK.PARCEL_UNAVAILABLE returns 'parcel_unavailable'
  //    and triggers onParcelUnavailable; GET target change within the same asOf revokes cached POST selection!
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: {
          code: 'SLA_RISK.PARCEL_UNAVAILABLE',
          message: 'SLA risk explanation is unavailable for this parcel.',
        },
      },
      { status: 404 },
    );
  const notFoundRes = await riskApi.fetchFulfillmentSlaRiskExplanation(
    WAREHOUSE_A,
    PARCEL_1,
    '2026-11-22T09:00:00.000Z',
    'vi',
  );
  assert.equal(notFoundRes.kind, 'parcel_unavailable');

  const fakeNow = Date.parse('2026-11-22T09:04:00.000Z');
  const expiresAtMs = Date.parse('2026-11-22T09:10:00.000Z');
  const scopePrefix = `mgr:1:${WAREHOUSE_A}:2026-11-22T09:00:00.000Z`;
  const unavailableIds = [];
  let postCalls = 0;
  const expCtrl = riskApi.createScopedExplanationController(
    async (_wh, parcelId) => {
      postCalls += 1;
      if (parcelId === PARCEL_2) return { kind: 'parcel_unavailable' };
      return { kind: 'ok', data: makeExplanationPayload({ fulfillmentOrderId: parcelId }) };
    },
    {
      onParcelUnavailable: (id) => {
        unavailableIds.push(id);
      },
    },
    () => fakeNow,
  );
  const sigInitial = riskApi.computeParcelTargetSignature(
    makeRiskItem({
      recommendationCode: 'CHECK_PICK_SHORTAGE',
      target: {
        kind: 'picking_shortage_line',
        waveId: WAVE_1,
        waveCode: 'PW-1',
        lineId: LINE_1,
        exceptionId: EXC_1,
      },
    }),
  );
  const sigReplaced = riskApi.computeParcelTargetSignature(
    makeRiskItem({
      recommendationCode: 'REVIEW_PICK_BACKLOG',
      target: {
        kind: 'picking_progress_line',
        waveId: WAVE_1,
        waveCode: 'PW-1',
        lineId: '00000600-0000-4000-8000-000000000099',
      },
    }),
  );
  await expCtrl.request({
    scopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
    targetSignature: sigInitial,
  });
  assert.equal(postCalls, 1);
  assert.ok(expCtrl.getEntries()[`${scopePrefix}:${PARCEL_1}`]);
  // GET refreshes within same asOf with replaced target -> cached POST entry MUST be evicted!
  expCtrl.reconcileItems(scopePrefix, { [PARCEL_1]: sigReplaced });
  assert.equal(expCtrl.getEntries()[`${scopePrefix}:${PARCEL_1}`], undefined);

  // POST 404 calls onParcelUnavailable immediately!
  await expCtrl.request({
    scopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_2,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs,
    locale: 'vi',
  });
  assert.deepEqual(unavailableIds, [PARCEL_2]);

  // 3. Structural guarantees in Panel, PickingWorkspace, ShipmentSchema, and i18n copy:
  const panelSource = readFileSync(
    new URL('../src/features/orders/components/FulfillmentSlaRiskPanel.tsx', import.meta.url),
    'utf8',
  );
  const pickingSource = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));

  // Section 1 & Medium #2: Distinct Gemini/ORCA frame BEFORE lead sentence; Warehouse data & ORCA
  // forecast OUTSIDE frame; while checking options keep ORCA visible (NEVER label Gemini prematurely).
  assert.ok(panelSource.includes('data-suggestion-frame={sourceKind}'));
  assert.ok(panelSource.includes("data-suggestion-loading={isCheckingOptions ? 'true' : 'false'}"));
  assert.ok(panelSource.includes('data-warehouse-facts="true"'));
  assert.ok(panelSource.includes('data-orca-forecast="true"'));
  assert.ok(panelSource.includes('data-cta-source="GEMINI"'));
  assert.equal(panelSource.includes("sourceKind === 'GEMINI' || isLoadingGemini"), false);
  assert.ok(
    panelSource.indexOf('data-suggestion-frame={sourceKind}') <
      panelSource.indexOf('data-warehouse-facts="true"'),
  );
  assert.ok(
    panelSource.indexOf('data-warehouse-facts="true"') <
      panelSource.indexOf('data-orca-forecast="true"'),
  );
  // Medium #1: Valid empty POST facts honored without falling back to localExplanation.facts.
  assert.ok(
    panelSource.includes(
      'const displayFacts = verifiedRemote ? verifiedRemote.facts : localExplanation.facts',
    ),
  );
  // Section 2: No double "kiểm định" in probability labels.
  assert.equal(vi.FulfillmentSlaRisk.sourceCalibrated.includes('kiểm định'), false);
  assert.equal(vi.FulfillmentSlaRisk.probabilityValue.includes('kiểm định'), false);
  // High #3: PickingWorkspace propagates fulfillmentOrderId, forces live detail fetch on click,
  // and restricts fallback lines strictly to the SAME parcel.
  assert.ok(pickingSource.includes('fulfillmentOrderId: target.fulfillmentOrderId'));
  assert.ok(pickingSource.includes('setDeepLinkFetchSeq(nextFetchSeq)'));
  assert.ok(
    pickingSource.includes('loadedDetailSeqRef.current < pendingDeepLink.requiredFetchSeq'),
  );
  assert.ok(pickingSource.includes('isSameParcelLine'));

  // Medium #2: Composite (timestamp|uuid) cursor accepted by slaExceptionPageSchema alongside legacy timestamp cursor.
  const shipmentSchemas = await server.ssrLoadModule(
    '/src/features/shipments/schemas/shipmentSchema.ts',
  );
  const parsedComposite = shipmentSchemas.slaExceptionPageSchema.parse({
    items: [],
    pagination: {
      limit: 50,
      hasNext: true,
      nextCursor: '2026-11-23T01:00:00.000Z|00000000-0000-4000-8000-000000000101',
    },
  });
  assert.equal(
    parsedComposite.pagination.nextCursor,
    '2026-11-23T01:00:00.000Z|00000000-0000-4000-8000-000000000101',
  );
  const parsedLegacy = shipmentSchemas.slaExceptionPageSchema.parse({
    items: [],
    pagination: {
      limit: 50,
      hasNext: true,
      nextCursor: '2026-11-23T01:00:00.000Z',
    },
  });
  assert.equal(parsedLegacy.pagination.nextCursor, '2026-11-23T01:00:00.000Z');
});

test('Manager & time review (2026-11-23): token-structured Gemini patterns, High #1 regressions, fake-clock drift, alternate-target token eviction, 404 code split, strict UUID deep-link', async () => {
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));

  // 1. Section 2 & 4: Two valid Vietnamese & English Gemini phrasing patterns render naturally
  //    to the exact same verified action & reason (zero digits, zero countdown).
  const actionVi = vi.FulfillmentSlaRisk.adviceActions.VIEW_OPEN_SHORTAGE_LINE;
  const reasonVi = vi.FulfillmentSlaRisk.adviceReasons.SHORTAGE_OPEN;
  const renderedVi1 = riskApi.renderGroundedAdvicePattern(
    'Bạn nên {{action}} trước. {{reason}}',
    actionVi,
    reasonVi,
    'vi',
  );
  const renderedVi2 = riskApi.renderGroundedAdvicePattern(
    '{{reason}} Bạn có thể {{action}} để kiểm tra.',
    actionVi,
    reasonVi,
    'vi',
  );
  assert.equal(
    renderedVi1,
    'Bạn nên mở dòng báo thiếu trước. Phiếu báo thiếu vẫn đang mở tại đợt soạn.',
  );
  assert.equal(
    renderedVi2,
    'Phiếu báo thiếu vẫn đang mở tại đợt soạn. Bạn có thể mở dòng báo thiếu để kiểm tra.',
  );
  assert.equal(/\d/.test(renderedVi1), false);
  assert.equal(/\d/.test(renderedVi2), false);

  const actionEn = en.FulfillmentSlaRisk.adviceActions.VIEW_OPEN_SHORTAGE_LINE;
  const reasonEn = en.FulfillmentSlaRisk.adviceReasons.SHORTAGE_OPEN;
  assert.equal(
    riskApi.renderGroundedAdvicePattern(
      'You should {{action}} first. {{reason}}',
      actionEn,
      reasonEn,
      'en',
    ),
    'You should open the shortage line first. An open shortage exception is active in this wave.',
  );
  assert.equal(
    riskApi.renderGroundedAdvicePattern(
      '{{reason}} You can {{action}} to check.',
      actionEn,
      reasonEn,
      'en',
    ),
    'An open shortage exception is active in this wave. You can open the shortage line to check.',
  );

  // Historical benchmark comparison only appears when COHORT_BENCHMARK is present & tight!
  assert.equal(
    riskApi.resolveAdviceReasonKey('SHORTAGE_WITH_TIME_PRESSURE', [
      {
        factId: 'OPEN_PICK_SHORTAGE',
        kind: 'BLOCKER_EVENT',
        reasonCode: 'OPEN_PICK_SHORTAGE',
        metrics: { remainingPickQty: 15 },
      },
      {
        factId: 'TIME_REMAINING',
        kind: 'SCORE_DRIVER',
        reasonCode: 'SHORT_TIME_TO_CUTOFF',
        metrics: { minutesRemaining: 30 },
      },
      {
        factId: 'COHORT_BENCHMARK',
        kind: 'SCORE_DRIVER',
        reasonCode: 'SHORT_TIME_TO_CUTOFF',
        metrics: { p50Minutes: 45, p80Minutes: 70 },
      },
    ]),
    'SHORTAGE_WITH_BENCHMARK_TIGHT',
  );
  assert.equal(
    riskApi.resolveAdviceReasonKey('SHORTAGE_WITH_TIME_PRESSURE', [
      {
        factId: 'OPEN_PICK_SHORTAGE',
        kind: 'BLOCKER_EVENT',
        reasonCode: 'OPEN_PICK_SHORTAGE',
        metrics: { remainingPickQty: 15 },
      },
    ]),
    'SHORTAGE_OPEN',
  );

  // 2. High #1: All 6 business-wrong regression cases (3 vi + 3 en) + token/digit/locale violations rejected -> null (fallback to ORCA)!
  for (const badVi of [
    'Kiện bị thiếu 15 sản phẩm, hãy đóng gói ngay',
    'Kiện còn 89 giờ tới hạn',
    'Hãy bỏ qua phiếu báo thiếu và xác nhận bàn giao',
    'Bạn nên {{action}} rồi đóng gói ngay. {{reason}}',
    'Hãy bỏ qua phiếu báo thiếu và {{action}}, rồi xác nhận bàn giao. {{reason}}',
    'Kiện còn 89 giờ, {{action}}. {{reason}}',
    'Bạn nên {{action}} trước.',
    'You should {{action}} first. {{reason}}',
  ]) {
    assert.equal(
      riskApi.renderGroundedAdvicePattern(badVi, actionVi, reasonVi, 'vi'),
      null,
      `Expected Vietnamese bad pattern to be rejected: ${badVi}`,
    );
  }
  for (const badEn of [
    'Parcel is short 15 units, pack it now',
    'Parcel has 89 hours left until cutoff',
    'Ignore the shortage exception and confirm handover',
    'You should {{action}} and pack it now. {{reason}}',
    'Ignore the shortage and {{action}}, confirm handover. {{reason}}',
    'Parcel has 89 hours left, {{action}}. {{reason}}',
    'You should {{action}} first.',
    'Bạn nên {{action}} trước. {{reason}}',
  ]) {
    assert.equal(
      riskApi.renderGroundedAdvicePattern(badEn, actionEn, reasonEn, 'en'),
      null,
      `Expected English bad pattern to be rejected: ${badEn}`,
    );
  }

  // 3. Medium #1 (Fake clock across minute tick & past deadline while detail stays open):
  //    Row countdown updates live while Gemini rendered sentence has ZERO stale countdown;
  //    once clock crosses deadlineAt, item leaves activeRisks immediately!
  const tStart = Date.parse('2026-11-23T10:00:00.000Z'); // 17:00 VN
  const tDeadline = '2026-11-23T11:30:00.000Z'; // 18:30 VN (90 min)
  const snap = {
    scopeKey: 'mgr:1:wh',
    loading: false,
    result: {
      kind: 'ok',
      data: makePayload({
        asOf: '2026-11-23T09:58:00.000Z',
        validUntil: '2026-11-23T12:00:00.000Z',
        risks: [
          makeRiskItem({
            deadlineAt: tDeadline,
            reasons: [
              { code: 'OPEN_PICK_SHORTAGE', evidence: { remainingPickQty: 15 } },
              { code: 'PICK_REMAINING', evidence: { remainingPickQty: 15, distinctSkuCount: 2 } },
            ],
          }),
        ],
      }),
    },
  };
  assert.deepEqual(riskApi.formatRemainingDuration(tDeadline, tStart + 60_000), {
    kind: 'hours_minutes',
    hours: 1,
    minutes: 29,
  });
  assert.deepEqual(riskApi.formatRemainingDuration(tDeadline, tStart + 120_000), {
    kind: 'hours_minutes',
    hours: 1,
    minutes: 28,
  });
  // Gemini advice contains zero countdown digits, so its meaning stays 100% accurate across ticks:
  assert.equal(/\d/.test(renderedVi1), false);
  // Once clock passes deadlineAt (18:30:01 VN), parcel disappears & view turns STALE(all_past_deadline):
  const pastDeadlineView = riskApi.evaluateRiskViewState(
    snap,
    'mgr:1:wh',
    Date.parse(tDeadline) + 1_000,
  );
  assert.equal(pastDeadlineView.kind, 'STALE');
  assert.equal(pastDeadlineView.staleReason, 'all_past_deadline');

  // 4. Medium #3: Alternate-target change invalidates cached POST entry via targetStateToken
  //    even when default GET target, recommendationCode, and reasons remain IDENTICAL!
  const defaultTarget = {
    kind: 'picking_shortage_line',
    waveId: WAVE_1,
    waveCode: 'PW-1',
    lineId: LINE_1,
    exceptionId: EXC_1,
  };
  const sigAltBefore = riskApi.computeParcelTargetSignature(
    makeRiskItem({
      recommendationCode: 'CHECK_PICK_SHORTAGE',
      target: defaultTarget,
      targetStateToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }),
  );
  const sigAltAfter = riskApi.computeParcelTargetSignature(
    makeRiskItem({
      recommendationCode: 'CHECK_PICK_SHORTAGE',
      target: defaultTarget,
      targetStateToken: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }),
  );
  assert.notEqual(sigAltBefore, sigAltAfter);

  // 5. Medium #3: Generic 404 (undeployed route) returns 'unavailable' (does NOT hide valid parcel),
  //    while explicit 404 with SLA_RISK.PARCEL_UNAVAILABLE returns 'parcel_unavailable'.
  globalThis.fetch = async () =>
    Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Cannot POST' } },
      { status: 404 },
    );
  const generic404 = await riskApi.fetchFulfillmentSlaRiskExplanation(
    WAREHOUSE_A,
    PARCEL_1,
    '2026-11-22T09:00:00.000Z',
    'vi',
  );
  assert.equal(generic404.kind, 'unavailable');

  // 6. Medium #3: PickingWorkspace strictly requires UUID parity on both direct lineId hit
  //    and fallback (never matching display orderCode + parcelNo across sellers).
  const pickingSource = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  assert.equal(pickingSource.includes('candidate.orderCode === referenceLine.orderCode'), false);
  assert.ok(pickingSource.includes('!targetLine.fulfillmentOrderId'));
  assert.ok(
    pickingSource.includes('targetLine.fulfillmentOrderId !== pendingDeepLink.fulfillmentOrderId'),
  );

  // 7. Medium #4: Microsecond composite cursor (.123456Z|uuid) accepted by slaExceptionPageSchema.
  const shipmentSchemas = await server.ssrLoadModule(
    '/src/features/shipments/schemas/shipmentSchema.ts',
  );
  const parsedUs = shipmentSchemas.slaExceptionPageSchema.parse({
    items: [],
    pagination: {
      limit: 50,
      hasNext: true,
      nextCursor: '2026-11-23T01:00:00.123456Z|00006891-0000-4000-8000-000000000006',
    },
  });
  assert.equal(
    parsedUs.pagination.nextCursor,
    '2026-11-23T01:00:00.123456Z|00006891-0000-4000-8000-000000000006',
  );

  // 8. Transient TEMPLATE fallback retries on re-open while verified GEMINI results stay cached.
  const retryScopePrefix = `mgr:1:${WAREHOUSE_A}:2026-11-22T09:00:00.000Z`;
  const retryNow = Date.parse('2026-11-22T09:04:00.000Z');
  const retryExpiry = Date.parse('2026-11-22T09:10:00.000Z');
  let retryCalls = 0;
  const observedLoadingSnapshots = [];
  const retryCtrl = riskApi.createScopedExplanationController(
    async () => {
      retryCalls += 1;
      if (retryCalls === 1) {
        return {
          kind: 'ok',
          data: makeExplanationPayload({ source: 'TEMPLATE', advicePattern: null }),
        };
      }
      return {
        kind: 'ok',
        data: makeExplanationPayload({
          source: 'GEMINI',
          advicePattern: 'Bạn nên {{action}} lúc này. {{reason}}',
        }),
      };
    },
    {
      onChange: (entries) => {
        const entry = entries[`${retryScopePrefix}:${PARCEL_1}`];
        if (entry) {
          observedLoadingSnapshots.push({
            loading: entry.loading,
            source: entry.data?.source ?? null,
          });
        }
      },
    },
    () => retryNow,
  );
  const firstFallback = await retryCtrl.request({
    scopePrefix: retryScopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs: retryExpiry,
    locale: 'vi',
    targetSignature: 'sig-1',
  });
  assert.equal(firstFallback?.data?.source, 'TEMPLATE');
  assert.equal(retryCalls, 1);

  // Re-opening after transient TEMPLATE fallback MUST retry while keeping prior TEMPLATE visible!
  const afterRetry = await retryCtrl.request({
    scopePrefix: retryScopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs: retryExpiry,
    locale: 'vi',
    targetSignature: 'sig-1',
  });
  assert.equal(afterRetry?.data?.source, 'GEMINI');
  assert.equal(retryCalls, 2);
  assert.deepEqual(observedLoadingSnapshots[2], { loading: true, source: 'TEMPLATE' });

  // Once GEMINI succeeded, subsequent re-opens stay cached (0 additional POST calls).
  const cachedGemini = await retryCtrl.request({
    scopePrefix: retryScopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs: retryExpiry,
    locale: 'vi',
    targetSignature: 'sig-1',
  });
  assert.equal(cachedGemini?.data?.source, 'GEMINI');
  assert.equal(retryCalls, 2);

  // 9. Explicit forceRefresh ("Diễn đạt lại") bypasses GEMINI cache, sends regenerate: true,
  //    preserves prior GEMINI wording while loading, and updates to the fresh phrasing.
  let capturedRegenerateFlag = null;
  const rephraseCtrl = riskApi.createScopedExplanationController(
    async (_wh, _id, _asOf, _locale, _signal, options) => {
      capturedRegenerateFlag = options?.regenerate ?? false;
      return {
        kind: 'ok',
        data: makeExplanationPayload({
          source: 'GEMINI',
          advicePattern: options?.regenerate
            ? '{{reason}} Bạn ưu tiên {{action}} sớm nhé.'
            : 'Bạn nên {{action}} lúc này. {{reason}}',
        }),
      };
    },
    undefined,
    () => retryNow,
  );
  const initialGemini = await rephraseCtrl.request({
    scopePrefix: retryScopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs: retryExpiry,
    locale: 'vi',
    targetSignature: 'sig-1',
  });
  assert.equal(capturedRegenerateFlag, false);
  assert.equal(initialGemini?.data?.advicePattern, 'Bạn nên {{action}} lúc này. {{reason}}');

  const rephrasedGemini = await rephraseCtrl.request({
    scopePrefix: retryScopePrefix,
    warehouseId: WAREHOUSE_A,
    fulfillmentOrderId: PARCEL_1,
    asOf: '2026-11-22T09:00:00.000Z',
    expiresAtMs: retryExpiry,
    locale: 'vi',
    targetSignature: 'sig-1',
    forceRefresh: true,
  });
  assert.equal(capturedRegenerateFlag, true);
  assert.equal(rephrasedGemini?.data?.advicePattern, '{{reason}} Bạn ưu tiên {{action}} sớm nhé.');

  const panelSourceAfter = readFileSync(
    new URL('../src/features/orders/components/FulfillmentSlaRiskPanel.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(panelSourceAfter.includes('handleRephraseParcel'));
  assert.ok(panelSourceAfter.includes("t('rephraseAction')"));
});
