import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  envFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { middlewareMode: true, watch: null, ws: false },
});
const lib = await server.ssrLoadModule('/src/features/catalog/utils/locationCoordinates.ts');
await server.close();

test('coordinates are valid only as finite numbers inside the WGS84 range', () => {
  assert.equal(lib.isValidCoordinate(10.77, 106.7), true);
  for (const [lat, lng] of [
    [NaN, 1],
    [91, 1],
    [1, 181],
    ['1', 1],
    [undefined, 1],
  ])
    assert.equal(lib.isValidCoordinate(lat, lng), false);
});
