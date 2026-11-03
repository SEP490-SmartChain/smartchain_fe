import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, Positions, messages;
before(async () => {
  messages = Object.fromEntries(
    await Promise.all(
      ['en', 'vi'].map(async (locale) => [
        locale,
        JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')),
      ]),
    ),
  );
  server = await createServer({
    configFile: false,
    envFile: false,
    plugins: [react()],
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ InventoryPositionsTable: Positions } = await server.ssrLoadModule(
    '/src/features/inventory/components/InventoryPositionsTable.tsx',
  ));
});
after(async () => server?.close());

const receiving = {
  id: '00000000-0000-4000-8000-000000000001',
  sku: 'TV-01',
  productName: 'Tivi Xiaomi',
  warehouseCode: 'ORCA1',
  lotCode: 'RCV-6dcf6ea2-f370-4ba7-ba56-4041d5f9c25e',
  binCode: 'HHHH-01',
  expiresOn: null,
  lotStatus: 'SELLABLE',
  stockState: 'RECEIVING',
  onHandQty: 10,
  reservedQty: 0,
  availableQty: 10,
  eligibilityReason: 'NOT_STORAGE',
};
function render(row = receiving, locale = 'en') {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages: messages[locale], timeZone: 'UTC' },
      createElement(Positions, { positions: [row], isLoading: false, emptyMessage: 'Empty' }),
    ),
  );
}

test('receiving stock keeps physical quantities and shows putaway as the outbound condition', () => {
  const html = render();
  // Lot metadata is available on demand; it must not compete with outbound status.
  const visibleContent = html.replace(/<details\b[\s\S]*?<\/details>/g, '');
  assert.match(visibleContent, /Awaiting putaway/);
  assert.match(visibleContent, /Receiving/);
  assert.doesNotMatch(visibleContent, /Sellable/);
  for (const [label, quantity] of [
    ['On hand', 10],
    ['Reserved', 0],
    ['Unreserved', 10],
  ]) {
    assert.match(html, new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${quantity}</dd>`));
  }
  assert.match(html, /<details class=/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|>)/);
  assert.ok(html.includes(receiving.lotCode));
});

test('outbound eligibility follows the server even when physical stock remains', () => {
  for (const reason of [
    'ELIGIBLE',
    'UNMAPPED',
    'BLOCKED',
    'INACTIVE',
    'SHELF_LIFE',
    'NOT_STORAGE',
  ]) {
    const html = render({ ...receiving, eligibilityReason: reason });
    assert.ok(html.includes(messages.en.InventoryDetail.eligibilityLabel[reason]), reason);
    assert.ok(html.includes(messages.en.InventoryDetail.eligibilityReason[reason]), reason);
    assert.match(html, /Unreserved</);
    assert.match(html, />10<\/dd>/);
  }
});

test('missing lot, bin and expiry remain explicit in both languages', () => {
  for (const locale of ['vi', 'en']) {
    const html = render({ ...receiving, lotCode: null, binCode: null, lotStatus: null }, locale);
    for (const key of ['missingLot', 'missingBin', 'missingLotStatus', 'noExpiry']) {
      assert.ok(html.includes(messages[locale].InventoryDetail[key]), `${locale}.${key}`);
    }
  }
});
