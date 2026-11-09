import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server, confirmation, Form, schema, formSchema;
const source = {
  id: '00000000-0000-4000-8000-000000000001',
  version: 2,
  sku: 'SKU-A',
  productName: 'Áo mẫu',
  lotCode: 'LOT-A',
  fromBinId: '00000000-0000-4000-8000-000000000002',
  fromBinCode: 'A-1',
  stockState: 'SELLABLE',
  availableQty: 5,
};
const destination = { id: '00000000-0000-4000-8000-000000000003', code: 'B-1' };
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
  ({ manualRelocationConfirmation: confirmation } = await server.ssrLoadModule(
    '/src/features/inbound/lib/relocationConfirmation.ts',
  ));
  ({ RelocationForm: Form } = await server.ssrLoadModule(
    '/src/features/inbound/components/RelocationForm.tsx',
  ));
  ({ relocationInputSchema: schema } = await server.ssrLoadModule(
    '/src/features/inbound/api/relocationApi.ts',
  ));
  ({ createRelocationFormSchema: formSchema } = await server.ssrLoadModule(
    '/src/features/inbound/schemas/relocationSchema.ts',
  ));
});
after(async () => server?.close());

test('manual selection does not claim physical confirmation before the operator acknowledges it', () => {
  for (const args of [
    [destination, false],
    [null, true],
    [{ id: source.fromBinId, code: 'A-1' }, true],
  ]) {
    assert.deepEqual(confirmation(source, ...args), {
      fromBinScan: '',
      toBinScan: '',
      skuScan: '',
      lotScan: '',
    });
  }
});
test('acknowledgement binds exactly the chosen source SKU/lot and destination; clearing it removes proof fields', () => {
  assert.deepEqual(confirmation(source, destination, true), {
    fromBinScan: 'A-1',
    toBinScan: 'B-1',
    skuScan: 'SKU-A',
    lotScan: 'LOT-A',
  });
  assert.deepEqual(confirmation(source, { ...destination, code: 'C-1' }, false), {
    fromBinScan: '',
    toBinScan: '',
    skuScan: '',
    lotScan: '',
  });
});
test('manual confirmation uses the existing strict API payload without client-supplied stock effects', () => {
  const input = {
    operationKey: source.id,
    expectedVersion: 2,
    toBinId: destination.id,
    qty: 1,
    reason: 'Reorganize bin',
    ...confirmation(source, destination, true),
  };
  assert.equal(schema.safeParse(input).success, true);
  assert.equal(schema.safeParse({ ...input, stockState: 'SELLABLE' }).success, false);
  assert.equal(schema.safeParse({ ...input, qty: 0 }).success, false);
});
test('one unreserved unit permits exactly one and rejects overage, empty, fractional and non-finite quantities', () => {
  const bounded = formSchema({ ...source, availableQty: 1 });
  const input = {
    operationKey: source.id,
    expectedVersion: 2,
    toBinId: destination.id,
    reason: 'Reorganize bin',
    ...confirmation(source, destination, true),
  };
  assert.equal(bounded.safeParse({ ...input, qty: 1 }).success, true);
  for (const qty of [undefined, NaN, Infinity, -1, 0, 0.5, 2, 11212]) {
    const parsed = bounded.safeParse({ ...input, qty });
    assert.equal(parsed.success, false, `qty=${qty} must not be sent`);
    assert.equal(
      parsed.error.issues.some((issue) => issue.path[0] === 'qty'),
      true,
    );
  }
});
test('quantity limit remains a field error even before required destination and scans are entered', () => {
  const bounded = formSchema(source);
  const parsed = bounded.safeParse({ qty: 11212 });
  assert.equal(parsed.success, false);
  assert.equal(
    parsed.error.issues.some((issue) => issue.path[0] === 'qty'),
    true,
  );
  assert.equal(bounded.shape.qty.safeParse(source.availableQty).success, true);
  assert.equal(bounded.shape.qty.safeParse(source.availableQty + 1).success, false);
});
test('compact form shows one destination chooser and reason selector, with scans hidden in manual mode', () => {
  const messages = JSON.parse(
    readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
  );
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { messages, locale: 'vi', timeZone: 'UTC' },
      createElement(Form, {
        source,
        warehouse: source.id,
        disabled: false,
        onLock: () => {},
        onSaved: () => {},
        onClose: () => {},
      }),
    ),
  );
  assert.match(html, /Chọn hoặc tìm kệ đích/);
  assert.match(html, /Tôi đã đối chiếu đúng hàng/);
  assert.match(html, /Sắp xếp lại vị trí/);
  assert.doesNotMatch(html, /name="(?:fromBinScan|toBinScan|skuScan|lotScan)"/);
  assert.doesNotMatch(html, /value="0"/);
});
