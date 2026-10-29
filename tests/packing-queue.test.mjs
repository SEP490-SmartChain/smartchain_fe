import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, client;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ packingApi: api } = await server.ssrLoadModule('/src/features/orders/api/packingApi.ts'));
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => server?.close());

const id = '00000000-0000-4000-8000-000000000001';
const row = { id, status: 'PICKED', version: 1, sequenceNo: 1, orderCode: 'ORDER-A' };

test('packing queue preserves order identity and warehouse cursor parameters', async () => {
  const original = client.get;
  client.get = async (path, options) => {
    assert.equal(path, '/v1/warehouse/fulfillment/parcels');
    assert.deepEqual(options.params, { warehouseId: id, cursor: id });
    return { data: { items: [row], nextCursor: id } };
  };
  try {
    assert.deepEqual(await api.list(id, undefined, id), { items: [row], nextCursor: id });
  } finally {
    client.get = original;
  }
});

test('packing queue rejects missing or non-string order codes', async () => {
  const original = client.get;
  try {
    for (const orderCode of [undefined, null, 7]) {
      client.get = async () => ({
        data: { items: [{ ...row, orderCode }], nextCursor: null },
      });
      await assert.rejects(api.list(id));
    }
  } finally {
    client.get = original;
  }
});

test('packing queue rejects financial, secret and recipient fields beyond its allowlist', async () => {
  const original = client.get;
  try {
    for (const field of [
      'codAmount',
      'totalAmount',
      'unitPrice',
      'invoice',
      'encryptedCredentials',
      'recipientName',
      'recipientPhone',
      'recipientAddress',
    ]) {
      client.get = async () => ({
        data: { items: [{ ...row, [field]: 'private' }], nextCursor: null },
      });
      await assert.rejects(api.list(id));
    }
  } finally {
    client.get = original;
  }
});
