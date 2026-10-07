import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, products, workbook, schema, auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const date = '2026-10-06T00:00:00.000Z';
const envelope = (data) =>
  Response.json({ success: true, data, meta: { timestamp: date, requestId: 'test', path: '' } });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ productApi: products } = await server.ssrLoadModule(
    '/src/features/catalog/api/productApi.ts',
  ));
  workbook = await server.ssrLoadModule('/src/features/catalog/lib/readSkuWorkbook.ts');
  schema = await server.ssrLoadModule('/src/features/catalog/schemas/productSchema.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  auth
    .getState()
    .setSession({
      accessToken: 'synthetic-test-token',
      expiresIn: 900,
      user: {
        userId: id,
        tenantId: id,
        email: 'test@example.test',
        fullName: 'Synthetic Seller',
        actorScope: 'TENANT',
        roles: ['SELLER_OWNER'],
        permissions: [],
      },
    });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
test('SKU lifecycle reviews work and posts reason with reviewed concurrency token', async () => {
  const paths = [];
  const product = {
    id,
    sku: 'A',
    name: 'A',
    weightG: 1,
    lengthCm: '1',
    widthCm: '1',
    heightCm: '1',
    declaredValue: '0',
    isActive: false,
    createdAt: date,
    updatedAt: date,
  };
  globalThis.fetch = async (url, options) => {
    paths.push(new URL(url, 'https://example.test').pathname);
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), {
        reason: 'Discontinued',
        expectedUpdatedAt: date,
      });
      return envelope({ product, outstanding: { stockUnits: 15, openOrders: 2 } });
    }
    return envelope({ stockUnits: 15, openOrders: 2 });
  };
  assert.deepEqual(await products.outstanding(id), { stockUnits: 15, openOrders: 2 });
  assert.equal(
    (await products.deactivate(id, { reason: 'Discontinued', expectedUpdatedAt: date })).product
      .isActive,
    false,
  );
  assert.deepEqual(paths, [
    `/api/v1/catalog/products/${id}/deactivation-summary`,
    `/api/v1/catalog/products/${id}/deactivate`,
  ]);
  globalThis.fetch = async () => envelope({ stockUnits: -1, openOrders: 2 });
  await assert.rejects(products.outstanding(id), { name: 'ZodError' });
});
test('Excel optional columns preserve barcode zeros and exact declared cost', () => {
  const rows = workbook.skuRowsFromCells([
    [
      'sku',
      'name',
      'weightG',
      'lengthCm',
      'widthCm',
      'heightCm',
      'declaredValue',
      'barcode',
      'declaredCostVnd',
    ],
    ['A', 'Product', '100', '1', '2', '3', '0', '001234', '99999999999999999999'],
  ]);
  assert.equal(rows[0].barcode, '001234');
  assert.equal(rows[0].declaredCostVnd, '99999999999999999999');
  assert.throws(() =>
    workbook.skuRowsFromCells([
      ['sku', 'unknown'],
      ['A', 'value'],
    ]),
  );
});
test('lot configuration rejects expiry without lot and preserves edit currency precision', () => {
  assert.equal(
    schema.productConfigurationSchema.safeParse({
      trackLot: false,
      trackExpiry: true,
      shelfLifeDays: 90,
      minInboundShelfLifePct: 50,
      minOutboundDays: 7,
      nearExpiryDays: 30,
    }).success,
    false,
  );
  const values = {
    name: 'Product',
    weightKg: 1,
    lengthCm: 1,
    widthCm: 1,
    heightCm: 1,
    declaredValue: 0,
    declaredCostVnd: '99999999999999999999',
    barcode: '001234',
    isActive: 'true',
  };
  assert.equal(schema.productEditFormSchema.safeParse(values).success, true);
  assert.equal(schema.toUpdateProductInput(values, date).declaredCostVnd, values.declaredCostVnd);
  assert.equal(
    schema.productEditFormSchema.safeParse({ ...values, declaredCostVnd: '1.5' }).success,
    false,
  );
});
