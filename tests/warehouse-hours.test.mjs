import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: false,
  envFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { middlewareMode: true, watch: null, ws: false },
});
const hours = await server.ssrLoadModule('/src/features/catalog/utils/warehouseHours.ts');
await server.close();

test('HH:mm round-trips to stored minutes', () => {
  for (const [time, minute] of [
    ['08:00', 480],
    ['14:00', 840],
    ['18:00', 1080],
    ['00:00', 0],
    ['23:59', 1439],
  ]) {
    assert.equal(hours.timeToMinute(time), minute);
    assert.equal(hours.minuteToTime(minute), time);
  }
});
test('24:00 is the dedicated end-of-day value, never folded into 0 or 1439', () => {
  assert.equal(hours.END_OF_DAY_MINUTE, 1440);
  assert.equal(hours.minuteToTime(1440), '');
  assert.equal(hours.timeToMinute('24:00'), null);
});
test('invalid input is rejected instead of guessed', () => {
  for (const bad of ['', '8:00', '25:00', '12:60', 'ab:cd'])
    assert.equal(hours.timeToMinute(bad), null);
  for (const bad of [-1, 1.5, NaN]) assert.equal(hours.minuteToTime(bad), '');
});
