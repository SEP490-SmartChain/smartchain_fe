import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server, getCarrierDisplayInfo, getJourneyBadgeProps, getJourneyStepIndex;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ getCarrierDisplayInfo, getJourneyBadgeProps } = await server.ssrLoadModule(
    '/src/features/shipments/lib/carrierTracking.ts',
  ));
  ({ getJourneyStepIndex } = await server.ssrLoadModule(
    '/src/features/shipments/components/ShipmentJourneyStepper.tsx',
  ));
});

after(async () => {
  await server?.close();
});

test('getCarrierDisplayInfo handles GHTK, GHN and generic carriers with valid tracking URLs', () => {
  const ghtk = getCarrierDisplayInfo('GHTK', 'S22439161.1150057858');
  assert.equal(ghtk.code, 'GHTK');
  assert.equal(ghtk.trackingUrl, 'https://i.ghtk.vn/S22439161.1150057858');

  const ghn = getCarrierDisplayInfo('GHN', 'LYG4E7');
  assert.equal(ghn.code, 'GHN');
  assert.equal(ghn.trackingUrl, 'https://donhang.ghn.vn/?order_code=LYG4E7');

  const unknown = getCarrierDisplayInfo(null, null);
  assert.equal(unknown.code, 'N/A');
  assert.equal(unknown.trackingUrl, null);
});

test('getJourneyStepIndex maps lifecycle statuses to correct step sequence', () => {
  assert.equal(getJourneyStepIndex('LABEL_CREATED'), 0);
  assert.equal(getJourneyStepIndex('PICKED_UP'), 1);
  assert.equal(getJourneyStepIndex('IN_TRANSIT'), 2);
  assert.equal(getJourneyStepIndex('OUT_FOR_DELIVERY'), 3);
  assert.equal(getJourneyStepIndex('DELIVERED'), 4);
});

test('getJourneyBadgeProps returns distinct status indicators', () => {
  assert.equal(getJourneyBadgeProps('DELIVERED').status, 'success');
  assert.equal(getJourneyBadgeProps('OUT_FOR_DELIVERY').status, 'warning');
  assert.equal(getJourneyBadgeProps('IN_TRANSIT').status, 'info');
  assert.equal(getJourneyBadgeProps('DELIVERY_FAILED').status, 'error');
});
