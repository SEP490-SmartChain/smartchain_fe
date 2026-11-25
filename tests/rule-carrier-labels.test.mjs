import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server, ServiceChain, carrierServiceLabel, ruleDisplayName;
const messages = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ServiceChain } = await server.ssrLoadModule(
    '/src/features/rules/components/ServiceChain.tsx',
  ));
  ({ carrierServiceLabel, ruleDisplayName } = await server.ssrLoadModule(
    '/src/features/rules/lib/carrierLabels.ts',
  ));
});

after(async () => server?.close());

function render(props) {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'vi', messages, timeZone: 'Asia/Ho_Chi_Minh' },
      createElement(ServiceChain, props),
    ),
  );
}

test('legacy service names identify the carriers without changing primary or fallback IDs', () => {
  const serviceNames = Object.freeze({ ghn: 'Hàng nhẹ', ghtk: 'Đường bộ' });
  for (const ids of [Object.freeze(['ghn', 'ghtk']), Object.freeze(['ghtk', 'ghn'])]) {
    const html = render({ ids, serviceNames, isReady: true });
    const primary = ids[0] === 'ghn' ? 'GHN · Hàng nhẹ' : 'GHTK · Đường bộ';
    const fallback = ids[1] === 'ghn' ? 'GHN · Hàng nhẹ' : 'GHTK · Đường bộ';
    assert.ok(html.includes(primary), html);
    assert.ok(html.indexOf(primary) < html.indexOf(fallback), html);
  }
  assert.deepEqual(serviceNames, { ghn: 'Hàng nhẹ', ghtk: 'Đường bộ' });
});

test('carrier-qualified names from a newer API remain unchanged', () => {
  const html = render({
    ids: ['ghn', 'ghtk'],
    serviceNames: { ghn: 'GHN · Hàng nhẹ', ghtk: 'Giao Hàng Tiết Kiệm · Đường bộ' },
    isReady: true,
  });
  assert.equal((html.match(/GHN/g) ?? []).length, 1);
  assert.ok(html.includes('Giao Hàng Tiết Kiệm · Đường bộ'));
  assert.ok(!html.includes('GHTK ·'));
});

test('unknown and unavailable services keep their existing labels', () => {
  const html = render({
    ids: ['other', 'missing'],
    serviceNames: { other: 'Đường bộ nhanh' },
    isReady: true,
  });
  assert.ok(html.includes('Đường bộ nhanh'));
  assert.ok(!html.includes('GHN') && !html.includes('GHTK'));
  assert.ok(html.includes(messages.Rules.serviceUnavailable));
});

test('only the final known service suffix of a carrier rule title is decorated', () => {
  for (const [service, label] of [
    ['Hàng nhẹ', 'GHN · Hàng nhẹ'],
    ['Đường bộ', 'GHTK · Đường bộ'],
  ]) {
    const rule = Object.freeze({ kind: 'CARRIER', name: `Hà Nội · 500 g – 1 kg → ${service}` });
    assert.equal(ruleDisplayName(rule), `Hà Nội · 500 g – 1 kg → ${label}`);
    assert.equal(rule.name, `Hà Nội · 500 g – 1 kg → ${service}`);
  }
});

test('custom, allocation and already qualified titles are preserved', () => {
  for (const name of [
    'Ưu tiên Hàng nhẹ',
    'Hà Nội → Đường bộ nhanh',
    'Hà Nội → GHN · Hàng nhẹ',
    'Hà Nội → Giao Hàng Tiết Kiệm · Đường bộ',
  ]) {
    assert.equal(ruleDisplayName({ kind: 'CARRIER', name }), name);
  }
  assert.equal(ruleDisplayName({ kind: 'ALLOCATION', name: 'Kho → Hàng nhẹ' }), 'Kho → Hàng nhẹ');
  assert.equal(carrierServiceLabel('constructor'), 'constructor');
});
