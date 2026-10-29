import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let server, label;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  const schema = await server.ssrLoadModule('/src/features/tenants/schemas/payoutSchema.ts');
  label = schema.ledgerEntryLabelKey;
});
after(async () => server?.close());
const fee = {
  entryType: 'FEE',
  sourceType: 'BILLABLE_EVENT',
  componentKey: 'service-fee-v1',
  feeType: null,
  orderKind: null,
};
test('distinguishes freight, withdrawal handling, normal handling and subscriptions from source metadata', () => {
  assert.equal(label({ ...fee, feeType: 'FREIGHT' }), 'fee.freight');
  assert.equal(
    label({ ...fee, feeType: 'PICK_PACK_ORDER', orderKind: 'WITHDRAWAL' }),
    'fee.withdrawalHandling',
  );
  assert.equal(
    label({ ...fee, feeType: 'PICK_PACK_ORDER', orderKind: 'SALES' }),
    'fee.orderHandling',
  );
  assert.equal(label({ ...fee, feeType: 'PICK_PACK_ORDER' }), 'fee.orderHandling');
  assert.equal(label({ ...fee, sourceType: 'SUBSCRIPTION' }), 'fee.subscription');
});
test('uses a truthful fallback for legacy/unknown fees without guessing from price or reference', () => {
  for (const [type, key] of Object.entries({
    INBOUND_CARTON: 'inbound',
    STORAGE_M3_DAY: 'storage',
    PACKING_MATERIAL: 'material',
    RETURN_HANDLING: 'returnHandling',
    COMBO: 'combo',
  }))
    assert.equal(label({ ...fee, feeType: type }), `fee.${key}`);
  assert.equal(label({ ...fee, componentKey: 'freight-fee-v1' }), 'fee.freight');
  assert.equal(label({ ...fee, amountVnd: '-8000', sourceId: 'WD-anything' }), 'fee.service');
  assert.equal(label({ ...fee, feeType: 'FUTURE_FEE' }), 'fee.service');
  for (const type of ['PAYMENT', 'COD_CREDIT', 'PAYOUT', 'ADJUST'])
    assert.equal(label({ ...fee, entryType: type }), `entry.${type}`);
});
test('all fee label keys have specific Vietnamese and English translations', () => {
  for (const locale of ['vi', 'en']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../messages/${locale}.json`, import.meta.url)),
    ).Payouts.fee;
    for (const key of [
      'freight',
      'withdrawalHandling',
      'orderHandling',
      'subscription',
      'service',
      'inbound',
      'storage',
      'material',
      'returnHandling',
      'combo',
    ])
      assert.ok(messages?.[key]);
  }
});
