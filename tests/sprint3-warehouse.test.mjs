import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, barcode, warehouse, api, policy, auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  barcode = await server.ssrLoadModule('/src/features/catalog/lib/binBarcode.ts');
  warehouse = await server.ssrLoadModule('/src/features/catalog/schemas/warehouseSchema.ts');
  api = (await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts')).warehouseApi;
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth = (await server.ssrLoadModule('/src/stores/authStore.ts')).useAuthStore;
  auth.getState().setSession({
    accessToken: 'synthetic',
    refreshToken: 'synthetic-refresh',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      sessionId: id,
      email: 'manager@example.test',
      fullName: 'Manager',
      phone: null,
      avatarUrl: null,
      roles: ['WAREHOUSE_MANAGER'],
      permissions: [],
      warehouseIds: [id],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
test('Code 128 labels decode the exact stable bin value, contain a valid checksum and quiet zones', () => {
  const encoded = barcode.binBarcode('DN-A-03-02-01');
  // Independent scanner reconstruction from alternating black bars and white gaps.
  const runs = [];
  for (let i = 0; i < encoded.bars.length; i++) {
    const b = encoded.bars[i];
    runs.push(b.width);
    if (i < encoded.bars.length - 1) runs.push(encoded.bars[i + 1].x - b.x - b.width);
  }
  const symbols = [];
  while (runs.length > 7) symbols.push(runs.splice(0, 6).join(''));
  assert.equal(symbols.shift(), '211214');
  assert.equal(runs.join(''), '2331112');
  const table = {
    112313: 'D',
    113321: 'N',
    122132: '-',
    111323: 'A',
    123122: '0',
    123221: '1',
    223211: '2',
    221132: '3',
  };
  const checksumPattern = symbols.pop();
  const decoded = symbols.map((p) => table[p]).join('');
  assert.equal(decoded, 'DN-A-03-02-01');
  // Known checksum for this label is 33 (pattern 111323), independent fixed fixture.
  assert.equal(checksumPattern, '111323');
  assert.equal(encoded.bars[0].x, 10);
  const last = encoded.bars.at(-1);
  assert.equal(encoded.width - last.x - last.width, 10);
  assert.throws(() => barcode.binBarcode(''));
  assert.throws(() => barcode.binBarcode('Kho Đà Nẵng'));
  assert.throws(() => barcode.binBarcode('A'.repeat(101)));
});
test('warehouse operating input rejects unsupported region and cut-off outside hours', () => {
  const valid = {
    region: 'CENTRAL',
    timeZone: 'Asia/Ho_Chi_Minh',
    cutoffMinute: 840,
    operatingStartMinute: 480,
    operatingEndMinute: 1080,
    code: 'DN',
    name: 'Da Nang',
    address: 'Synthetic street',
    provinceCode: '48',
    districtCode: '',
    wardCode: 'TEST',
    latitude: 0,
    longitude: 0,
    dailyCapacity: 100,
  };
  const schema = warehouse.getCreateWarehouseSchema((k) => k, true);
  assert.equal(schema.safeParse(valid).success, true);
  for (const change of [
    { region: 'UNKNOWN' },
    { cutoffMinute: 1200 },
    { operatingEndMinute: 400 },
    { dailyCapacity: -1 },
    { timeZone: 'UTC' },
  ])
    assert.equal(schema.safeParse({ ...valid, ...change }).success, false);
  assert.equal('region' in warehouse.toWarehouseChanges(valid), false);
});
test('downtime requests preserve UTC dates, stable operation key and reviewed version', async () => {
  const payload = {
    startAt: '2026-10-10T01:00:00.000Z',
    endAt: '2026-10-10T02:00:00.000Z',
    reason: 'Maintenance',
    operationKey: id,
    expectedVersion: 3,
  };
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(url);
    assert.deepEqual(JSON.parse(options.body), payload);
    return Response.json({ success: true, data: { id, warehouseId: id, ...payload }, meta: {} });
  };
  const a = await api.schedule(id, payload);
  const b = await api.schedule(id, payload);
  assert.equal(a.id, b.id);
  assert.deepEqual(paths, [
    `/api/v1/warehouses/${id}/downtime`,
    `/api/v1/warehouses/${id}/downtime`,
  ]);
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      data: { stockUnits: -1, openTasks: 0, openWaves: 0 },
      meta: {},
    });
  await assert.rejects(api.outstanding(id), { name: 'ZodError' });
});
test('RP3 permits Manager metadata/layout/downtime and Admin layout view only', () => {
  const effective = (roles) => policy.getEffectiveRoles(roles, 'PLATFORM');
  assert.equal(policy.can(effective(['ORCA_ADMIN']), 'warehouses.layout.view'), true);
  for (const cap of [
    'warehouses.update',
    'warehouses.layout.manage',
    'warehouses.downtime.manage',
  ]) {
    assert.equal(policy.can(effective(['WAREHOUSE_MANAGER']), cap), true);
    for (const role of ['ORCA_ADMIN', 'WAREHOUSE_STAFF', 'OPS_DISPATCHER', 'ORCA_ACCOUNTANT'])
      assert.equal(policy.can(effective([role]), cap), false);
  }
});
