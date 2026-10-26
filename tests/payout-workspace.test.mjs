import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schemas, policy, store;
const originalFetch = globalThis.fetch;
const id = '10120001-0000-4000-8000-000000000001';
const deadline = '2026-11-03T17:00:00Z';
const row = {
  id,
  tenantId: id,
  status: 'SENT',
  version: 2,
  periodStart: '2026-10-26',
  periodEnd: '2026-11-02',
  cutoffAt: '2026-11-01T23:00:00Z',
  reviewDeadlineAt: deadline,
  eligibleAmountVnd: '9007199254740993',
  openingBalanceVnd: '0',
  closingBalanceVnd: '9007199254740993',
  approvedAmountVnd: null,
  sentAt: '2026-11-02T02:00:00Z',
  confirmedAt: null,
  approvedAt: null,
  closedAt: null,
  isLegacy: false,
};
const page = { limit: 20, hasNext: false, nextCursor: null };
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: deadline,
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
  ({ payoutApi: api } = await server.ssrLoadModule('/src/features/tenants/api/payoutApi.ts'));
  schemas = await server.ssrLoadModule('/src/features/tenants/schemas/payoutSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
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
test('Owner reads exact-money statements and cursor metadata without supplying tenant authority', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith('/v1/billing/statements'));
    return ok([row], page);
  };
  const result = await api.list({});
  assert.equal(result.items[0].eligibleAmountVnd, '9007199254740993');
  assert.deepEqual(result.pagination, page);
});
test('rejects numeric money and unknown financial state before rendering', async () => {
  globalThis.fetch = async () => ok([{ ...row, eligibleAmountVnd: 1000 }], page);
  await assert.rejects(api.list({}));
  globalThis.fetch = async () => ok([{ ...row, status: 'TRANSFER_ASSUMED' }], page);
  await assert.rejects(api.list({}));
});
test('strips private or purchase-only fields from the financial projection', () => {
  const parsed = schemas.payoutStatementSchema.parse({
    ...row,
    evidenceKey: 'private-marker',
    carrierPurchaseCost: 'private-marker',
  });
  assert.ok(!JSON.stringify(parsed).includes('private-marker'));
});
test('keeps Owner review and Accountant money decisions separate for all seven roles', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    const roles = policy.getEffectiveRoles(
      [role],
      role.startsWith('SELLER_') ? 'TENANT' : 'PLATFORM',
    );
    assert.equal(policy.can(roles, 'statement.review'), role === 'SELLER_OWNER', role);
    assert.equal(policy.can(roles, 'payout.manage'), role === 'ORCA_ACCOUNTANT', role);
  }
  for (const roles of [
    policy.getEffectiveRoles(['SELLER_OWNER', 'ORCA_ACCOUNTANT'], 'TENANT'),
    policy.getEffectiveRoles(['SELLER_OWNER'], null),
    policy.getEffectiveRoles(['TENANT_OWNER'], 'TENANT'),
  ]) {
    assert.equal(policy.can(roles, 'statement.review'), false);
    assert.equal(policy.can(roles, 'payout.manage'), false);
  }
});
test('closes review at exactly Wednesday midnight in Vietnam and preserves legacy read-only state', () => {
  assert.equal(schemas.payoutReviewOpen(row, new Date('2026-11-03T16:59:59.999Z')), true);
  assert.equal(schemas.payoutReviewOpen(row, new Date(deadline)), false);
  assert.equal(schemas.payoutReviewOpen({ ...row, isLegacy: true }, new Date('2026-11-02')), false);
  assert.equal(schemas.vietnamWednesday(new Date(deadline)), true);
  assert.equal(schemas.vietnamWednesday(new Date('2026-11-04T17:00:00Z')), false);
});
test('reuses caller operation identity and immutable version for a retry after a lost response', async () => {
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw new TypeError('Synthetic lost response');
    return ok({ statementId: id, status: 'CONFIRMED', version: 3 });
  };
  const command = { operationKey: id, version: 2 };
  await assert.rejects(api.command(id, 'confirm', command));
  assert.equal((await api.command(id, 'confirm', command)).status, 'CONFIRMED');
  assert.deepEqual(bodies, [command, command]);
});
test('disputes a specific source line without supplying a client amount', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith(`/statements/${id}/lines/${id}/disputes`));
    assert.deepEqual(JSON.parse(options.body), {
      operationKey: id,
      version: 2,
      reason: 'Incorrect fee',
    });
    return ok({ statementId: id, status: 'SENT', version: 2, disputeId: id });
  };
  await api.command(
    id,
    'dispute',
    { operationKey: id, version: 2, reason: 'Incorrect fee' },
    undefined,
    id,
  );
});
test('keeps 403 and stale-version 409 as business errors without clearing the session', async () => {
  for (const [status, code] of [
    [403, 'AUTH.FORBIDDEN'],
    [409, 'COMMERCIAL.PAYOUT_VERSION_CONFLICT'],
  ]) {
    globalThis.fetch = async () =>
      Response.json(
        {
          success: false,
          error: { code, message: 'Synthetic denial', statusCode: status },
          meta: {},
        },
        { status },
      );
    await assert.rejects(
      api.command(id, 'confirm', { operationKey: id, version: 2 }),
      (error) => error.code === code && error.status === status,
    );
    assert.equal(store.getState().user.userId, id);
  }
});
test('preserves the explicit authorized platform seller filter and abort signal', async () => {
  const abort = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith(`tenantId=${id}`));
    assert.equal(options.signal, abort.signal);
    return ok(row);
  };
  await api.detail(id, id, abort.signal);
});
test('validates dispute reasons and exact signed correction amounts', () => {
  assert.equal(schemas.payoutReasonSchema.safeParse({ reason: '  x  ' }).success, false);
  assert.equal(
    schemas.payoutResolutionSchema.safeParse({
      reason: 'Verified correction',
      adjustmentVnd: '-9007199254740993',
    }).success,
    true,
  );
  assert.equal(
    schemas.payoutResolutionSchema.safeParse({
      reason: 'Verified correction',
      adjustmentVnd: '1.5',
    }).success,
    false,
  );
});

test('validates final refund evidence and exact money before issuing a closeout command', async () => {
  assert.equal(
    schemas.closeoutOffsetSchema.safeParse({
      reason: 'Approved offset',
      amountVnd: '1.5',
      evidenceKey: 'synthetic',
    }).success,
    false,
  );
  assert.equal(
    schemas.closeoutRefundSchema.safeParse({
      reason: 'Approved refund',
      amountVnd: '100',
      evidenceKey: 'synthetic',
      bankReference: 'synthetic-bank',
      transferredAt: '2026-11-05T02:00:00',
    }).success,
    false,
  );
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('must not request');
  };
  await assert.rejects(
    api.settle('refunds', {
      operationKey: id,
      contractId: id,
      expectedVersion: 1,
      reason: 'Approved refund',
      amountVnd: '100',
      evidenceKey: 'synthetic',
      bankReference: 'synthetic-bank',
      transferredAt: '2026-11-05T02:00:00',
    }),
  );
  assert.equal(called, false);
});
test('keeps closeout operation keys and exact money unchanged across transport retries', async () => {
  const payload = {
    operationKey: id,
    contractId: id,
    expectedVersion: 1,
    reason: 'Approved offset',
    amountVnd: '9007199254740993',
    evidenceKey: 'synthetic',
  };
  const bodies = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/billing/closeout/offsets'));
    bodies.push(JSON.parse(options.body));
    return ok({
      contractId: id,
      status: 'OFFSET_RECORDED',
      operatingBalanceVnd: '0',
      depositBalanceVnd: '2',
      entryIds: [id],
    });
  };
  await api.settle('offsets', payload);
  await api.settle('offsets', payload);
  assert.deepEqual(bodies, [payload, payload]);
});

test('detail keeps whole-statement dispute totals independent of loaded line pages and strips private evidence', async () => {
  globalThis.fetch = async () =>
    ok({
      ...row,
      status: 'PAID',
      review: {
        openDisputeCount: 27,
        disputedCreditsVnd: '9007199254740993',
        disputedDebitsVnd: '100',
        internalNote: 'private-marker',
      },
      transfer: {
        id,
        bankReference: 'SYNTHETIC-BANK',
        amountVnd: '9007199254740993',
        confirmedAt: deadline,
        evidenceKey: 'private-marker',
      },
    });
  const result = await api.detail(id);
  assert.equal(result.review.openDisputeCount, 27);
  assert.equal(result.review.disputedCreditsVnd, '9007199254740993');
  assert.equal(result.review.disputedDebitsVnd, '100');
  assert.equal(result.transfer.amountVnd, '9007199254740993');
  assert.equal(result.transfer.bankReference, 'SYNTHETIC-BANK');
  assert.ok(!JSON.stringify(result).includes('private-marker'));
});

test('validates additive detail summaries and actual transfer evidence without inventing money for older APIs', async () => {
  globalThis.fetch = async () => ok(row);
  const legacy = await api.detail(id);
  assert.equal(legacy.review, undefined);
  assert.equal(legacy.transfer, undefined);
  for (const review of [
    { openDisputeCount: -1, disputedCreditsVnd: '0', disputedDebitsVnd: '0' },
    { openDisputeCount: 1, disputedCreditsVnd: '-1', disputedDebitsVnd: '0' },
    { openDisputeCount: 1, disputedCreditsVnd: 9007199254740993, disputedDebitsVnd: '0' },
  ]) {
    globalThis.fetch = async () => ok({ ...row, review });
    await assert.rejects(api.detail(id));
  }
  for (const amountVnd of ['0', '-100', 100]) {
    globalThis.fetch = async () =>
      ok({
        ...row,
        transfer: { id, bankReference: 'SYNTHETIC', amountVnd, confirmedAt: deadline },
      });
    await assert.rejects(api.detail(id));
  }
});
