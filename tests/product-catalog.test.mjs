import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let productApi;
let useAuthStore;
let ApiError;
let productSchema;
let volumetric;
let policy;
const originalFetch = globalThis.fetch;
const admin = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'admin@example.test',
  fullName: 'Tenant Admin',
  roles: ['TENANT_ADMIN'],
  permissions: [],
};
const product = {
  id: '00000000-0000-4000-8000-000000000010',
  sku: 'SKU-001',
  name: 'Sample Product',
  weightG: 500,
  lengthCm: '10.5',
  widthCm: '5.25',
  heightCm: '3',
  declaredValue: '120000',
  isActive: true,
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-02T02:00:00.000Z',
};
const validForm = {
  name: 'Sample Product v2',
  weightKg: 0.75,
  lengthCm: 20.5,
  widthCm: 10,
  heightCm: 8.25,
  declaredValue: 150000,
  isActive: 'false',
};
const ok = (items, pagination) =>
  Response.json({
    success: true,
    data: items,
    meta: {
      timestamp: '2026-09-11T02:00:00.000Z',
      path: '',
      requestId: 'test',
      pagination,
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
  ({ productApi } = await server.ssrLoadModule('/src/features/catalog/api/productApi.ts'));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  productSchema = await server.ssrLoadModule('/src/features/catalog/schemas/productSchema.ts');
  volumetric = await server.ssrLoadModule('/src/lib/volumetricWeight.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ accessToken: 'admin-token', expiresIn: 900, user: admin });
});

test('product catalog sends tenant filters through the authenticated API client', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/catalog/products');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('search'), 'sku');
    assert.equal(requestUrl.searchParams.get('isActive'), 'true');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok([product], { limit: 100, hasNext: false, nextCursor: null });
  };

  const page = await productApi.list({ search: ' sku ', isActive: 'true' });

  assert.deepEqual(page.items, [product]);
  assert.deepEqual(page.pagination, { limit: 100, hasNext: false, nextCursor: null });
});

test('omits isActive from the query when the filter is unset', async () => {
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.searchParams.has('isActive'), false);
    return ok([], { limit: 100, hasNext: false, nextCursor: null });
  };

  await productApi.list({ search: '', isActive: '' });
});

test('malformed product responses are rejected before reaching the UI', async () => {
  globalThis.fetch = async () =>
    ok([{ ...product, weightG: 'not-a-number' }], {
      limit: 100,
      hasNext: false,
      nextCursor: null,
    });

  await assert.rejects(productApi.list({ search: '', isActive: '' }), {
    name: 'ZodError',
  });
});

test('updates a product with PATCH and returns the validated product', async () => {
  const input = productSchema.toUpdateProductInput(validForm, product.updatedAt);
  const updated = { ...product, weightG: 750, updatedAt: '2026-09-03T02:00:00.000Z' };
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, `/api/v1/catalog/products/${product.id}`);
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    assert.deepEqual(JSON.parse(options.body), {
      name: 'Sample Product v2',
      weightG: 750,
      lengthCm: 20.5,
      widthCm: 10,
      heightCm: 8.25,
      declaredValue: 150000,
      isActive: false,
      expectedUpdatedAt: product.updatedAt,
    });
    return Response.json({
      success: true,
      data: updated,
      meta: { timestamp: '2026-09-03T02:00:00.000Z', path: '', requestId: 'test' },
    });
  };

  const result = await productApi.update(product.id, input);

  assert.deepEqual(result, updated);
});

test('surfaces a concurrent modification as ApiError 409 with the stable code', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: {
          code: 'CATALOG.PRODUCT_MODIFIED_CONCURRENTLY',
          message: 'SKU was modified by another session.',
          statusCode: 409,
        },
        meta: { timestamp: '2026-09-03T02:00:00.000Z', path: '', requestId: 'test' },
      },
      { status: 409 },
    );

  await assert.rejects(
    productApi.update(product.id, productSchema.toUpdateProductInput(validForm, product.updatedAt)),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'CATALOG.PRODUCT_MODIFIED_CONCURRENTLY');
      return true;
    },
  );
});

test('prefills the edit form in kilograms and converts back to grams without drift', () => {
  const values = productSchema.toProductEditFormValues({ ...product, weightG: 1234 });

  assert.deepEqual(values, {
    name: 'Sample Product',
    weightKg: 1.234,
    lengthCm: 10.5,
    widthCm: 5.25,
    heightCm: 3,
    declaredValue: 120000,
    isActive: 'true',
  });
  assert.equal(productSchema.toUpdateProductInput(values, product.updatedAt).weightG, 1234);
  assert.equal(
    productSchema.toUpdateProductInput({ ...values, weightKg: 0.001 }, product.updatedAt).weightG,
    1,
  );
});

test('edit form accepts the inclusive SRS limits', () => {
  const result = productSchema.productEditFormSchema.safeParse({
    ...validForm,
    weightKg: 100,
    lengthCm: 200,
    widthCm: 200,
    heightCm: 200,
    declaredValue: 0,
  });

  assert.equal(result.success, true);
});

for (const [condition, override, field, message] of [
  ['weight is zero', { weightKg: 0 }, 'weightKg', 'mustBePositive'],
  ['weight exceeds 100 kg', { weightKg: 100.001 }, 'weightKg', 'weightTooLarge'],
  ['weight is finer than a gram', { weightKg: 0.0005 }, 'weightKg', 'weightDecimals'],
  ['weight is empty', { weightKg: Number.NaN }, 'weightKg', 'numberRequired'],
  ['length is negative', { lengthCm: -1 }, 'lengthCm', 'mustBePositive'],
  ['width exceeds 200 cm', { widthCm: 200.01 }, 'widthCm', 'dimensionTooLarge'],
  ['height has 3 decimals', { heightCm: 1.234 }, 'heightCm', 'dimensionDecimals'],
  ['declared value is negative', { declaredValue: -1 }, 'declaredValue', 'declaredValueNegative'],
  ['declared value is fractional', { declaredValue: 1.5 }, 'declaredValue', 'declaredValueInteger'],
  ['name is blank', { name: '   ' }, 'name', 'nameRequired'],
  ['name exceeds 255 characters', { name: 'x'.repeat(256) }, 'name', 'nameTooLong'],
]) {
  test(`edit form rejects with ${message} when ${condition}`, () => {
    const result = productSchema.productEditFormSchema.safeParse({ ...validForm, ...override });

    assert.equal(result.success, false);
    const issue = result.error.issues.find((candidate) => candidate.path[0] === field);
    assert.equal(issue?.message, message);
  });
}

test('volumetric weight follows (L x W x H) / 5000 and ignores incomplete dimensions', () => {
  assert.equal(volumetric.calculateVolumetricWeightKg(50, 40, 30), 12);
  assert.equal(volumetric.calculateVolumetricWeightKg(50, 40, 30, 6000), 10);
  assert.equal(volumetric.calculateVolumetricWeightKg(50, 0, 30), null);
  assert.equal(volumetric.calculateVolumetricWeightKg(50, Number.NaN, 30), null);
});

test('only Tenant Admin may manage products while Dispatcher can still view them', () => {
  assert.equal(policy.can(['TENANT_ADMIN'], 'catalog.products.manage'), true);
  assert.equal(policy.can(['DISPATCHER'], 'catalog.products.manage'), false);
  assert.equal(policy.can(['DISPATCHER'], 'catalog.products.view'), true);
  assert.equal(policy.can(['ACCOUNTANT'], 'catalog.products.manage'), false);
  assert.equal(policy.can(['SUPER_ADMIN'], 'catalog.products.manage'), false);
});
