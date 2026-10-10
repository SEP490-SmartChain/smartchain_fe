import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createServer } from 'vite';
let server, warehouse, layout, barcode, workbook, warehouseApi, productApi, client, auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-09T00:00:00.000Z';
const ok = (data) => Response.json({ success: true, data, meta: {} });
const fail = (status, code) =>
  Response.json(
    { success: false, error: { code, message: 'Synthetic error', statusCode: status }, meta: {} },
    { status },
  );
const valid = {
  region: 'CENTRAL',
  timeZone: 'Asia/Ho_Chi_Minh',
  cutoffMinute: 840,
  operatingStartMinute: 480,
  operatingEndMinute: 1080,
  code: 'TEST',
  name: 'Test Warehouse',
  address: 'Synthetic street',
  provinceCode: '48',
  districtCode: 'TEST',
  wardCode: 'TEST',
  latitude: 0,
  longitude: 0,
  dailyCapacity: 100,
};
const bin = {
  code: 'A-01',
  maxWeightG: '1',
  maxVolumeM3: '0.000001',
  isActive: true,
  mode: 'bulk',
  aisleStart: 1,
  aisleCount: 1,
  rackStart: 1,
  rackCount: 1,
  levelStart: 1,
  levelCount: 1,
};
const headers = ['sku', 'name', 'weightG', 'lengthCm', 'widthCm', 'heightCm', 'declaredValue'];
const row = ['SKU', 'Product', '500', '10', '5', '2', '1000'];
const payload = {
  startAt: '2026-10-10T01:00:00.000Z',
  endAt: '2026-10-10T02:00:00.000Z',
  reason: 'Maintenance',
  operationKey: id,
  expectedVersion: 3,
};
const downtime = { id, warehouseId: id, ...payload };
function signIn() {
  auth
    .getState()
    .setSession({
      accessToken: 'synthetic-token',
      expiresIn: 900,
      user: {
        userId: id,
        tenantId: id,
        sessionId: id,
        actorScope: 'TENANT',
        email: 'unit@example.test',
        fullName: 'Unit Tester',
        roles: ['SELLER_OWNER'],
        permissions: [],
      },
    });
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text, method = 0] of entries) {
    const raw = Buffer.isBuffer(text) ? text : Buffer.from(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc32(raw), 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    local.push(h, n, data);
    central.push(c, n);
    offset += h.length + n.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const buffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  warehouse = await server.ssrLoadModule('/src/features/catalog/schemas/warehouseSchema.ts');
  layout = await server.ssrLoadModule('/src/features/catalog/schemas/warehouseLayoutSchema.ts');
  barcode = await server.ssrLoadModule('/src/features/catalog/lib/binBarcode.ts');
  workbook = await server.ssrLoadModule('/src/features/catalog/lib/readSkuWorkbook.ts');
  ({ warehouseApi } = await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts'));
  ({ productApi } = await server.ssrLoadModule('/src/features/catalog/api/productApi.ts'));
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});
beforeEach(() => {
  globalThis.fetch = originalFetch;
  auth.getState().clear();
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test(
  'FE-23.03 UTC0016: ' + 'Required headers are reordered and contain surrounding spaces.',
  async () => {
    const h = Object.freeze([...headers].reverse().map((x) => ' ' + x + ' ')),
      r = Object.freeze([...row].reverse()),
      input = Object.freeze([h, r]);
    const out = workbook.skuRowsFromCells(input);
    assert.deepEqual(out, [
      {
        sku: 'SKU',
        name: 'Product',
        weightG: 500,
        lengthCm: 10,
        widthCm: 5,
        heightCm: 2,
        declaredValue: 1000,
      },
    ]);
    assert.equal(h[0], ' declaredValue ');
  },
);
test('FE-23.03 UTC0017: ' + 'Required weight cell is blank.', async () => {
  const r = [...row];
  r[2] = '';
  assert.equal(workbook.skuRowsFromCells([headers, r])[0].weightG, null);
});
test('FE-23.03 UTC0018: ' + 'Required weight cell contains nonnumeric text.', async () => {
  const r = [...row];
  r[2] = 'not-a-number';
  assert.ok(Number.isNaN(workbook.skuRowsFromCells([headers, r])[0].weightG));
});
test(
  'FE-23.03 UTC0019: ' +
    'Optional columns have missing cells; explicit true/false words have surrounding spaces.',
  async () => {
    const [a] = workbook.skuRowsFromCells([[...headers, 'barcode', 'declaredCostVnd'], row]);
    assert.ok(!('barcode' in a));
    assert.ok(!('declaredCostVnd' in a));
    const [b] = workbook.skuRowsFromCells([
      [...headers, 'trackLot', 'trackExpiry'],
      [...row, ' true ', ' false '],
    ]);
    assert.equal(b.trackLot, true);
    assert.equal(b.trackExpiry, false);
  },
);
test(
  'FE-23.04 UTC0008: ' + 'Valid stored ZIP contains workbook XML and an unrelated text file.',
  async () => {
    const parts = await workbook.readWorkbookXml(
      buffer(
        zip([
          ['xl/workbook.xml', '<workbook/>'],
          ['ignored.txt', 'text'],
        ]),
      ),
    );
    assert.deepEqual([...parts], [['xl/workbook.xml', '<workbook/>']]);
  },
);
test('FE-23.04 UTC0009: ' + 'ZIP contains duplicate allowed workbook XML paths.', async () => {
  await assert.rejects(
    workbook.readWorkbookXml(
      buffer(
        zip([
          ['xl/workbook.xml', '<a/>'],
          ['xl/workbook.xml', '<b/>'],
        ]),
      ),
    ),
    { message: 'invalidWorkbook' },
  );
});
test('FE-23.04 UTC0010: ' + 'ZIP end record specifies a second disk.', async () => {
  const b = zip([['xl/workbook.xml', '<a/>']]);
  b.writeUInt16LE(1, b.length - 18);
  await assert.rejects(workbook.readWorkbookXml(buffer(b)), { message: 'invalidWorkbook' });
});
test('FE-23.04 UTC0011: ' + 'ZIP central directory declares 201 entries.', async () => {
  const b = zip([['xl/workbook.xml', '<a/>']]);
  b.writeUInt16LE(201, b.length - 12);
  await assert.rejects(workbook.readWorkbookXml(buffer(b)), { message: 'invalidWorkbook' });
});
test(
  'FE-23.04 UTC0012: ' +
    'Two deflated XML parts together expand beyond 4 MiB although each part is below 4 MiB.',
  async () => {
    const text = 'x'.repeat(2097153);
    const b = zip([
      ['xl/workbook.xml', text, 8],
      ['xl/sharedStrings.xml', text, 8],
    ]);
    assert.ok(b.length < 1048576);
    await assert.rejects(workbook.readWorkbookXml(buffer(b)), { message: 'invalidWorkbook' });
  },
);
test('FE-23.07 UTC0003: ' + 'Stock and open-order counts are both zero.', async () => {
  signIn();
  globalThis.fetch = async (url, o) => {
    assert.equal(url, `/api/v1/catalog/products/${id}/deactivation-summary`);
    assert.equal(o.method, 'GET');
    assert.equal(new Headers(o.headers).get('Authorization'), 'Bearer synthetic-token');
    return ok({ stockUnits: 0, openOrders: 0 });
  };
  assert.deepEqual(await productApi.outstanding(id), { stockUnits: 0, openOrders: 0 });
});
test('FE-23.07 UTC0004: ' + 'Open orders are negative.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ stockUnits: 0, openOrders: -1 });
  await assert.rejects(productApi.outstanding(id), { name: 'ZodError' });
});
test('FE-23.07 UTC0005: ' + 'Open orders are fractional.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ stockUnits: 0, openOrders: 0.5 });
  await assert.rejects(productApi.outstanding(id), { name: 'ZodError' });
});
test('FE-23.07 UTC0006: ' + 'Open orders are missing.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ stockUnits: 0 });
  await assert.rejects(productApi.outstanding(id), { name: 'ZodError' });
});
test('FE-23.07 UTC0007: ' + 'Count values are strings.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ stockUnits: '0', openOrders: '0' });
  await assert.rejects(productApi.outstanding(id), { name: 'ZodError' });
});
test('FE-23.07 UTC0008: ' + 'Response data is null.', async () => {
  signIn();
  globalThis.fetch = async () => ok(null);
  await assert.rejects(productApi.outstanding(id), { name: 'ZodError' });
});
test('FE-23.07 UTC0009: ' + 'Server returns HTTP 404 with CATALOG.PRODUCT_NOT_FOUND.', async () => {
  signIn();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fail(404, 'CATALOG.PRODUCT_NOT_FOUND');
  };
  await assert.rejects(productApi.outstanding(id), {
    status: 404,
    code: 'CATALOG.PRODUCT_NOT_FOUND',
  });
  assert.equal(calls, 1);
  assert.equal(auth.getState().accessToken, 'synthetic-token');
});
