import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let shared;

const EXAMPLE_PATH = new URL(
  '../src/features/orders/seller-freight/shared/estimate.examples.json',
  import.meta.url,
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
  shared = await server.ssrLoadModule('/src/features/orders/seller-freight/shared/index.ts');
});

after(async () => {
  await server?.close();
});

test('golden wire fixture JSON parses cleanly through strict FE Zod schemas', () => {
  const raw = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  assert.deepEqual(shared.originsResponseSchema.parse(raw.originsEmpty), { items: [] });
  assert.equal(shared.originsResponseSchema.parse(raw.originsPopulated).items.length, 2);
  const input1 = shared.estimateInputSchema.parse(raw.estimateInputStandard);
  const res1 = shared.estimateResultSchema.parse(raw.estimateResultAllQuoted);
  assert.equal(res1.input.codVnd, input1.codVnd);
  assert.equal(res1.tiers[0].amountVnd, '32000');
  assert.equal(res1.tiers[1].amountVnd, '32000');
  assert.equal(res1.tiers[2].status, 'UNAVAILABLE');
  assert.equal(res1.tiers[2].reason, 'ETA_UNAVAILABLE');

  shared.estimateInputSchema.parse(raw.estimateInputAfterCodLoop);
  const res2 = shared.estimateResultSchema.parse(raw.estimateResultAfterCodLoop);
  assert.equal(res2.tiers[0].amountVnd, '33000');
  assert.equal(res2.tiers[1].reason, 'ADDRESS_UNMAPPED');
  assert.equal(res2.tiers[2].reason, 'TEMPORARY');

  shared.orderStatusRequestSchema.parse(raw.orderStatusRequest);
  shared.orderLookupRequestSchema.parse(raw.orderLookupRequest);
  const p3 = shared.orderFreightListResponseSchema.parse(raw.orderFreightMixedResponse);
  assert.equal(p3.items.length, 4);
  assert.equal(p3.items[1].recorded.subtotalVnd, '35000');
  assert.equal(p3.items[2].parcelCount, 2);
  assert.equal(p3.items[2].recorded.subtotalVnd, '20000');
  assert.equal(p3.items[3].state, 'NOT_FOUND');
});

test('strict schemas reject invalid VND, wrong tier order, extra fields, and invalid ETA, while allowing >12-digit recorded totals', () => {
  const raw = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));

  // Extra field rejected
  assert.equal(
    shared.estimateInputSchema.safeParse({
      ...raw.estimateInputStandard,
      tenantId: '00000100-0000-4000-8000-000000000001',
    }).success,
    false,
  );

  // 0 VND quote is invalid
  assert.equal(
    shared.estimateResultSchema.safeParse({
      ...raw.estimateResultAllQuoted,
      tiers: [
        { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '0', deliveryDays: 1 },
        raw.estimateResultAllQuoted.tiers[1],
        raw.estimateResultAllQuoted.tiers[2],
      ],
    }).success,
    false,
  );

  // Wrong tier order rejected
  assert.equal(
    shared.estimateResultSchema.safeParse({
      ...raw.estimateResultAllQuoted,
      tiers: [
        raw.estimateResultAllQuoted.tiers[1],
        raw.estimateResultAllQuoted.tiers[0],
        raw.estimateResultAllQuoted.tiers[2],
      ],
    }).success,
    false,
  );

  // Negative ETA rejected
  assert.equal(
    shared.estimateResultSchema.safeParse({
      ...raw.estimateResultAllQuoted,
      tiers: [
        { tier: 'ECONOMY', status: 'QUOTED', amountVnd: '32000', deliveryDays: -1 },
        raw.estimateResultAllQuoted.tiers[1],
        raw.estimateResultAllQuoted.tiers[2],
      ],
    }).success,
    false,
  );

  // 13-digit input money rejected
  assert.equal(
    shared.estimateInputSchema.safeParse({
      ...raw.estimateInputStandard,
      codVnd: '1000000000000',
    }).success,
    false,
  );

  // 13-digit recorded aggregate fee accepted
  assert.equal(
    shared.orderFreightListResponseSchema.safeParse({
      items: [
        {
          ...raw.orderFreightMixedResponse.items[1],
          recorded: { count: 1, subtotalVnd: '1000000000000' },
          parcels: [
            {
              fulfillmentOrderId: '00001050-0000-4000-8000-000000000001',
              freight: {
                state: 'RECORDED',
                amountVnd: '1000000000000',
                recordedAt: '2026-11-28T03:10:00.000Z',
              },
            },
          ],
        },
        {
          ...raw.orderFreightMixedResponse.items[1],
          orderId: '00001030-0000-4000-8000-000000000099',
          recorded: { count: 1, subtotalVnd: '35000' },
          parcels: [
            {
              fulfillmentOrderId: '00001050-0000-4000-8000-000000000099',
              trackingNumber: 'GHN84920173',
              carrierCode: 'GHN',
              freight: {
                state: 'RECORDED',
                amountVnd: '35000',
                recordedAt: '2026-11-28T01:00:00+00:00',
              },
            },
          ],
        },
      ],
    }).success,
    true,
  );

  // Reject blank trackingNumber strings on parcel rows
  assert.equal(
    shared.orderFreightListResponseSchema.safeParse({
      items: [
        {
          ...raw.orderFreightMixedResponse.items[1],
          parcels: [
            {
              fulfillmentOrderId: '00001050-0000-4000-8000-000000000099',
              trackingNumber: '   ',
              freight: {
                state: 'RECORDED',
                amountVnd: '35000',
                recordedAt: '2026-11-28T03:10:00.000Z',
              },
            },
          ],
        },
      ],
    }).success,
    false,
  );
});

test('input key invalidation, dimension rounding, apply-fee guard, and one-time draft seed consumption', () => {
  const raw = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
  const baseInput = raw.estimateInputStandard;
  const result = shared.estimateResultSchema.parse(raw.estimateResultAllQuoted);

  assert.equal(shared.roundSkuDimensionCm('12.1'), 13);
  assert.equal(shared.roundSkuDimensionCm(0), null);

  const keyA = shared.quoteInputKey('scope-A', baseInput);
  assert.notEqual(shared.quoteInputKey('scope-B', baseInput), keyA);
  assert.notEqual(shared.quoteInputKey('scope-A', { ...baseInput, codVnd: '232000' }), keyA);
  assert.notEqual(
    shared.quoteInputKey('scope-A', {
      ...baseInput,
      parcel: { ...baseInput.parcel, weightG: 501 },
    }),
    keyA,
  );

  const validAt = Date.parse('2026-11-28T03:38:00.000Z');
  const expiredAt = Date.parse('2026-11-28T03:40:00.000Z');

  assert.deepEqual(
    shared.canApplyQuote({
      scope: 'scope-A',
      activeScope: 'scope-A',
      currentKey: keyA,
      quoteKey: keyA,
      result,
      selectedTier: 'ECONOMY',
      entryMode: 'CALCULATED',
      shippingPaidAmount: '10000',
      nowMs: validAt,
    }),
    { allowed: true, amountVnd: '32000' },
  );

  // Blocked in DIRECT mode, when expired, when stale, or when shippingPaid > quote
  assert.equal(
    shared.canApplyQuote({
      scope: 'scope-A',
      activeScope: 'scope-A',
      currentKey: keyA,
      quoteKey: keyA,
      result,
      selectedTier: 'ECONOMY',
      entryMode: 'DIRECT',
      shippingPaidAmount: '0',
      nowMs: validAt,
    }).allowed,
    false,
  );
  assert.equal(
    shared.canApplyQuote({
      scope: 'scope-A',
      activeScope: 'scope-A',
      currentKey: keyA,
      quoteKey: keyA,
      result,
      selectedTier: 'ECONOMY',
      entryMode: 'CALCULATED',
      shippingPaidAmount: '0',
      nowMs: expiredAt,
    }).reason,
    'EXPIRED',
  );
  assert.equal(
    shared.canApplyQuote({
      scope: 'scope-A',
      activeScope: 'scope-A',
      currentKey: keyA,
      quoteKey: keyA,
      result,
      selectedTier: 'ECONOMY',
      entryMode: 'CALCULATED',
      shippingPaidAmount: '40000',
      nowMs: validAt,
    }).reason,
    'PAID_EXCEEDS_QUOTE',
  );

  // One-time seed consumption per scope
  const consumed = new Set();
  const seed = {
    seedId: 'seed-1',
    scope: 'scope-A',
    toProvinceCode: '01',
    toWardCode: '01001',
    deliveryTier: 'BALANCED',
    items: [],
    assumedParcel: baseInput.parcel,
    assumedOriginWarehouseId: baseInput.originWarehouseId,
    referenceCodVnd: '200000',
    referenceDeclaredValueVnd: '200000',
  };
  assert.equal(shared.consumeFreightDraftSeed('scope-B', seed, consumed), null);
  assert.equal(shared.consumeFreightDraftSeed('scope-A', seed, consumed)?.seedId, 'seed-1');
  assert.equal(shared.consumeFreightDraftSeed('scope-A', seed, consumed), null);
});

test('exhaustive field validation rejects empty, negative, decimal, non-integer, and out-of-range inputs cleanly', () => {
  // Integer parcel bounds
  assert.equal(
    shared.validateParcelIntegerField('', { label: 'Cân nặng', min: 1, max: 1_000_000, unit: 'g' })
      .isEmpty,
    true,
  );
  assert.match(
    shared.validateParcelIntegerField('-5', {
      label: 'Cân nặng',
      min: 1,
      max: 1_000_000,
      unit: 'g',
    }).error,
    /lớn hơn 0/,
  );
  assert.match(
    shared.validateParcelIntegerField('12.5', { label: 'Dài', min: 1, max: 1_000, unit: 'cm' })
      .error,
    /số nguyên/,
  );
  assert.match(
    shared.validateParcelIntegerField('1e3', { label: 'Dài', min: 1, max: 1_000, unit: 'cm' })
      .error,
    /số nguyên/,
  );
  assert.match(
    shared.validateParcelIntegerField('0', { label: 'Dài', min: 1, max: 1_000, unit: 'cm' }).error,
    /từ 1 đến 1\.000 cm/,
  );
  assert.match(
    shared.validateParcelIntegerField('1001', { label: 'Dài', min: 1, max: 1_000, unit: 'cm' })
      .error,
    /từ 1 đến 1\.000 cm/,
  );
  assert.equal(
    shared.validateParcelIntegerField('500', {
      label: 'Cân nặng',
      min: 1,
      max: 1_000_000,
      unit: 'g',
    }).value,
    500,
  );

  // Explicit VND validation (D3: never coerce empty to 0)
  const emptyVnd = shared.validateExplicitVndField('', 'tiền thu hộ COD');
  assert.equal(emptyVnd.isEmpty, true);
  assert.equal(emptyVnd.value, null);
  assert.match(
    shared.validateExplicitVndField('-100', 'tiền thu hộ COD').error,
    /không được là số âm/,
  );
  assert.match(shared.validateExplicitVndField('12.', 'tiền thu hộ COD').error, /hợp lệ/);
  assert.match(
    shared.validateExplicitVndField('1000000000000', 'tiền thu hộ COD').error,
    /999\.999\.999\.999/,
  );
  assert.equal(shared.validateExplicitVndField('0', 'tiền thu hộ COD').value, '0');
  assert.equal(shared.validateExplicitVndField('200.000', 'tiền thu hộ COD').value, '200000');
  assert.deepEqual(shared.validateOptionalVndField('', 'giá trị khai báo'), {
    value: null,
    isEmpty: true,
  });
});
