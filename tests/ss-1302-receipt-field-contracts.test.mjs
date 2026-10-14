import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const foreignId = '00000000-0000-4000-8000-000000000003';
const arrival = {
  asnId: id,
  asnCode: 'ASN-TEST',
  warehouseId,
  receiptId: foreignId,
  arrivedAt: '2026-10-13T00:00:00.000Z',
  version: 2,
};
const count = {
  id,
  receiptId: foreignId,
  inboundLineId: id,
  receivedQty: 2,
  receiptVersion: 2,
  countedAt: arrival.arrivedAt,
  lots: [
    {
      recordId: id,
      lotId: foreignId,
      lotCode: 'LOT-TEST',
      receivedQty: 2,
      quarantinedQty: 0,
      qcState: 'PENDING',
      manufacturedOn: null,
      expiresOn: null,
      lotStatus: 'SELLABLE',
    },
  ],
};
const receipt = {
  receiptId: foreignId,
  version: 2,
  status: 'RECEIVING',
  asnId: id,
  asnCode: 'ASN-TEST',
  asnStatus: 'RECEIVING',
  lines: [
    {
      id,
      lineNo: 1,
      sku: 'SKU-TEST',
      productName: 'Test goods',
      trackExpiry: false,
      shelfLifeDays: null,
      minInboundShelfLifePct: 80,
      count,
    },
  ],
};
const ok = (data) => Response.json({ success: true, data, meta: {} });
let server, api, auth;
before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    configFile: false,
    envFile: false,
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ receivingApi: api } = await server.ssrLoadModule('/src/features/inbound/api/receivingApi.ts'));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  auth.getState().setSession({
    accessToken: 'synthetic-receipt-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
      warehouseIds: [warehouseId],
      email: 'receipt@example.test',
      fullName: 'Receipt tester',
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('SS-1302: arrival accepts the exact scoped backend confirmation', async () => {
  globalThis.fetch = async () => ok(arrival);
  assert.deepEqual(await api.checkIn(warehouseId, id, 1), arrival);
});
for (const field of [
  'tenantId',
  'codAmount',
  'orderValue',
  'invoice',
  'apiSecret',
  'receivedQty',
]) {
  test(`SS-1302: arrival rejects unexpected field ${field}`, async () => {
    globalThis.fetch = async () => ok({ ...arrival, [field]: 'synthetic-private' });
    await assert.rejects(api.checkIn(warehouseId, id, 1), { name: 'ZodError' });
  });
}
for (const field of ['asnId', 'warehouseId']) {
  test(`SS-1302: arrival rejects a confirmation for another ${field}`, async () => {
    globalThis.fetch = async () => ok({ ...arrival, [field]: foreignId });
    await assert.rejects(api.checkIn(warehouseId, id, 1), /another ASN or warehouse/);
  });
}
test('SS-1302: physical receipt accepts only the operational response shape', async () => {
  globalThis.fetch = async () => ok(receipt);
  assert.deepEqual(await api.receipt(warehouseId, id), receipt);
});
for (const level of ['header', 'line', 'count', 'lot']) {
  for (const field of [
    'codAmount',
    'costPrice',
    'invoice',
    'apiSecret',
    'recipientPhone',
    'declaredQty',
  ]) {
    test(`SS-1302: physical receipt rejects ${level}.${field}`, async () => {
      const data = structuredClone(receipt);
      const target =
        level === 'header'
          ? data
          : level === 'line'
            ? data.lines[0]
            : level === 'count'
              ? data.lines[0].count
              : data.lines[0].count.lots[0];
      target[field] = 'synthetic-private';
      globalThis.fetch = async () => ok(data);
      await assert.rejects(api.receipt(warehouseId, id), { name: 'ZodError' });
    });
  }
}
