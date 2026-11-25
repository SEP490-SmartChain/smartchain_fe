import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, remittance, payout, dispute, store, loadRemittanceSources;
const originalFetch = globalThis.fetch;
const id = '10120001-0000-4000-8000-000000000001';
const response = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-11-22T00:00:00Z', path: '', requestId: 'synthetic' },
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
  ({ carrierSettlementApi: api } = await server.ssrLoadModule(
    '/src/features/reconciliation/api/carrierSettlementApi.ts',
  ));
  ({ loadRemittanceSources } = await server.ssrLoadModule(
    '/src/features/reconciliation/api/carrierSettlementApi.ts',
  ));
  ({ remittanceSchema: remittance } = await server.ssrLoadModule(
    '/src/features/reconciliation/schemas/remittanceSchema.ts',
  ));
  payout = await server.ssrLoadModule('/src/features/tenants/schemas/payoutSchema.ts');
  ({ disputeUpdateSchema: dispute } = await server.ssrLoadModule(
    '/src/features/reconciliation/schemas/settlementReviewSchema.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ACCOUNTANT'],
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

test('manual bank evidence sends exact integer money and the retained receipt reference', async () => {
  const body = {
    bankReference: 'synthetic-bank-1',
    amountVnd: '9007199254740993',
    receivedAt: '2026-11-21T02:00:00Z',
    evidenceRef: 'synthetic-bank.pdf',
  };
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), new RegExp(`/settlement-batches/${id}/remittances$`));
    assert.deepEqual(JSON.parse(init.body), body);
    return response({ id, isReplay: false });
  };
  assert.deepEqual(await api.linkRemittance(id, body), { id, isReplay: false });
});

test('linked bank evidence stays available when the independent SePay lookup fails', async () => {
  const receipt = {
    id,
    bankReference: 'synthetic-bank-1',
    amountVnd: '9007199254740993',
    receivedAt: '2026-11-21T02:00:00Z',
    evidenceRef: 'synthetic-bank.pdf',
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/sepay/unmatched')) throw new Error('Synthetic SePay outage');
    return response([receipt]);
  };
  const result = await loadRemittanceSources(id);
  assert.equal(result.receipts.status, 'fulfilled');
  assert.deepEqual(result.receipts.value, [receipt]);
  assert.equal(result.sepay.status, 'rejected');
});

test('failed linked-evidence lookup remains an error while SePay data is independently readable', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/remittances')) throw new Error('Synthetic receipt outage');
    return Response.json({
      success: true,
      data: [],
      meta: { pagination: { limit: 20, hasNext: false, nextCursor: null } },
    });
  };
  const result = await loadRemittanceSources(id);
  assert.equal(result.receipts.status, 'rejected');
  assert.equal(result.sepay.status, 'fulfilled');
  assert.deepEqual(result.sepay.value.items, []);
});

test('SePay linking sends persisted notification identity without a client amount', async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/sepay-remittances$/);
    assert.deepEqual(JSON.parse(init.body), { notificationId: id });
    return response({ id, isReplay: true });
  };
  assert.equal((await api.linkRemittance(id, { notificationId: id })).isReplay, true);
});

test('bank form rejects fractional, negative and oversized VND', () => {
  const valid = {
    source: 'MANUAL',
    bankReference: 'synthetic',
    amountVnd: '1000',
    receivedAt: '2026-11-21T09:00',
    evidenceRef: 'bank.pdf',
  };
  assert.equal(remittance.safeParse(valid).success, true);
  for (const amountVnd of ['10.5', '-1', '0', '1'.repeat(19)])
    assert.equal(remittance.safeParse({ ...valid, amountVnd }).success, false);
  assert.equal(remittance.safeParse({ source: 'SEPAY', notificationId: 'fake' }).success, false);
});

test('COD resolution retains allocations and refuses missing per-row agreed amounts', () => {
  const valid = {
    status: 'RESOLVED',
    externalTicketRef: '',
    resolvedAmountVnd: '200000',
    note: 'synthetic agreement',
    codResolutions: [{ rowNumber: 1, amountVnd: '200000' }],
  };
  assert.deepEqual(dispute.parse(valid).codResolutions, valid.codResolutions);
  assert.equal(
    dispute.safeParse({ ...valid, codResolutions: [{ rowNumber: 1, amountVnd: '' }] }).success,
    false,
  );
});

test('approval window includes Thursday and closes exactly at the next Monday cutoff', () => {
  const row = { cutoffAt: '2026-11-01T23:00:00Z', reviewDeadlineAt: '2026-11-03T17:00:00Z' };
  assert.equal(payout.payoutApprovalOpen(row, new Date('2026-11-03T16:59:59Z')), false);
  assert.equal(payout.payoutApprovalOpen(row, new Date('2026-11-05T02:00:00Z')), true);
  assert.equal(payout.payoutApprovalOpen(row, new Date('2026-11-08T23:00:00Z')), false);
});
