import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
const namespaces = [
  'Orders',
  'Inventory',
  'InventoryDetail',
  'InventoryWorkflows',
  'Receiving',
  'Asns',
  'Putaway',
  'Relocation',
  'Picking',
  'Packing',
  'Shipments',
  'Returns',
  'LotTrace',
  'Warehouses',
  'Warehouse3D',
];
function entries(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'string' ? [[`${prefix}${key}`, item]] : entries(item, `${prefix}${key}.`),
  );
}
test('Vietnamese order and warehouse copy avoids mixed operational English', () => {
  const mixed =
    /\b(pick|putback|putaway|wave|booking|retry|reservation|manager|staff|admin|cut-off|downtime|barcode|zoom|snapshot|payload|quarantine|sellable|QC|ASN|SKU)\b/i;
  for (const namespace of namespaces) {
    for (const [key, value] of entries(vi[namespace])) {
      const visible = value.replace(/\{[^{}]*\}/g, '');
      assert.ok(!mixed.test(visible), `${namespace}.${key}: ${value}`);
    }
  }
  assert.equal(vi.InventoryWorkflows.putbacks, 'Hoàn hàng đã lấy');
  assert.equal(vi.InventoryWorkflows.putbackRequest, 'Lập phiếu hoàn hàng đã lấy');
});
test('localized flow messages preserve keys and interpolation variables', () => {
  const variables = (value) => [...value.matchAll(/\{([\w]+)(?:,|\})/g)].map((m) => m[1]).sort();
  for (const namespace of namespaces) {
    const english = new Map(entries(en[namespace]));
    for (const [key, value] of entries(vi[namespace])) {
      assert.ok(english.has(key), `Missing English key ${namespace}.${key}`);
      assert.deepEqual(variables(value), variables(english.get(key)), `${namespace}.${key}`);
    }
  }
});
