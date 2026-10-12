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
  'FE-01.03 UTC0004: ' + 'Two logout calls are made while the first server response is pending.',
  async () => {
    signIn();
    let release,
      calls = 0;
    const pending = new Promise((r) => (release = r));
    globalThis.fetch = async () => {
      calls++;
      return pending;
    };
    const first = client.logout(),
      second = client.logout();
    await Promise.resolve();
    assert.equal(calls, 1);
    release(ok(null));
    await Promise.all([first, second]);
    assert.equal(auth.getState().accessToken, null);
  },
);
test(
  'FE-01.03 UTC0005: ' + 'Logout returns a server failure, followed by a successful retry.',
  async () => {
    signIn();
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1 ? fail(500, 'SERVER.INTERNAL_ERROR') : ok(null);
    };
    await assert.rejects(client.logout(), { status: 500, code: 'SERVER.INTERNAL_ERROR' });
    assert.equal(auth.getState().accessToken, 'synthetic-token');
    await client.logout();
    assert.equal(calls, 2);
    assert.equal(auth.getState().accessToken, null);
  },
);
test(
  'FE-01.03 UTC0006: ' + 'Logout returns forbidden, followed by a successful retry.',
  async () => {
    signIn();
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1 ? fail(403, 'AUTH.FORBIDDEN') : ok(null);
    };
    await assert.rejects(client.logout(), { status: 403, code: 'AUTH.FORBIDDEN' });
    assert.equal(auth.getState().accessToken, 'synthetic-token');
    await client.logout();
    assert.equal(calls, 2);
    assert.equal(auth.getState().accessToken, null);
  },
);
test('FE-01.03 UTC0007: ' + 'Logout fetch rejects with a connection error.', async () => {
  signIn();
  globalThis.fetch = async () => {
    throw new TypeError('Synthetic connection failure');
  };
  await assert.rejects(client.logout(), { code: 'NETWORK.ERROR', status: 0 });
  assert.equal(auth.getState().accessToken, 'synthetic-token');
  globalThis.fetch = async () => ok(null);
  await client.logout();
  assert.equal(auth.getState().accessToken, null);
});
