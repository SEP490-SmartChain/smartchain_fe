import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, schemas;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/tenants/schemas/payoutSchema.ts');
});
after(async () => {
  await server?.close();
});

const weekly = {
  cutoffAt: '2026-11-01T23:00:00Z',
  reviewDeadlineAt: '2026-11-03T17:00:00Z',
};

test('on-demand approval opens only after the seller confirms, on any weekday', () => {
  const tuesday = new Date('2026-11-24T08:00:00Z');
  const onDemand = {
    cutoffAt: '2026-11-24T07:00:00Z',
    reviewDeadlineAt: '2026-12-01T07:00:00Z',
    cycleKind: 'ON_DEMAND',
  };

  assert.equal(schemas.payoutApprovalOpen({ ...onDemand, status: 'CONFIRMED' }, tuesday), true);
  assert.equal(schemas.payoutApprovalOpen({ ...onDemand, status: 'SENT' }, tuesday), false);
  assert.equal(
    schemas.payoutApprovalOpen({ ...onDemand, status: 'AUTO_CONFIRMED' }, tuesday),
    false,
  );
});

test('weekly approval keeps the Wednesday window when the cycle kind is absent', () => {
  assert.equal(schemas.payoutApprovalOpen(weekly, new Date('2026-11-03T16:59:59Z')), false);
  assert.equal(schemas.payoutApprovalOpen(weekly, new Date('2026-11-05T02:00:00Z')), true);
});

test('statements without a cycle kind parse as weekly', () => {
  const parsed = schemas.payoutStatementSchema.parse({
    id: '10120001-0000-4000-8000-000000000001',
    tenantId: '10120001-0000-4000-8000-000000000001',
    status: 'SENT',
    version: 2,
    periodStart: '2026-10-26',
    periodEnd: '2026-11-02',
    ...weekly,
    eligibleAmountVnd: '0',
    openingBalanceVnd: '0',
    closingBalanceVnd: '0',
    approvedAmountVnd: null,
    sentAt: null,
    confirmedAt: null,
    approvedAt: null,
    closedAt: null,
    isLegacy: false,
  });

  assert.equal(parsed.cycleKind, 'WEEKLY');
});

test('the chosen Vietnam dates become a period that never ends in the future', () => {
  const now = new Date('2026-11-24T08:30:00Z');

  assert.deepEqual(
    schemas.onDemandPeriod({ periodFrom: '2026-11-20', periodTo: '2026-11-24' }, now),
    { periodFrom: '2026-11-19T17:00:00.000Z', periodTo: '2026-11-24T08:30:00.000Z' },
  );
  assert.deepEqual(
    schemas.onDemandPeriod({ periodFrom: '2026-11-20', periodTo: '2026-11-22' }, now),
    { periodFrom: '2026-11-19T17:00:00.000Z', periodTo: '2026-11-22T17:00:00.000Z' },
  );
});

test('the on-demand form rejects an end date before the start date', () => {
  assert.equal(
    schemas.onDemandPayoutSchema.safeParse({ periodFrom: '2026-11-24', periodTo: '2026-11-23' })
      .success,
    false,
  );
  assert.equal(
    schemas.onDemandPayoutSchema.safeParse({ periodFrom: '2026-11-24', periodTo: '2026-11-24' })
      .success,
    true,
  );
});

test('Vietnam today follows the business timezone, not UTC', () => {
  assert.equal(schemas.vietnamToday(new Date('2026-11-24T18:00:00Z')), '2026-11-25');
});

test('short references hide internal ids behind eight readable characters', () => {
  assert.equal(schemas.shortReference('a8255789-2d15-427b-bc4a-ab4c82ea5729'), 'A8255789');
});
