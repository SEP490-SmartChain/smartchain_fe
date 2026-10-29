import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, review;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  review = await server.ssrLoadModule('/src/features/orders/lib/withdrawalReview.ts');
});
after(async () => server?.close());

const saved = {
  recipientName: 'Seller',
  recipientPhone: '0900000000',
  address: '12 Test Street',
  provinceCode: '01',
  wardCode: '00001',
  version: 4,
};
const stock = {
  warehouseId: 'warehouse-a',
  productId: 'product-a',
  lotId: 'lot-a',
  warehouseName: 'Hanoi',
  productName: 'Blue trousers',
  sku: 'PANTS-BLUE',
  lotCode: 'LOT-IDENTITY-UNCHANGED',
  availableQty: 98,
};

test('changing any destination field prevents a new withdrawal until saved or reverted', () => {
  assert.equal(review.withdrawalReviewError(saved, saved, stock, 1), null);
  for (const change of [
    { recipientName: 'Other' },
    { recipientPhone: '0911111111' },
    { address: '99 Other Street' },
    { provinceCode: '02' },
    { wardCode: '00002' },
  ]) {
    const edited = { ...saved, ...change };
    assert.equal(review.withdrawalReviewError(saved, edited, stock, 1), 'ADDRESS_UNSAVED');
    assert.equal(review.withdrawalReviewError({ ...edited, version: 5 }, edited, stock, 1), null);
    assert.equal(review.withdrawalReviewError(saved, saved, stock, 1), null);
  }
});

test('review never accepts missing address, missing stock or an invalid stock quantity', () => {
  assert.equal(review.withdrawalReviewError(null, saved, stock, 1), 'UNAVAILABLE');
  assert.equal(review.withdrawalReviewError(saved, saved, undefined, 1), 'UNAVAILABLE');
  for (const qty of [0, -1, 1.5, 99, Number.NaN]) {
    assert.equal(review.withdrawalReviewError(saved, saved, stock, qty), 'UNAVAILABLE');
  }
  assert.equal(review.withdrawalReviewError(saved, saved, stock, 98), null);
});

test('destination review resolves names by division type and parent and preserves unknown codes', () => {
  const locations = [
    { code: '01', name: 'Hanoi', type: 'PROVINCE', parentCode: null },
    { code: '00001', name: 'Wrong province ward', type: 'WARD', parentCode: '02' },
    { code: '00001', name: 'Ba Dinh', type: 'WARD', parentCode: '01' },
  ];
  assert.equal(review.withdrawalAddressLine(saved, locations), '12 Test Street, Ba Dinh, Hanoi');
  assert.equal(review.withdrawalAddressLine(saved, []), '12 Test Street, 00001, 01');
});

test('stock option starts with product identity and retains complete warehouse, lot and quantity', () => {
  const label = review.withdrawalStockLabel(stock);
  assert.equal(label.startsWith('Blue trousers · PANTS-BLUE'), true);
  for (const value of ['Hanoi', 'LOT-IDENTITY-UNCHANGED', '98'])
    assert.equal(label.includes(value), true);
  assert.notEqual(label, review.withdrawalStockLabel({ ...stock, lotCode: 'ANOTHER-LOT' }));
});
