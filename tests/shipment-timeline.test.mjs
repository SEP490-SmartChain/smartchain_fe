import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server, schema;
const event = {
  id: '11111111-1111-4111-8111-111111111111',
  eventCode: 'delivered',
  standardStatus: 'DELIVERED',
  eventTime: '2026-10-18T01:00:00.000Z',
  isApplied: true,
  ignoreReason: null,
};

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ trackingEventSchema: schema } = await server.ssrLoadModule(
    '/src/features/shipments/schemas/shipmentSchema.ts',
  ));
});
after(async () => {
  await server?.close();
});

test('timeline boundary drops unintended financial and recipient fields before UI state', () => {
  assert.deepEqual(
    schema.parse({
      ...event,
      codAmount: '100000',
      recipientPhone: 'test-only',
      rawPayload: { token: 'test-only' },
    }),
    event,
  );
});

test('timeline requires verified timestamps, IDs and application flags', () => {
  for (const change of [
    { id: 'foreign' },
    { eventTime: 'invalid' },
    { isApplied: 'true' },
    { eventCode: 'x'.repeat(51) },
  ]) {
    assert.equal(schema.safeParse({ ...event, ...change }).success, false);
  }
});

test('unknown or ignored carrier events retain evidence without pretending to be applied', () => {
  const row = schema.parse({
    ...event,
    standardStatus: 'UNMAPPED',
    isApplied: false,
    ignoreReason: 'UNMAPPED',
  });
  assert.equal(row.isApplied, false);
  assert.equal(row.ignoreReason, 'UNMAPPED');
});

test('delivery metadata accepts masked couriers while stripping POD and private fields', () => {
  const row = schema.parse({
    ...event,
    hubName: 'Hub mô phỏng',
    attemptNo: 2,
    weightGram: 1500,
    proofPhotoUrl: 'https://example.test/private-pod',
    courier: {
      externalCode: 'GHN-C1',
      displayName: 'Shipper mô phỏng',
      phoneMasked: '09xx***123',
      vehiclePlate: 'TEST-123',
      phone: '0900000000',
    },
  });
  assert.equal(row.courier.phoneMasked, '09xx***123');
  assert.equal('phone' in row.courier, false);
  assert.equal('proofPhotoUrl' in row, false);
  assert.equal(row.attemptNo, 2);
  for (const phoneMasked of ['0900000000', '09xx<script>*']) {
    assert.equal(
      schema.safeParse({ ...row, courier: { ...row.courier, phoneMasked } }).success,
      false,
    );
  }
  for (const extra of [{ attemptNo: 0 }, { weightGram: 2000001 }, { reasonCode: 'x'.repeat(65) }]) {
    assert.equal(schema.safeParse({ ...row, ...extra }).success, false);
  }
});
