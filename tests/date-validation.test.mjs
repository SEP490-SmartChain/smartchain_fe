import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let dates, asn, receiving, packaging, reporting, webhook, picking, payout, invoices, remittance;
const id = '00000000-0000-4000-8000-000000000001';

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    root,
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  const load = (file) => server.ssrLoadModule(`/src/${file}.ts`);
  dates = await load('lib/dateValidation');
  asn = await load('features/inbound/schemas/asnSchema');
  receiving = await load('features/inbound/schemas/receiptCountSchema');
  packaging = await load('features/inbound/api/packagingAiApi');
  reporting = await load('features/analytics/schemas/reportSchema');
  webhook = await load('features/analytics/api/webhookReportApi');
  picking = await load('features/orders/schemas/pickingSchema');
  payout = await load('features/tenants/schemas/payoutSchema');
  invoices = await load('features/tenants/schemas/invoiceSchema');
  remittance = await load('features/reconciliation/schemas/remittanceSchema');
});

after(() => server?.close());

test('calendar dates reject rollovers and preserve leap days and open-ended ranges', () => {
  assert.equal(dates.calendarDateSchema.safeParse('2028-02-29').success, true);
  for (const invalid of ['2027-02-29', '2026-04-31', '2026-1-05', '0000-01-01', '']) {
    assert.equal(dates.calendarDateSchema.safeParse(invalid).success, false, invalid);
  }
  assert.equal(dates.calendarRangeIssue('', '2028-02-29'), null);
  assert.equal(dates.calendarRangeIssue('2028-02-29', ''), null);
  assert.equal(dates.calendarRangeIssue('2028-02-29', '2028-02-29'), null);
  assert.deepEqual(dates.calendarRangeIssue('2028-03-01', '2028-02-29'), {
    field: 'to',
    message: 'dateOrder',
  });
  assert.deepEqual(dates.calendarRangeIssue('2026-04-31', ''), {
    field: 'from',
    message: 'invalidDate',
  });
});

test('local timestamps preserve the given date and reject timezone suffixes and spring-forward gaps', () => {
  const priorTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(dates.parseLocalDateTime('2026-03-08T02:30'), null);
    assert.equal(
      dates.parseLocalDateTime('2026-03-08T01:59:45').toISOString(),
      '2026-03-08T09:59:45.000Z',
    );
    for (const invalid of [
      '2027-02-29T08:00',
      '2026-04-31T08:00',
      '2026-04-30T24:00',
      '2026-04-30T10:00Z',
      '2026-04-30T10:00:60',
    ]) {
      assert.equal(dates.parseLocalDateTime(invalid), null, invalid);
      assert.equal(dates.parseLocalDateTime(invalid, 'vietnam'), null, invalid);
    }
    const now = new Date('2026-11-25T17:00:00.000Z');
    assert.equal(dates.localDateTimeInput(now), '2026-11-25T09:00');
    assert.equal(dates.vietnamToday(now), '2026-11-26');
    assert.equal(
      dates.parseLocalDateTime('2026-11-26T00:00', 'vietnam').toISOString(),
      now.toISOString(),
    );
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    assert.equal(dates.localDateTimeInput(now), '2026-11-26T00:00');
    assert.equal(dates.vietnamToday(new Date('2026-11-25T16:59:59.999Z')), '2026-11-25');
    assert.equal(dates.isRecordedLocalDateTime('2026-11-26T00:00:00', now), true);
    assert.equal(dates.isRecordedLocalDateTime('2026-11-26T00:00:00.001', now), false);
  } finally {
    if (priorTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = priorTimeZone;
  }
});

test('ASN permits empty dates and historical declarations while rejecting nonexistent dates', () => {
  const values = {
    warehouseId: id,
    externalReference: 'REF-BROWSER',
    cartonCount: 1,
    expectedArrivalAt: '',
    lines: [{ productId: id, declaredQty: 1, declaredLotCode: '', declaredExpiryOn: '' }],
  };
  assert.equal(asn.asnFormSchema.safeParse(values).success, true);
  assert.equal(
    asn.asnFormSchema.safeParse({ ...values, expectedArrivalAt: '2026-04-31T08:00' }).success,
    false,
  );
  assert.equal(
    asn.asnFormSchema.safeParse({ ...values, expectedArrivalAt: '2020-04-30T08:00' }).success,
    true,
  );
  assert.equal(
    asn.asnFormSchema.safeParse({
      ...values,
      lines: [{ ...values.lines[0], declaredExpiryOn: '2026-02-29' }],
    }).success,
    false,
  );
});

test('manufacture is capped at the warehouse date and expired lots stay recordable', () => {
  const policy = {
    trackLot: true,
    trackExpiry: true,
    manufactureRequired: true,
    shelfLifeDays: null,
  };
  const fixedClock = () => new Date('2026-11-25T17:00:00.000Z');
  const schema = receiving.receiptCountSchemaFor(policy, fixedClock);
  const makeCount = (manufacturedOn, expiresOn) => ({
    inboundLineId: id,
    receivedQty: 1,
    lots: [{ lotCode: 'OLD-LOT', receivedQty: 1, manufacturedOn, expiresOn }],
  });
  const expired = makeCount('2026-10-01', '2026-10-20');
  assert.equal(schema.safeParse(expired).success, true);
  assert.equal(receiving.countCommand(expired, id, 1, policy).lots[0].expiresOn, '2026-10-20');
  assert.equal(schema.safeParse(makeCount('2026-11-26', '2026-11-27')).success, true);
  const future = schema.safeParse(makeCount('2026-11-27', '2026-11-28'));
  assert.equal(future.success, false);
  assert.deepEqual(future.error.issues[0].path, ['lots', 0, 'manufacturedOn']);
  assert.equal(future.error.issues[0].message, 'manufactureFuture');
  const sameDay = schema.safeParse(makeCount('2026-11-26', '2026-11-26'));
  assert.equal(sameDay.success, false);
  assert.equal(sameDay.error.issues[0].message, 'expiryAfterManufacture');
  assert.equal(
    packaging.packagingAcceptanceSchema.safeParse({
      confirmed: true,
      lotCode: 'OLD-LOT',
      manufacturedOn: '2026-10-01',
      expiresOn: '2026-09-20',
    }).success,
    false,
  );
  assert.equal(
    packaging.packagingAcceptanceSchema.safeParse({
      confirmed: true,
      lotCode: 'FUTURE-LOT',
      manufacturedOn: '9999-11-01',
    }).success,
    false,
  );
});

test('reports and webhooks use a 92-day inclusive range and the report year bounds', () => {
  const reportOptions = { warehouseId: '', actorId: '', action: '', entityId: '', kind: '' };
  const ranges = [
    ['2026-01-01', '2026-04-02', true],
    ['2026-01-01', '2026-04-03', false],
    ['2026-04-31', '2026-05-01', false],
    ['2026-04-30', '2026-04-29', false],
    ['1999-12-31', '2000-01-01', false],
    ['2100-12-31', '2100-12-31', true],
    ['2100-12-31', '2101-01-01', false],
  ];
  for (const [from, to, valid] of ranges) {
    assert.equal(
      reporting.reportFilterSchema.safeParse({ ...reportOptions, from, to }).success,
      valid,
      `${from}–${to}`,
    );
    assert.equal(
      webhook.webhookFilters.safeParse({ from, to, status: '' }).success,
      valid,
      `${from}–${to}`,
    );
  }
});

test('pick cutoffs are valid at either inclusive endpoint of the seven-day window', () => {
  const now = new Date('2026-11-26T11:00:00');
  const schema = picking.pickWaveFormSchemaFor(() => now);
  const valid = (cutoffAt) =>
    schema.safeParse({ cutoffAt, assigneeId: id, maxParcels: 20 }).success;
  assert.equal(valid('2026-11-19T11:00:00'), true);
  assert.equal(valid('2026-11-19T10:59:59.999'), false);
  assert.equal(valid('2026-11-26T11:00:00'), true);
  assert.equal(valid('2026-11-26T11:00:00.001'), false);
  assert.equal(valid('2026-11-26T24:00'), false);
});

test('payout periods enforce their exact duration, business date and midnight boundary', () => {
  const fixed = new Date('2026-04-02T17:00:00.000Z');
  const schema = payout.onDemandPayoutSchemaFor(() => fixed);
  const valid = (periodFrom, periodTo) => schema.safeParse({ periodFrom, periodTo }).success;
  assert.equal(valid('2026-01-01', '2026-04-02'), true);
  assert.equal(valid('2025-12-31', '2026-04-02'), false);
  assert.equal(valid('2026-04-02', '2026-04-03'), true);
  assert.equal(valid('2026-04-03', '2026-04-03'), false);
  assert.equal(valid('2026-04-03', '2026-04-04'), false);
  assert.equal(valid('2026-02-29', '2026-04-02'), false);
  const afterMidnight = new Date(fixed.getTime() + 1);
  const clock = () => afterMidnight;
  const values = { periodFrom: '2026-04-03', periodTo: '2026-04-03' };
  assert.equal(payout.onDemandPayoutSchemaFor(clock).safeParse(values).success, true);
  assert.deepEqual(payout.onDemandPeriod(values, afterMidnight), {
    periodFrom: fixed.toISOString(),
    periodTo: afterMidnight.toISOString(),
  });
});

test('finance rejects future actual timestamps and respects the weekly transfer window', () => {
  const transfer = { bankReference: 'bank-123', evidenceKey: 'evidence-123' };
  const weekly = {
    cycleKind: 'WEEKLY',
    approvedAt: '2026-11-03T17:00:45Z',
    reviewDeadlineAt: '2026-11-03T17:00:00Z',
    cutoffAt: '2026-11-01T23:00:00Z',
  };
  assert.equal(payout.isPayoutTransferInWindow('2026-11-03T17:00:00Z', weekly), false);
  const valueAtApproval = dates.localDateTimeInput(new Date(weekly.approvedAt), 'second');
  const enteredAtApproval = dates.parseLocalDateTime(valueAtApproval).toISOString();
  assert.equal(enteredAtApproval, '2026-11-03T17:00:45.000Z');
  assert.equal(payout.isPayoutTransferInWindow(enteredAtApproval, weekly), true);
  assert.equal(payout.isPayoutTransferInWindow('2026-11-08T22:59:59.999Z', weekly), true);
  assert.equal(payout.isPayoutTransferInWindow('2026-11-08T23:00:00Z', weekly), false);
  assert.equal(
    payout.isPayoutTransferInWindow('2026-11-08T23:00:00Z', { ...weekly, cycleKind: 'ON_DEMAND' }),
    true,
  );
  assert.equal(
    payout.payoutTransferFormSchema.safeParse({
      ...transfer,
      transferredAt: '9999-01-01T12:00:00Z',
    }).success,
    false,
  );
  assert.equal(
    payout.payoutTransferFormSchema.safeParse({
      ...transfer,
      transferredAt: '2020-01-01T12:00:00Z',
    }).success,
    true,
  );
  const receipt = {
    source: 'MANUAL',
    bankReference: 'bank-123',
    amountVnd: '1000',
    evidenceRef: 'invoice-123',
  };
  assert.equal(
    remittance.remittanceSchema.safeParse({ ...receipt, receivedAt: '9999-01-01T12:00' }).success,
    false,
  );
  assert.equal(
    remittance.remittanceSchema.safeParse({ ...receipt, receivedAt: '2020-01-01T12:00' }).success,
    true,
  );
  assert.equal(
    remittance.remittanceSchema.safeParse({ source: 'SEPAY', notificationId: id }).success,
    true,
  );
});

test('month closure starts at midnight in Vietnam and must meet the API month bounds', () => {
  const before = invoices.closeInvoicePeriodSchemaFor(() => new Date('2026-11-30T16:59:59.999Z'));
  const after = invoices.closeInvoicePeriodSchemaFor(() => new Date('2026-11-30T17:00:00.000Z'));
  assert.equal(after.safeParse({ month: '2026-11' }).success, true);
  assert.equal(before.safeParse({ month: '2026-11' }).success, false);
  assert.equal(after.safeParse({ month: '2026-12' }).success, false);
  assert.equal(after.safeParse({ month: '2019-12' }).success, false);
  assert.equal(after.safeParse({ month: '2020-01' }).success, true);
  assert.equal(after.safeParse({ month: '2026-13' }).success, false);
});
