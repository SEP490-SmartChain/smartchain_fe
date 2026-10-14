import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const safeAsn = {
  id,
  warehouseId,
  asnCode: 'ASN-TEST',
  status: 'RECEIVING',
  arrivedAt: '2026-10-13T00:00:00.000Z',
  version: 2,
  receiptIds: [id],
  lines: [{ id, lineNo: 1, sku: 'SKU-TEST', productName: 'Test goods', receivedQty: 2 }],
};
let server, api, auth;
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { pagination: { limit: 20, hasNext: false, nextCursor: null } },
  });

before(async () => {
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
    accessToken: 'synthetic-blind-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
      warehouseIds: [warehouseId],
      email: 'blind@example.test',
      fullName: 'Blind tester',
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('SS-1302: warehouse list accepts the backend operational allowlist without seller declarations', async () => {
  globalThis.fetch = async () => ok([safeAsn]);
  assert.deepEqual((await api.list(warehouseId)).items, [safeAsn]);
});

for (const field of [
  'tenantId',
  'externalReference',
  'createdByUserId',
  'codAmount',
  'orderValue',
  'invoice',
  'apiSecret',
  'recipientPhone',
]) {
  test(`SS-1302: warehouse list rejects unexpected header field ${field}`, async () => {
    globalThis.fetch = async () => ok([{ ...safeAsn, [field]: 'synthetic-private' }]);
    await assert.rejects(api.list(warehouseId), { name: 'ZodError' });
  });
}
for (const field of [
  'declaredQty',
  'declaredLotCode',
  'declaredExpiryOn',
  'productId',
  'costPrice',
  'codAmount',
]) {
  test(`SS-1302: warehouse list rejects blind or financial line field ${field}`, async () => {
    globalThis.fetch = async () =>
      ok([{ ...safeAsn, lines: [{ ...safeAsn.lines[0], [field]: 999 }] }]);
    await assert.rejects(api.list(warehouseId), { name: 'ZodError' });
  });
}
test('SS-1302: warehouse list rejects a response for another warehouse', async () => {
  globalThis.fetch = async () => ok([{ ...safeAsn, warehouseId: id }]);
  await assert.rejects(api.list(warehouseId), /another warehouse/);
});
test('SS-1302: warehouse list rejects duplicate resource IDs', async () => {
  globalThis.fetch = async () => ok([safeAsn, safeAsn]);
  await assert.rejects(api.list(warehouseId), /Duplicate/);
});
test('SS-1302: receiving table does not render seller-declared quantity', () => {
  const source = readFileSync(
    `${root}/src/features/inbound/components/ReceivingWorkspace.tsx`,
    'utf8',
  );
  assert.equal(
    /line\.declaredQty|['"]declared['"]/.test(source),
    false,
    'Blind receiving must not render declared quantities',
  );
});
