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
  'FE-17.01 UTC0004: ' + 'Frozen valid warehouse form includes contact values and district.',
  async () => {
    const input = Object.freeze({
      ...valid,
      contactName: 'Tester',
      contactPhone: '0900000000',
      contactEmail: 'unit@example.test',
    });
    const snapshot = { ...input };
    const result = warehouse.toWarehouseChanges(input);
    assert.deepEqual(input, snapshot);
    assert.equal(result.contactEmail, input.contactEmail);
    assert.equal(result.contactPhone, input.contactPhone);
    assert.equal(result.contactName, input.contactName);
    assert.equal(result.districtCode, input.districtCode);
    assert.ok(!('code' in result));
  },
);
test(
  'FE-17.01 UTC0005: ' + 'Optional contacts are absent; latitude=0 and longitude=-180.',
  async () => {
    const result = warehouse.toWarehouseChanges({ ...valid, longitude: -180 });
    assert.equal(result.latitude, 0);
    assert.equal(result.longitude, -180);
    assert.equal(result.contactName, null);
    assert.equal(result.contactPhone, null);
    assert.equal(result.contactEmail, null);
  },
);
test('FE-17.02 UTC0009: ' + 'Full-day opening is 0..1440 minutes; cutoff=1439.', async () => {
  for (const change of [
    { operatingStartMinute: 0, operatingEndMinute: 1440, cutoffMinute: 1439 },
  ]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, true);
  }
});
test('FE-17.02 UTC0010: ' + 'Cutoff equals opening time.', async () => {
  for (const change of [{ cutoffMinute: 480 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, true);
  }
});
test('FE-17.02 UTC0011: ' + 'Cutoff equals closing time.', async () => {
  for (const change of [{ cutoffMinute: 1080 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, false);
  }
});
test('FE-17.02 UTC0012: ' + 'Capacity is the inclusive minimum 1.', async () => {
  for (const change of [{ dailyCapacity: 1 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, true);
  }
});
test('FE-17.02 UTC0013: ' + 'Capacity is the inclusive maximum 1000000.', async () => {
  for (const change of [{ dailyCapacity: 1000000 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, true);
  }
});
test('FE-17.02 UTC0014: ' + 'Capacity is fractional (1.5).', async () => {
  for (const change of [{ dailyCapacity: 1.5 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, false);
  }
});
test('FE-17.02 UTC0015: ' + 'Coordinates are the inclusive lower limits -90/-180.', async () => {
  for (const change of [{ latitude: -90, longitude: -180 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, true);
  }
});
test('FE-17.02 UTC0016: ' + 'Latitude exceeds 90 or longitude exceeds 180.', async () => {
  for (const change of [{ latitude: 90.0001 }, { longitude: 180.0001 }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, false);
  }
});
test('FE-17.02 UTC0017: ' + 'Contact email is malformed.', async () => {
  for (const change of [{ contactEmail: 'invalid-email' }]) {
    const result = warehouse.getCreateWarehouseSchema((k) => k).safeParse({ ...valid, ...change });
    assert.equal(result.success, false);
  }
});
test('FE-18.02 UTC0014: ' + 'Weight uses a leading zero (01).', async () => {
  assert.equal(layout.binFormSchema.safeParse({ ...bin, ...{ maxWeightG: '01' } }).success, false);
});
test('FE-18.02 UTC0015: ' + 'Volume uses exponential notation (1e2).', async () => {
  assert.equal(
    layout.binFormSchema.safeParse({ ...bin, ...{ maxVolumeM3: '1e2' } }).success,
    false,
  );
});
test('FE-18.02 UTC0016: ' + 'Bin code contains a lowercase letter.', async () => {
  assert.equal(layout.binFormSchema.safeParse({ ...bin, ...{ code: 'a-01' } }).success, false);
});
test('FE-18.02 UTC0017: ' + 'Bulk rack endpoint exceeds 99.', async () => {
  assert.equal(
    layout.binFormSchema.safeParse({ ...bin, ...{ rackStart: 99, rackCount: 2 } }).success,
    false,
  );
});
test('FE-18.02 UTC0018: ' + 'Bulk aisle endpoint exceeds 99.', async () => {
  assert.equal(
    layout.binFormSchema.safeParse({ ...bin, ...{ aisleStart: 99, aisleCount: 2 } }).success,
    false,
  );
});
test(
  'FE-18.03 UTC0006: ' + 'Each supported zone type is supplied with isActive=false.',
  async () => {
    for (const zoneType of ['RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE']) {
      const parsed = layout.zoneFormSchema.parse({ code: 'A_01', zoneType, isActive: false });
      assert.equal(parsed.zoneType, zoneType);
      assert.equal(parsed.isActive, false);
    }
  },
);
test('FE-18.03 UTC0007: ' + 'Zone code is empty.', async () => {
  assert.equal(
    layout.zoneFormSchema.safeParse({
      code: 'A',
      zoneType: 'STORAGE',
      isActive: true,
      ...{ code: '' },
    }).success,
    false,
  );
});
test('FE-18.03 UTC0008: ' + 'Zone code contains a space.', async () => {
  assert.equal(
    layout.zoneFormSchema.safeParse({
      code: 'A',
      zoneType: 'STORAGE',
      isActive: true,
      ...{ code: 'A B' },
    }).success,
    false,
  );
});
test('FE-18.03 UTC0009: ' + 'isActive is the text false instead of a boolean.', async () => {
  assert.equal(
    layout.zoneFormSchema.safeParse({
      code: 'A',
      zoneType: 'STORAGE',
      isActive: true,
      ...{ isActive: 'false' },
    }).success,
    false,
  );
});
test('FE-18.04 UTC0007: ' + 'One printable character A.', async () => {
  const text = 'A',
    out = barcode.binBarcode(text);
  assert.equal(out.width, 11 * (text.length + 2) + 13 + 20);
  assert.equal(out.bars[0].x, 10);
  for (let i = 0; i < out.bars.length; i++) {
    const b = out.bars[i];
    assert.ok(b.width > 0 && b.x >= 10);
    if (i) assert.ok(b.x >= out.bars[i - 1].x + out.bars[i - 1].width);
  }
  const last = out.bars.at(-1);
  assert.equal(out.width - last.x - last.width, 10);
});
test('FE-18.04 UTC0008: ' + 'Exactly 100 printable characters.', async () => {
  const text =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    out = barcode.binBarcode(text);
  assert.equal(out.width, 11 * (text.length + 2) + 13 + 20);
  assert.equal(out.bars[0].x, 10);
  for (let i = 0; i < out.bars.length; i++) {
    const b = out.bars[i];
    assert.ok(b.width > 0 && b.x >= 10);
    if (i) assert.ok(b.x >= out.bars[i - 1].x + out.bars[i - 1].width);
  }
  const last = out.bars.at(-1);
  assert.equal(out.width - last.x - last.width, 10);
});
test('FE-18.04 UTC0009: ' + 'Printable ASCII endpoints: space and tilde.', async () => {
  const text = ' ~',
    out = barcode.binBarcode(text);
  assert.equal(out.width, 11 * (text.length + 2) + 13 + 20);
  assert.equal(out.bars[0].x, 10);
  for (let i = 0; i < out.bars.length; i++) {
    const b = out.bars[i];
    assert.ok(b.width > 0 && b.x >= 10);
    if (i) assert.ok(b.x >= out.bars[i - 1].x + out.bars[i - 1].width);
  }
  const last = out.bars.at(-1);
  assert.equal(out.width - last.x - last.width, 10);
});
test('FE-18.04 UTC0010: ' + 'Input contains NUL, newline or DEL control characters.', async () => {
  for (const text of ['A\x00', 'A\n', 'A\x7f'])
    assert.throws(() => barcode.binBarcode(text), { message: 'Invalid bin barcode' });
});
test('FE-19.01 UTC0003: ' + 'Legacy valid downtime response has operationKey=null.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ ...downtime, operationKey: null });
  assert.deepEqual(await warehouseApi.schedule(id, payload), {
    id,
    warehouseId: id,
    startAt: payload.startAt,
    endAt: payload.endAt,
    reason: payload.reason,
    operationKey: null,
  });
});
test('FE-19.01 UTC0004: ' + 'Response warehouseId is invalid-id.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ ...downtime, warehouseId: 'invalid-id' });
  await assert.rejects(warehouseApi.schedule(id, payload), (error) => {
    assert.equal(error.name, 'ZodError');
    assert.ok(error.issues.some((i) => i.path.join('.') === 'warehouseId'));
    return true;
  });
});
test('FE-19.01 UTC0005: ' + 'Response startAt is not-a-date.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ ...downtime, startAt: 'not-a-date' });
  await assert.rejects(warehouseApi.schedule(id, payload), (error) => {
    assert.equal(error.name, 'ZodError');
    assert.ok(error.issues.some((i) => i.path.join('.') === 'startAt'));
    return true;
  });
});
test('FE-19.01 UTC0006: ' + 'Response operationKey is invalid-key.', async () => {
  signIn();
  globalThis.fetch = async () => ok({ ...downtime, operationKey: 'invalid-key' });
  await assert.rejects(warehouseApi.schedule(id, payload), (error) => {
    assert.equal(error.name, 'ZodError');
    assert.ok(error.issues.some((i) => i.path.join('.') === 'operationKey'));
    return true;
  });
});
test(
  'FE-19.01 UTC0007: ' + 'Server returns HTTP 409 with CATALOG.WAREHOUSE_MODIFIED_CONCURRENTLY.',
  async () => {
    signIn();
    const input = Object.freeze({ ...payload });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return fail(409, 'CATALOG.WAREHOUSE_MODIFIED_CONCURRENTLY');
    };
    await assert.rejects(warehouseApi.schedule(id, input), {
      status: 409,
      code: 'CATALOG.WAREHOUSE_MODIFIED_CONCURRENTLY',
    });
    assert.equal(calls, 1);
    assert.deepEqual(input, payload);
    assert.equal(auth.getState().accessToken, 'synthetic-token');
  },
);
test('FE-19.01 UTC0008: ' + 'Server returns HTTP 403 with AUTH.FORBIDDEN.', async () => {
  signIn();
  const input = Object.freeze({ ...payload });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fail(403, 'AUTH.FORBIDDEN');
  };
  await assert.rejects(warehouseApi.schedule(id, input), { status: 403, code: 'AUTH.FORBIDDEN' });
  assert.equal(calls, 1);
  assert.deepEqual(input, payload);
  assert.equal(auth.getState().accessToken, 'synthetic-token');
});
