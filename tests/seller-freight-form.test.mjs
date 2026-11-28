import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const EXAMPLE_PATH = new URL(
  '../src/features/orders/seller-freight/shared/estimate.examples.json',
  import.meta.url,
);

let server;
let formModel;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  formModel = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/form/formFreightModel.ts',
  );
});

after(async () => {
  await server?.close();
});

const SAMPLE_PRODUCTS = [
  {
    id: '00000500-0000-4000-8000-000000000001',
    sku: 'SKU-1',
    name: 'Sản phẩm test',
    weightG: 500,
    lengthCm: '20',
    widthCm: '15',
    heightCm: '10',
    declaredValue: '200000',
  },
];

test('A4 DIRECT mode preserves collectionAmount 220000 and blocks Dùng mức này apply', () => {
  const examples = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  const scope = 'tenant-a:user-a';
  const draft = {
    entryMode: 'DIRECT',
    collectionAmount: '220000',
    shippingFeePayer: 'SENDER',
    toProvinceCode: '01',
    toWardCode: '01001',
    declaredValue: '200000',
    items: [{ productId: SAMPLE_PRODUCTS[0].id, qty: 1, unitPrice: '' }],
  };

  const ctx = formModel.deriveFormFreightContext({
    scope,
    originWarehouseId: examples.estimateInputStandard.originWarehouseId,
    draft,
    products: SAMPLE_PRODUCTS,
    manualParcel: formModel.createInitialFormParcel(null),
    useCustomParcelOverride: false,
  });

  assert.equal(ctx.codVnd, '220000');
  const applyCheck = formModel.evaluateFormQuoteApply({
    scope,
    activeScope: scope,
    currentKey: ctx.inputKey,
    quoteKey: ctx.inputKey,
    result: examples.estimateResultAllQuoted,
    selectedTier: 'ECONOMY',
    entryMode: 'DIRECT',
    shippingPaidAmount: '0',
    nowMs: Date.parse(examples.estimateResultAllQuoted.quotedAt),
  });
  assert.deepEqual(applyCheck, { allowed: false, reason: 'DIRECT_MODE' });
  assert.equal(draft.collectionAmount, '220000');
});

test('A4 CALCULATED mode copies quote into shippingChargeAmount, blocks shippingPaid > quote, and invalidates cleanly on COD update loop', () => {
  const examples = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  const scope = 'tenant-a:user-a';
  const originWarehouseId = examples.estimateInputStandard.originWarehouseId;

  // Goods=200000, shippingCharge=10000, shippingPaid=10000 -> initial COD = 200000.
  const draftBeforeApply = {
    entryMode: 'CALCULATED',
    goodsPaymentMode: 'COD',
    shippingFeePayer: 'RECIPIENT',
    paymentBreakdown: {
      discountAmount: '0',
      goodsPaidAmount: '0',
      shippingChargeAmount: '10000',
      shippingPaidAmount: '10000',
    },
    toProvinceCode: '01',
    toWardCode: '01001',
    declaredValue: '200000',
    items: [{ productId: SAMPLE_PRODUCTS[0].id, qty: 1, unitPrice: '200000' }],
  };
  const ctx1 = formModel.deriveFormFreightContext({
    scope,
    originWarehouseId,
    draft: draftBeforeApply,
    products: SAMPLE_PRODUCTS,
    manualParcel: formModel.createInitialFormParcel(null),
    useCustomParcelOverride: false,
  });
  assert.equal(ctx1.codVnd, '200000');

  // If shippingPaid (10000) > quoted amount (8000), apply is blocked!
  const lowerQuoteResult = {
    ...examples.estimateResultAllQuoted,
    tiers: [
      { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '8000', deliveryDays: 3 },
      { tier: 'BALANCED', status: 'QUOTED', amountVnd: '20000', deliveryDays: 2 },
      examples.estimateResultAllQuoted.tiers[2],
    ],
  };
  const blockedPaid = formModel.evaluateFormQuoteApply({
    scope,
    activeScope: scope,
    currentKey: ctx1.inputKey,
    quoteKey: ctx1.inputKey,
    result: lowerQuoteResult,
    selectedTier: 'ECONOMY',
    entryMode: 'CALCULATED',
    shippingPaidAmount: '10000',
    nowMs: Date.parse(examples.estimateResultAllQuoted.quotedAt),
  });
  assert.deepEqual(blockedPaid, { allowed: false, reason: 'PAID_EXCEEDS_QUOTE' });

  // Valid apply with shippingPaid=10000 and quoted=20000 -> COD becomes 200000 + (20000 - 10000) = 210000.
  const allowedCheck = formModel.evaluateFormQuoteApply({
    scope,
    activeScope: scope,
    currentKey: ctx1.inputKey,
    quoteKey: ctx1.inputKey,
    result: lowerQuoteResult,
    selectedTier: 'BALANCED',
    entryMode: 'CALCULATED',
    shippingPaidAmount: '10000',
    nowMs: Date.parse(examples.estimateResultAllQuoted.quotedAt),
  });
  assert.deepEqual(allowedCheck, { allowed: true, amountVnd: '20000' });

  const draftAfterApply = {
    ...draftBeforeApply,
    paymentBreakdown: {
      ...draftBeforeApply.paymentBreakdown,
      shippingChargeAmount: allowedCheck.amountVnd,
    },
  };
  const ctxAfter = formModel.deriveFormFreightContext({
    scope,
    originWarehouseId,
    draft: draftAfterApply,
    products: SAMPLE_PRODUCTS,
    manualParcel: formModel.createInitialFormParcel(null),
    useCustomParcelOverride: false,
  });
  assert.equal(ctxAfter.codVnd, '210000');
  assert.notEqual(ctxAfter.inputKey, ctx1.inputKey);
  assert.equal(draftAfterApply.paymentBreakdown.shippingPaidAmount, '10000');
});

test('Finding #3: in-progress decimal typing like 12. in CALCULATED paymentBreakdown never throws BigInt SyntaxError', () => {
  const examples = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  const scope = 'tenant-a:user-a';
  const originWarehouseId = examples.estimateInputStandard.originWarehouseId;

  for (const field of [
    'shippingChargeAmount',
    'shippingPaidAmount',
    'discountAmount',
    'goodsPaidAmount',
  ]) {
    const partialDraft = {
      entryMode: 'CALCULATED',
      goodsPaymentMode: 'PARTIAL',
      shippingFeePayer: 'RECIPIENT',
      paymentBreakdown: {
        discountAmount: '0',
        goodsPaidAmount: '0',
        shippingChargeAmount: '0',
        shippingPaidAmount: '0',
        [field]: '12.',
      },
      toProvinceCode: '01',
      toWardCode: '01001',
      declaredValue: '200000',
      items: [{ productId: SAMPLE_PRODUCTS[0].id, qty: 1, unitPrice: '200000' }],
    };

    const ctx = formModel.deriveFormFreightContext({
      scope,
      originWarehouseId,
      draft: partialDraft,
      products: SAMPLE_PRODUCTS,
      manualParcel: formModel.createInitialFormParcel(null),
      useCustomParcelOverride: false,
    });
    assert.equal(ctx.codVnd, null);
    assert.equal(ctx.estimateInput, null);
  }

  const applyPartialPaid = formModel.evaluateFormQuoteApply({
    scope,
    activeScope: scope,
    currentKey: 'k1',
    quoteKey: 'k1',
    result: examples.estimateResultAllQuoted,
    selectedTier: 'ECONOMY',
    entryMode: 'CALCULATED',
    shippingPaidAmount: '12.',
    nowMs: Date.parse(examples.estimateResultAllQuoted.quotedAt),
  });
  assert.deepEqual(applyPartialPaid, { allowed: false, reason: 'INPUT_CHANGED' });

  const invalidDeclaredCtx = formModel.deriveFormFreightContext({
    scope,
    originWarehouseId,
    draft: {
      entryMode: 'DIRECT',
      collectionAmount: '200000',
      shippingFeePayer: 'SENDER',
      toProvinceCode: '01',
      toWardCode: '01001',
      declaredValue: '12.',
      items: [{ productId: SAMPLE_PRODUCTS[0].id, qty: 1, unitPrice: '' }],
    },
    products: SAMPLE_PRODUCTS,
    manualParcel: formModel.createInitialFormParcel(null),
    useCustomParcelOverride: false,
  });
  assert.equal(invalidDeclaredCtx.invalidDeclaredValue, true);
  assert.equal(invalidDeclaredCtx.declaredValueVnd, null);
  assert.equal(invalidDeclaredCtx.estimateInput, null);
});
