import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server, warehouseApi, staffAccountApi, carrierCatalogApi, tenantManagementApi, store;
const originalFetch = globalThis.fetch;
const id = 'cd882d2d-8dca-4111-add1-948cd7e9b095';
const pagination = { limit: 50, hasNext: true, nextCursor: id };
const warehouse = {
  region: 'NORTH',
  timeZone: 'Asia/Ho_Chi_Minh',
  cutoffMinute: 840,
  operatingStartMinute: 480,
  operatingEndMinute: 1080,
  version: 1,
  id,
  tenantId: null,
  code: 'DEMO-RSV-HN',
  name: 'ORCA Demo Ha Noi',
  address: '1 Demo Street, Ha Noi',
  provinceCode: '01',
  districtCode: null,
  wardCode: '00001',
  latitude: 21.0285,
  longitude: 105.8542,
  dailyCapacity: 500,
  priority: 0,
  status: 'ACTIVE',
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  createdAt: '2026-10-11T05:53:00.086Z',
  updatedAt: '2026-10-11T05:53:00.086Z',
};
const staff = {
  userId: id,
  fullName: 'ORCA Seller Staff',
  email: 'staff@orca.test',
  roles: ['SELLER_STAFF'],
  lastSessionAt: null,
  phone: null,
  avatarUrl: null,
  status: 'ACTIVE',
};
const carrier = {
  id,
  code: 'GHN',
  name: 'Giao Hang Nhanh',
  logoUrl: null,
  isActive: true,
  endpointsCount: 1,
  servicesCount: 2,
  connectedTenantsCount: 0,
  createdAt: warehouse.createdAt,
  updatedAt: warehouse.updatedAt,
};
const tenant = {
  id,
  name: 'ORCA Demo',
  slug: 'orca-demo',
  status: 'ACTIVE',
  adminEmail: null,
  subscription: { planCode: null, status: null, startDate: null, endDate: null },
  quota: { ordersUsed: 0, ordersTotal: 100, apiCallsUsed: 0, apiCallsTotal: 100 },
  createdAt: warehouse.createdAt,
  updatedAt: warehouse.updatedAt,
};
const ok = (data, page = pagination) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: warehouse.updatedAt, path: '', requestId: 'fixture', pagination: page },
  });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ warehouseApi } = await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts'));
  ({ staffAccountApi } = await server.ssrLoadModule(
    '/src/features/tenants/api/staffAccountApi.ts',
  ));
  ({ carrierCatalogApi } = await server.ssrLoadModule(
    '/src/features/catalog/api/carrierCatalogApi.ts',
  ));
  ({ tenantManagementApi } = await server.ssrLoadModule(
    '/src/features/tenants/api/tenantManagementApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'fixture-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
      email: 'admin@orca.test',
      fullName: 'ORCA Admin',
    },
  });
});

test('warehouse directory accepts the ORCA platform projection and null district', async () => {
  globalThis.fetch = async () => ok([warehouse]);
  assert.deepEqual(await warehouseApi.list({ search: '', status: '' }), {
    items: [warehouse],
    pagination,
  });
});
test('warehouse create accepts the same platform projection returned by the server', async () => {
  const payload = {
    code: warehouse.code,
    name: warehouse.name,
    address: warehouse.address,
    provinceCode: warehouse.provinceCode,
    districtCode: '001',
    wardCode: warehouse.wardCode,
    latitude: warehouse.latitude,
    longitude: warehouse.longitude,
    dailyCapacity: warehouse.dailyCapacity,
    region: 'NORTH',
  };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), payload);
    return ok(warehouse);
  };
  assert.deepEqual(await warehouseApi.create(payload), warehouse);
});
test('warehouse status surfaces a stale version error from the backend', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'WAREHOUSE.VERSION_CONFLICT', message: 'Warehouse version has changed' },
        meta: { timestamp: warehouse.updatedAt, path: '', requestId: 'fixture' },
      },
      { status: 409 },
    );
  await assert.rejects(
    warehouseApi.setStatus(id, {
      status: 'INACTIVE',
      reason: 'Maintenance',
      expectedVersion: 1,
    }),
    { name: 'ApiError', status: 409, message: 'Warehouse version has changed' },
  );
});
test('warehouse directory still rejects an invalid warehouse region', async () => {
  globalThis.fetch = async () => ok([{ ...warehouse, region: 'UNKNOWN' }]);
  await assert.rejects(warehouseApi.list({ search: '', status: '' }), { name: 'ZodError' });
});
test('warehouse status sends reason and expectedVersion and uses the confirmed server version', async () => {
  const confirmed = { ...warehouse, status: 'INACTIVE', version: 2 };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/warehouses/${id}/status`);
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), {
      status: 'INACTIVE',
      reason: 'Maintenance',
      expectedVersion: 1,
    });
    return ok(confirmed);
  };
  assert.deepEqual(
    await warehouseApi.setStatus(id, {
      status: 'INACTIVE',
      reason: 'Maintenance',
      expectedVersion: 1,
    }),
    confirmed,
  );
});
for (const role of ['SELLER_OWNER', 'SELLER_STAFF']) {
  test(`staff directory accepts ${role} from the current ORCA API`, async () => {
    const account = { ...staff, roles: [role] };
    globalThis.fetch = async () => ok([account]);
    assert.deepEqual((await staffAccountApi.list({ search: '', status: '', role: '' })).items, [
      account,
    ]);
  });
}
for (const roles of [['ORCA_ADMIN'], ['TENANT_ADMIN'], ['SELLER_STAFF', 'ORCA_ADMIN']]) {
  test(`staff directory rejects incompatible role scope ${roles.join(',')}`, async () => {
    globalThis.fetch = async () => ok([{ ...staff, roles }]);
    await assert.rejects(staffAccountApi.list({ search: '', status: '', role: '' }), {
      name: 'ZodError',
    });
  });
}
test('carrier list preserves unavailable connection statistics as null', async () => {
  const item = { ...carrier, connectedTenantsCount: null };
  globalThis.fetch = async () => ok([item]);
  assert.deepEqual(await carrierCatalogApi.list({}), { items: [item], pagination });
});

for (const [label, getApi, item, path] of [
  ['carrier', () => carrierCatalogApi, carrier, '/api/v1/platform/carriers'],
  ['seller', () => tenantManagementApi, tenant, '/api/v1/platform/tenants'],
]) {
  test(`${label} list keeps pagination from meta and forwards cursor and filters`, async () => {
    globalThis.fetch = async (url, options) => {
      const request = new URL(url, 'http://fixture.test');
      assert.equal(request.pathname, path);
      assert.equal(request.searchParams.get('cursor'), id);
      assert.equal(request.searchParams.get('search'), 'orca');
      assert.equal(options.headers.get('Authorization'), 'Bearer fixture-token');
      return ok([item]);
    };
    assert.deepEqual(await getApi().list({ search: ' orca ', cursor: id }), {
      items: [item],
      pagination,
    });
  });
  test(`${label} list retains the empty final page and rejects missing pagination`, async () => {
    const finalPage = { limit: 50, hasNext: false, nextCursor: null };
    globalThis.fetch = async () => ok([], finalPage);
    assert.deepEqual(await getApi().list({}), { items: [], pagination: finalPage });
    globalThis.fetch = async () => Response.json({ success: true, data: [item], meta: {} });
    await assert.rejects(getApi().list({}), { name: 'ZodError' });
  });
}
