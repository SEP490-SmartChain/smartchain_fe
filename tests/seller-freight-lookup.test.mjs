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
let lookup;
let shared;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  lookup = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/lookup/model/quickLookupController.ts',
  );
  shared = await server.ssrLoadModule('/src/features/orders/seller-freight/shared/index.ts');
});

after(async () => {
  await server?.close();
});

test('SKU parcel summary rounds decimal cm via Math.ceil without summing dimensions across multi-item carts', () => {
  const decimalSku = {
    id: '00000500-0000-4000-8000-000000000001',
    sku: 'SKU-DEC',
    name: 'Decimal item',
    weightG: 450,
    lengthCm: '20.2',
    widthCm: '15.0',
    heightCm: '9.1',
    declaredValue: '150000',
  };
  const single = lookup.summarizeSkuLinesForParcel([{ product: decimalSku, qty: 1 }]);
  assert.equal(single.reason, 'OK');
  assert.equal(single.needsManualReview, false);
  assert.deepEqual(single.parcel, {
    weightG: 450,
    lengthCm: 21,
    widthCm: 15,
    heightCm: 10,
    itemCount: 1,
  });

  const secondSku = {
    id: '00000500-0000-4000-8000-000000000002',
    sku: 'SKU-2',
    name: 'Second item',
    weightG: 300,
    lengthCm: '12',
    widthCm: '10',
    heightCm: '8',
    declaredValue: '100000',
  };
  const multi = lookup.summarizeSkuLinesForParcel([
    { product: decimalSku, qty: 1 },
    { product: secondSku, qty: 2 },
  ]);
  assert.equal(multi.reason, 'MULTI_ITEM_NEEDS_BOX');
  assert.equal(multi.needsManualReview, true);
  assert.equal(multi.totalWeightG, 1050);
  assert.equal(multi.totalItemCount, 3);
  assert.equal(multi.totalDeclaredValueVnd, '350000');
  // Length/width/height NEVER summed across SKUs (must be <= max, not 21 + 12 = 33).
  assert.equal(multi.parcel.lengthCm, 21);

  const missingDims = lookup.summarizeSkuLinesForParcel([
    { product: { ...secondSku, widthCm: '0' }, qty: 1 },
  ]);
  assert.equal(missingDims.reason, 'MISSING_PRODUCT_DIMENSIONS');
  assert.equal(missingDims.parcel, null);
});

test('QuickLookupController handles 0/1/many origins, ignores stale late Huế response after Đà Nẵng, expires at 5m, and wipes on scope switch', async () => {
  const examples = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  const scopeA = 'tenant-a:user-a';

  // 0 origins
  const emptyCtrl = new lookup.QuickLookupController(
    {
      origins: async () => [],
      estimate: async () => {
        throw new Error('should not estimate');
      },
    },
    scopeA,
  );
  await emptyCtrl.loadOrigins();
  assert.equal(emptyCtrl.getState().originsStatus, 'READY');
  assert.equal(emptyCtrl.getState().origins.length, 0);
  assert.equal(emptyCtrl.getState().selectedOriginId, '');

  // Concurrent race: Huế resolves AFTER Đà Nẵng -> Huế ignored!
  let resolveHue;
  let resolveDanang;
  let hueAborted = false;
  let callCount = 0;

  const client = {
    origins: async () => examples.originsPopulated.items,
    estimate: (input, signal) =>
      new Promise((resolve, reject) => {
        callCount += 1;
        if (callCount === 1) {
          signal.addEventListener('abort', () => {
            hueAborted = true;
          });
          resolveHue = () =>
            resolve({
              ...examples.estimateResultAllQuoted,
              input,
              tiers: [
                { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '49000', deliveryDays: 4 },
                examples.estimateResultAllQuoted.tiers[1],
                examples.estimateResultAllQuoted.tiers[2],
              ],
            });
        } else {
          resolveDanang = () =>
            resolve({
              ...examples.estimateResultAllQuoted,
              input,
              tiers: [
                { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '28000', deliveryDays: 2 },
                examples.estimateResultAllQuoted.tiers[1],
                examples.estimateResultAllQuoted.tiers[2],
              ],
            });
          void reject;
        }
      }),
  };

  const ctrl = new lookup.QuickLookupController(client, scopeA);
  await ctrl.loadOrigins();
  assert.equal(ctrl.getState().selectedOriginId, examples.originsPopulated.items[0].id);

  const hueInput = { ...examples.estimateInputStandard, toProvinceCode: '46', toWardCode: '46001' };
  const danangInput = {
    ...examples.estimateInputStandard,
    toProvinceCode: '48',
    toWardCode: '48001',
  };

  const p1 = ctrl.estimate(hueInput);
  const p2 = ctrl.estimate(danangInput);
  assert.equal(hueAborted, true);

  resolveDanang();
  await p2;
  resolveHue();
  await p1;

  assert.equal(ctrl.getState().result.input.toProvinceCode, '48');
  assert.equal(ctrl.getState().result.tiers[0].amountVnd, '28000');

  // Freshness check: changing weight/COD invalidates; TTL expiry invalidates.
  const quotedAtMs = Date.parse(examples.estimateResultAllQuoted.quotedAt);
  const refreshAfterMs = Date.parse(examples.estimateResultAllQuoted.refreshAfter);
  assert.equal(lookup.isQuickResultFresh(ctrl.getState(), danangInput, quotedAtMs).fresh, true);
  assert.equal(
    lookup.isQuickResultFresh(ctrl.getState(), { ...danangInput, codVnd: '232000' }, quotedAtMs)
      .reason,
    'INPUT_CHANGED',
  );
  assert.equal(
    lookup.isQuickResultFresh(ctrl.getState(), danangInput, refreshAfterMs).reason,
    'EXPIRED',
  );

  // Draft seed preserves destination/tier/parcel/sku items, never assigns order warehouse, and cannot be consumed twice.
  const seed = lookup.buildFreightDraftSeed({
    scope: scopeA,
    seedId: 'seed-1',
    input: danangInput,
    deliveryTier: 'BALANCED',
    items: [],
  });
  assert.equal('warehouseId' in seed, false);
  assert.equal(seed.toProvinceCode, '48');
  assert.equal(seed.deliveryTier, 'BALANCED');
  const consumed = new Set();
  assert.notEqual(shared.consumeFreightDraftSeed(scopeA, seed, consumed), null);
  assert.equal(shared.consumeFreightDraftSeed(scopeA, seed, consumed), null);

  // Scope switch wipes cached quote and resets origins.
  ctrl.resetScope('tenant-b:user-b');
  assert.equal(ctrl.getState().result, null);
  assert.equal(ctrl.getState().origins.length, 0);
});

test('classifyEstimateError distinguishes 429 Retry-After, 503 TEMPORARY, and 403/404 ORIGIN_UNAVAILABLE', () => {
  assert.deepEqual(lookup.classifyEstimateError({ status: 429, retryAfterSeconds: 15 }), {
    kind: 'RATE_LIMITED',
    retryAfterSeconds: 15,
  });
  assert.deepEqual(lookup.classifyEstimateError({ status: 503 }), {
    kind: 'TEMPORARILY_UNAVAILABLE',
    retryAfterSeconds: null,
  });
  assert.deepEqual(lookup.classifyEstimateError({ status: 404 }), {
    kind: 'ORIGIN_UNAVAILABLE',
    retryAfterSeconds: null,
  });
});

test('Finding #3/#7: QuickLookupController skips redundant emits on same tier/origin, and parseExplicitQuickMoneyInput rejects blank without defaulting to 0', () => {
  const ctrl = new lookup.QuickLookupController(
    {
      origins: async () => [],
      estimate: async () => {
        throw new Error('unused');
      },
    },
    'tenant-a:user-a',
  );
  let emits = 0;
  ctrl.subscribe(() => {
    emits += 1;
  });
  // Initial tier is BALANCED, origin is '' -> setting same values must emit 0 times.
  ctrl.setSelectedTier('BALANCED');
  ctrl.setSelectedOrigin('');
  assert.equal(emits, 0);
  ctrl.setSelectedTier('ECONOMY');
  ctrl.setSelectedTier('ECONOMY');
  assert.equal(emits, 1);

  // D3 explicit money parsing
  assert.equal(lookup.parseExplicitQuickMoneyInput(''), null);
  assert.equal(lookup.parseExplicitQuickMoneyInput('   '), null);
  assert.equal(lookup.parseExplicitQuickMoneyInput('12.'), null);
  assert.equal(lookup.parseExplicitQuickMoneyInput('0'), '0');
  assert.equal(lookup.parseExplicitQuickMoneyInput('200.000'), '200000');
});
