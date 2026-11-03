import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server,
  review,
  shipment,
  policy,
  shipmentApi,
  carrierSettlementApi,
  sepayReconciliationApi,
  auth;
const originalFetch = globalThis.fetch;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  review = await server.ssrLoadModule(
    '/src/features/reconciliation/schemas/settlementReviewSchema.ts',
  );
  shipment = await server.ssrLoadModule('/src/features/shipments/schemas/shipmentSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ shipmentApi } = await server.ssrLoadModule('/src/features/shipments/api/shipmentApi.ts'));
  ({ carrierSettlementApi } = await server.ssrLoadModule(
    '/src/features/reconciliation/api/carrierSettlementApi.ts',
  ));
  ({ sepayReconciliationApi } = await server.ssrLoadModule(
    '/src/features/reconciliation/api/sepayReconciliationApi.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('Reconciliation and SLA paginated screens read rows from data and cursor metadata from meta.pagination', async () => {
  const userId = uuid(90);
  auth.getState().setSession({
    accessToken: 'synthetic-test-token',
    expiresIn: 900,
    user: {
      userId,
      tenantId: null,
      actorScope: 'PLATFORM',
      email: 'accountant@example.test',
      fullName: 'Accountant',
      roles: ['ORCA_ACCOUNTANT'],
      permissions: [],
      warehouseIds: [],
    },
  });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({
      success: true,
      data: [],
      meta: {
        timestamp: '2026-10-22T01:00:00.000Z',
        path: String(url),
        requestId: 'ss-1324-page-contract',
        pagination: { limit: 20, hasNext: false, nextCursor: null },
      },
    });
  };

  assert.deepEqual(await shipmentApi.slaExceptions(true, null), {
    items: [],
    pagination: { limit: 20, hasNext: false, nextCursor: null },
  });
  assert.deepEqual(await carrierSettlementApi.list(null), {
    items: [],
    pagination: { limit: 20, hasNext: false, nextCursor: null },
  });
  assert.deepEqual(await carrierSettlementApi.disputes({}), {
    items: [],
    pagination: { limit: 20, hasNext: false, nextCursor: null },
  });
  assert.deepEqual(await sepayReconciliationApi.unmatched(null), {
    items: [],
    pagination: { limit: 20, hasNext: false, nextCursor: null },
  });
  assert.equal(calls.length, 4);
});

test('UC-141 manual match accepts only rows the API can match and validates the waybill', () => {
  assert.equal(review.isManuallyMatchable('NOT_FOUND'), true);
  assert.equal(review.isManuallyMatchable('AMBIGUOUS'), true);
  for (const status of ['AUTO_MATCHED', 'MANUALLY_MATCHED', 'RETURN', 'INVALID'])
    assert.equal(review.isManuallyMatchable(status), false, status);
  assert.deepEqual(
    review.manualMatchSchema.parse({ trackingNumber: ' GHN-1 ', reason: ' Typo ' }),
    { trackingNumber: 'GHN-1', reason: 'Typo' },
  );
  for (const input of [
    { trackingNumber: 'GHN 1', reason: 'Typo' },
    { trackingNumber: 'x'.repeat(65), reason: 'Typo' },
    { trackingNumber: 'GHN-1', reason: 'no' },
  ])
    assert.equal(review.manualMatchSchema.safeParse(input).success, false);
});

test('UC-143 disputable rows exclude INVALID evidence and clean matches', () => {
  assert.equal(
    review.isDisputable({ matchStatus: 'NOT_FOUND', discrepancies: ['NOT_FOUND'] }),
    true,
  );
  assert.equal(
    review.isDisputable({ matchStatus: 'AUTO_MATCHED', discrepancies: ['OVERCHARGED'] }),
    true,
  );
  assert.equal(review.isDisputable({ matchStatus: 'AUTO_MATCHED', discrepancies: [] }), false);
  assert.equal(
    review.isDisputable({ matchStatus: 'INVALID', discrepancies: ['INVALID_ROW:AMOUNT'] }),
    false,
  );
});

test('UC-143 dispute state machine mirrors the server transitions', () => {
  assert.deepEqual(review.nextDisputeStatuses('OPEN'), ['SUBMITTED', 'RESOLVED', 'REJECTED']);
  assert.deepEqual(review.nextDisputeStatuses('SUBMITTED'), [
    'ACKNOWLEDGED',
    'RESOLVED',
    'REJECTED',
  ]);
  assert.deepEqual(review.nextDisputeStatuses('ACKNOWLEDGED'), ['RESOLVED', 'REJECTED']);
  assert.deepEqual(review.nextDisputeStatuses('RESOLVED'), []);
  assert.deepEqual(review.nextDisputeStatuses('REJECTED'), []);
});

test('UC-143 update form needs a note without a status and an integer amount to resolve', () => {
  const base = { status: '', externalTicketRef: '', resolvedAmountVnd: '', note: '' };
  assert.equal(review.disputeUpdateSchema.safeParse(base).success, false);
  assert.equal(review.disputeUpdateSchema.safeParse({ ...base, note: 'Called GHN' }).success, true);
  assert.equal(
    review.disputeUpdateSchema.safeParse({ ...base, status: 'RESOLVED' }).success,
    false,
  );
  assert.equal(
    review.disputeUpdateSchema.safeParse({ ...base, status: 'RESOLVED', resolvedAmountVnd: '10.5' })
      .success,
    false,
  );
  assert.deepEqual(
    review.disputeUpdateSchema.parse({ ...base, status: 'RESOLVED', resolvedAmountVnd: '21000' }),
    {
      status: 'RESOLVED',
      externalTicketRef: undefined,
      resolvedAmountVnd: '21000',
      note: undefined,
    },
  );
});

test('dispute responses keep exact VND strings and reject unknown statuses', () => {
  const dispute = {
    id: uuid(1),
    code: 'CD-20261022-ABCDEF12',
    carrierCode: 'GHN',
    batchId: uuid(2),
    status: 'OPEN',
    claimedAmountVnd: '123456789012345678',
    resolvedAmountVnd: null,
    externalTicketRef: null,
    records: 2,
    version: 1,
    createdAt: '2026-10-22T01:00:00.000Z',
    updatedAt: '2026-10-22T01:00:00.000Z',
  };
  assert.equal(review.disputeSchema.parse(dispute).claimedAmountVnd, '123456789012345678');
  assert.equal(review.disputeSchema.safeParse({ ...dispute, status: 'PAID' }).success, false);
  assert.equal(
    review.disputeSchema.safeParse({ ...dispute, claimedAmountVnd: 1.5 }).success,
    false,
  );
});

test('UC-104 SLA breach projection drops unexpected financial or recipient fields', () => {
  const breach = {
    id: uuid(3),
    reasonCode: 'SLA.TRACKING_STALLED',
    status: 'OPEN',
    aggregateType: 'shipment',
    aggregateId: uuid(4),
    warehouseId: uuid(5),
    warehouseCode: 'HCM-01',
    trackingNumber: 'GHN-1',
    readyAt: null,
    deadline: null,
    lastProgressAt: '2026-10-20T01:00:00.000Z',
    stallHours: 48,
    isAssigned: false,
    isAssignedToMe: false,
    resolution: null,
    createdAt: '2026-10-22T01:00:00.000Z',
    updatedAt: '2026-10-22T01:00:00.000Z',
  };
  assert.deepEqual(
    shipment.slaExceptionSchema.parse({ ...breach, codAmount: '100000', recipientPhone: 'x' }),
    breach,
  );
  assert.equal(
    shipment.slaExceptionSchema.safeParse({ ...breach, resolution: 'MANUAL:someone' }).success,
    false,
  );
});

test('UC-104 queue is visible to Admin/Ops/Manager; only Admin/Ops take ownership', () => {
  assert.equal(policy.can(['WAREHOUSE_MANAGER'], 'shipments.sla.view'), true);
  assert.equal(policy.can(['WAREHOUSE_MANAGER'], 'shipments.sla.assign'), false);
  for (const role of ['WAREHOUSE_STAFF', 'ORCA_ACCOUNTANT', 'SELLER_OWNER', 'SELLER_STAFF'])
    assert.equal(policy.can([role], 'shipments.sla.view'), false, role);
  assert.equal(policy.can(['OPS_DISPATCHER', 'SELLER_OWNER'], 'shipments.sla.view'), false);
});
