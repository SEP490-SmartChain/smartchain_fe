import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, warehouseApi, productApi, auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-09T00:00:00.000Z';
const counts = { stockUnits: 15, openTasks: 2, openWaves: 1 };
const product = {
  id,
  sku: 'UNIT-SKU',
  name: 'Unit SKU',
  weightG: 500,
  lengthCm: '10',
  widthCm: '5',
  heightCm: '2',
  declaredValue: '1000',
  isActive: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const input = { reason: 'Discontinued', expectedUpdatedAt: timestamp };
const deactivated = { product, outstanding: { stockUnits: 15, openOrders: 2 } };
const success = (data) => Response.json({ success: true, data, meta: {} });
const failure = (status, code) =>
  Response.json(
    {
      success: false,
      error: { code, message: 'Synthetic test error', statusCode: status },
      meta: {},
    },
    { status },
  );

function signIn(actorScope, role) {
  auth.getState().setSession({
    accessToken: 'synthetic-unit-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: actorScope === 'TENANT' ? id : null,
      actorScope,
      sessionId: id,
      email: 'unit@example.test',
      fullName: 'Unit Tester',
      roles: [role],
      permissions: [],
      warehouseIds: actorScope === 'PLATFORM' ? [id] : [],
    },
  });
}

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ warehouseApi } = await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts'));
  ({ productApi } = await server.ssrLoadModule('/src/features/catalog/api/productApi.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() => {
  globalThis.fetch = originalFetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

describe('FE-19.02 warehouseApi.outstanding', () => {
  beforeEach(() => signIn('PLATFORM', 'WAREHOUSE_MANAGER'));
  for (const [field, number] of [
    ['stockUnits', 1],
    ['openTasks', 4],
    ['openWaves', 5],
  ]) {
    test(`UTC${String(number).padStart(4, '0')}: rejects negative ${field}`, async () => {
      globalThis.fetch = async () => success({ ...counts, [field]: -1 });
      await assert.rejects(warehouseApi.outstanding(id), (error) => {
        assert.equal(error.name, 'ZodError');
        assert.ok(error.issues.some((issue) => issue.path.join('.') === field));
        return true;
      });
    });
  }
  test('UTC0002: returns all positive counts through an authenticated GET', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push(url);
      assert.equal(options.method, 'GET');
      assert.equal(
        new Headers(options.headers).get('Authorization'),
        'Bearer synthetic-unit-token',
      );
      return success(counts);
    };
    assert.deepEqual(await warehouseApi.outstanding(id), counts);
    assert.deepEqual(requests, [`/api/v1/warehouses/${id}/outstanding`]);
  });
  test('UTC0003: accepts zero for every count', async () => {
    const zero = { stockUnits: 0, openTasks: 0, openWaves: 0 };
    globalThis.fetch = async () => success(zero);
    assert.deepEqual(await warehouseApi.outstanding(id), zero);
  });
  for (const [number, data, field] of [
    [6, { ...counts, stockUnits: 1.5 }, 'stockUnits'],
    [7, { ...counts, stockUnits: '15' }, 'stockUnits'],
    [8, { stockUnits: 15, openWaves: 1 }, 'openTasks'],
  ]) {
    test(`UTC${String(number).padStart(4, '0')}: rejects invalid count shape`, async () => {
      globalThis.fetch = async () => success(data);
      await assert.rejects(warehouseApi.outstanding(id), (error) => {
        assert.equal(error.name, 'ZodError');
        assert.ok(error.issues.some((issue) => issue.path.join('.') === field));
        return true;
      });
    });
  }
  test('UTC0009: rejects null data rather than reporting an empty warehouse', async () => {
    globalThis.fetch = async () => success(null);
    await assert.rejects(warehouseApi.outstanding(id), { name: 'ZodError' });
  });
  for (const [number, status, code] of [
    [10, 403, 'AUTH.FORBIDDEN'],
    [11, 500, 'SERVER.INTERNAL_ERROR'],
  ]) {
    test(`UTC${String(number).padStart(4, '0')}: preserves HTTP ${status} without retrying`, async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return failure(status, code);
      };
      await assert.rejects(warehouseApi.outstanding(id), { name: 'ApiError', status, code });
      assert.equal(calls, 1);
      assert.equal(auth.getState().accessToken, 'synthetic-unit-token');
    });
  }
  test('UTC0012: maps a rejected fetch to NETWORK.ERROR', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Synthetic connection failure');
    };
    await assert.rejects(warehouseApi.outstanding(id), {
      name: 'ApiError',
      status: 0,
      code: 'NETWORK.ERROR',
    });
  });
  test('UTC0013: rejects an invalid success envelope', async () => {
    globalThis.fetch = async () => Response.json({ success: false, data: counts });
    await assert.rejects(warehouseApi.outstanding(id), {
      name: 'ApiError',
      status: 200,
      code: 'API.INVALID_RESPONSE',
    });
  });
});

describe('FE-23.06 productApi.deactivate', () => {
  beforeEach(() => signIn('TENANT', 'SELLER_OWNER'));
  test('UTC0001: preserves the reviewed token and reason and returns product plus counts', async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, `/api/v1/catalog/products/${id}/deactivate`);
      assert.equal(options.method, 'POST');
      assert.equal(
        new Headers(options.headers).get('Authorization'),
        'Bearer synthetic-unit-token',
      );
      assert.deepEqual(JSON.parse(options.body), input);
      return success(deactivated);
    };
    assert.deepEqual(await productApi.deactivate(id, input), deactivated);
    assert.equal(calls, 1);
    assert.deepEqual(input, { reason: 'Discontinued', expectedUpdatedAt: timestamp });
  });
  test('UTC0002: accepts zero stock and orders', async () => {
    const data = { product, outstanding: { stockUnits: 0, openOrders: 0 } };
    globalThis.fetch = async () => success(data);
    assert.deepEqual(await productApi.deactivate(id, input), data);
  });
  for (const [number, data, path] of [
    [3, { ...deactivated, product: { ...product, id: 'invalid-id' } }, 'product.id'],
    [4, { ...deactivated, product: { ...product, isActive: 'false' } }, 'product.isActive'],
    [5, { product, outstanding: { stockUnits: -1, openOrders: 2 } }, 'outstanding.stockUnits'],
    [6, { product, outstanding: { stockUnits: 15, openOrders: -1 } }, 'outstanding.openOrders'],
    [7, { product, outstanding: { stockUnits: 15 } }, 'outstanding.openOrders'],
    [8, { product, outstanding: { stockUnits: 15, openOrders: 0.5 } }, 'outstanding.openOrders'],
  ]) {
    test(`UTC${String(number).padStart(4, '0')}: rejects malformed deactivation data`, async () => {
      globalThis.fetch = async () => success(data);
      await assert.rejects(productApi.deactivate(id, input), (error) => {
        assert.equal(error.name, 'ZodError');
        assert.ok(error.issues.some((issue) => issue.path.join('.') === path));
        return true;
      });
    });
  }
  for (const [number, status, code] of [
    [9, 409, 'CATALOG.PRODUCT_MODIFIED_CONCURRENTLY'],
    [10, 404, 'CATALOG.PRODUCT_NOT_FOUND'],
    [11, 403, 'AUTH.FORBIDDEN'],
  ]) {
    test(`UTC${String(number).padStart(4, '0')}: preserves HTTP ${status} without resubmitting`, async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return failure(status, code);
      };
      await assert.rejects(productApi.deactivate(id, input), { name: 'ApiError', status, code });
      assert.equal(calls, 1);
      assert.deepEqual(input, { reason: 'Discontinued', expectedUpdatedAt: timestamp });
      assert.equal(auth.getState().accessToken, 'synthetic-unit-token');
    });
  }
  test('UTC0012: does not return a successful product when the connection fails', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Synthetic connection failure');
    };
    await assert.rejects(productApi.deactivate(id, input), {
      name: 'ApiError',
      status: 0,
      code: 'NETWORK.ERROR',
    });
  });
});
