import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
let server, target;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  target = (await server.ssrLoadModule('/src/lib/notificationTarget.ts')).notificationTarget;
});
after(async () => {
  await server?.close();
});
const id = '10350000-0000-4000-8000-000000000001';
test('accepts only a single canonical document reference, independently of extra command-looking text', () => {
  for (const key of ['invoiceId', 'statementId', 'orderId']) {
    assert.equal(target(`?${key}=${id}&confirm=true`, key), id);
    for (const search of [
      `?${key}=invalid`,
      `?${key}=------------------------------------`,
      `?${key}=${id}&${key}=${id}`,
      `?tenantId=${id}`,
      `?${key}=${id}/confirm`,
      '?x=' + 'x'.repeat(2049),
    ])
      assert.equal(target(search, key), null);
  }
});
test('financial entry mounts existing details and order entry performs only an authenticated detail read', async () => {
  const invoice = await readFile(
    new URL('../src/features/tenants/components/FulfillmentBilling.tsx', import.meta.url),
    'utf8',
  );
  const statement = await readFile(
    new URL('../src/features/tenants/components/SellerPayoutWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const orders = await readFile(
    new URL('../src/features/orders/components/SellerOrders.tsx', import.meta.url),
    'utf8',
  );
  assert.match(invoice, /notificationTarget\(useLocation\(\)\.search, 'invoiceId'\)/);
  assert.match(invoice, /initialId=\{linkedInvoice\}/);
  assert.match(statement, /initialId=\{linkedStatement\}/);
  assert.match(orders, /ordersApi\s*\.detail\(initialId, owner, controller.signal\)/);
  const effect = orders.slice(
    orders.indexOf('if (!initialId'),
    orders.indexOf('[initialId, owner, scope, t]'),
  );
  assert.doesNotMatch(effect, /\.(confirm|cancel|pay|approve|dispute)\(/);
  assert.match(effect, /controller.abort\(\)/);
});
