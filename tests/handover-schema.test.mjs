import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, schema;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ handoverAckSchema: schema } = await server.ssrLoadModule(
    '/src/features/orders/schemas/packingSchema.ts',
  ));
});
after(async () => server?.close());
for (const count of [undefined, 0, -1, 1.5, 101, NaN])
  test('handover rejects invalid physical count ' + count, () => {
    assert.equal(
      schema.safeParse({
        confirmedParcelCount: count,
        carrierAckRef: 'ACK',
        carrierSignerName: 'Driver',
      }).success,
      false,
    );
  });
for (const key of ['evidenceKey', 'carrierSignerName'])
  test('handover rejects blank ' + key, () => {
    assert.equal(
      schema.safeParse({
        confirmedParcelCount: 1,
        carrierAckRef: 'ACK',
        carrierSignerName: 'Driver',
        evidenceKey: 'private-photo',
        [key]: '   ',
      }).success,
      false,
    );
  });
test('handover preserves explicit count and trims evidence', () => {
  assert.deepEqual(
    schema.parse({
      confirmedParcelCount: 100,
      carrierAckRef: ' ACK ',
      carrierSignerName: ' Driver ',
      evidenceKey: 'private-photo',
    }),
    {
      confirmedParcelCount: 100,
      carrierAckRef: 'ACK',
      carrierSignerName: 'Driver',
      evidenceKey: 'private-photo',
    },
  );
});
for (const carrierAckRef of [undefined, '', '   '])
  test('carrier receipt is optional: ' + carrierAckRef, () => {
    assert.equal(
      schema.safeParse({
        confirmedParcelCount: 1,
        carrierAckRef,
        carrierSignerName: 'Driver',
        evidenceKey: 'private-photo',
      }).success,
      true,
    );
  });
test('physical handover requires an attached evidence image', () => {
  assert.equal(
    schema.safeParse({ confirmedParcelCount: 1, carrierSignerName: 'Driver' }).success,
    false,
  );
});
