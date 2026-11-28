import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, display, label, policy, store, loadAccounts;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-11-18T00:00:00Z', path: '', requestId: 'test' },
  });
const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ freightTariffApi: api } = await server.ssrLoadModule(
    '/src/features/catalog/api/freightTariffApi.ts',
  ));
  display = await server.ssrLoadModule('/src/features/catalog/utils/rateDisplay.ts');
  label = await server.ssrLoadModule('/src/features/tenants/lib/freightTariffLabel.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ loadRateCollectionAccounts: loadAccounts } = await server.ssrLoadModule(
    '/src/features/catalog/hooks/useRateCollection.ts',
  ));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'test-token',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: null,
      email: 'test@orca.test',
      fullName: 'Test',
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
    },
  });
});
test('Accountant reaches tariffs without gaining carrier, credential or unrelated admin routes', () => {
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'tariffs.manage'), true);
  assert.equal(policy.isRouteAllowed(['ORCA_ACCOUNTANT'], '/admin/tariffs'), true);
  for (const route of ['/admin/carriers', '/admin/tenants', '/admin/unknown'])
    assert.equal(policy.isRouteAllowed(['ORCA_ACCOUNTANT'], route), false);
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'carriers.credentials.manage'), false);
  for (const roles of [
    ['SELLER_OWNER'],
    ['SELLER_STAFF'],
    ['WAREHOUSE_STAFF'],
    ['OPS_DISPATCHER'],
    ['ORCA_ADMIN', 'SELLER_OWNER'],
    ['ORCA_ADMIN', 'LEGACY'],
  ])
    assert.equal(policy.can(roles, 'tariffs.manage'), false);
});

test('freight API is read-only: only the carrier service list remains', async () => {
  assert.deepEqual(Object.keys(api), ['services']);
  const service = {
    id,
    carrierId: id,
    code: 'road',
    name: 'Express đường bộ',
    volumetricDivisor: 6000,
    carrier: { code: 'GHTK', name: 'GHTK' },
  };
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/platform/tariffs/services'));
    assert.equal(options?.method ?? 'GET', 'GET');
    return ok([service]);
  };
  assert.deepEqual(await api.services(), [service]);
  globalThis.fetch = async () => ok([{ ...service, volumetricDivisor: 0 }]);
  await assert.rejects(api.services());
});

test('the price board preserves carrier arrival dates and accepts historical quotes without them', async () => {
  const { rateQuotesApi } = await server.ssrLoadModule(
    '/src/features/catalog/api/rateQuotesApi.ts',
  );
  const expectedDeliveryAt = '2026-11-24T05:00:00.000Z';
  const cell = {
    serviceId: id,
    priceVnd: 20000,
    previousPriceVnd: null,
    deltaPct: null,
    deliveryDays: 6.1,
    isDeliverable: true,
  };
  const response = (quote) => ({
    columns: [],
    rows: [{ key: 'route', provinceName: 'Đà Nẵng', weightG: 500, isCod: false, quotes: [quote] }],
    generatedAt: '2026-11-18T00:00:00Z',
  });
  globalThis.fetch = async () => ok(response({ ...cell, expectedDeliveryAt }));
  assert.equal(
    (await rateQuotesApi.latest()).rows[0].quotes[0].expectedDeliveryAt,
    expectedDeliveryAt,
  );
  globalThis.fetch = async () => ok(response(cell));
  assert.equal((await rateQuotesApi.latest()).rows[0].quotes[0].expectedDeliveryAt, null);
});

test('price collection includes connected sandbox accounts beyond the first page', async () => {
  const secondId = '00000000-0000-4000-8000-000000000002';
  const account = (accountId, status) => ({
    id: accountId,
    warehouseId: id,
    carrierId: id,
    environment: 'SANDBOX',
    maskedPreview: 'test',
    pickupMapping: {},
    status,
    lastHealthAt: null,
    updatedAt: '2026-11-18T00:00:00Z',
    orcaCarrier: { code: 'GHTK', name: 'GHTK' },
  });
  let count = 0;
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(String(url), 'http://localhost').searchParams.get('environment'),
      'SANDBOX',
    );
    const nextPage = new URL(String(url), 'http://localhost').searchParams.get('cursor');
    count++;
    assert.equal(nextPage, count === 1 ? null : id);
    return Response.json({
      success: true,
      data: count === 1 ? [account(id, 'REVOKED')] : [account(secondId, 'CONNECTED')],
      meta: {
        timestamp: '2026-11-18T00:00:00Z',
        path: '',
        requestId: 'test',
        pagination: { hasNext: count === 1, nextCursor: count === 1 ? id : null, limit: 20 },
      },
    });
  };

  assert.deepEqual(
    (await loadAccounts()).map((row) => row.id),
    [secondId],
  );
  assert.equal(count, 2);
});

test('no manual rate-card editor, close window, contract import or setup guide is shipped', () => {
  const index = read('src/features/catalog/index.ts');
  for (const name of [
    'FreightTariffManager',
    'FreightTariffEditor',
    'FreightTariffClose',
    'RateContractImport',
    'RateWorkflowGuide',
    'RateIntelligenceManager',
  ])
    assert.equal(index.includes(name), false, name);
  const page = read('src/pages/admin/FreightTariffsPage.tsx');
  for (const tab of ["'prices'", "'selection'", "'service'"]) assert.ok(page.includes(tab), tab);
  assert.match(page, /CarrierPriceBoard/);
  assert.match(page, /CarrierAutoSelection/);
  assert.match(page, /ServiceTariffManager/);
  assert.equal(read('src/features/catalog/api/rateIntelligenceApi.ts').includes('/imports'), false);
});

test('tabs and the carrier API tariff wording exist in both languages', () => {
  for (const lang of ['vi', 'en']) {
    const messages = JSON.parse(read(`messages/${lang}.json`));
    for (const key of ['pricesTab', 'selectionTab', 'serviceTab'])
      assert.equal(typeof messages.ServiceTariffs[key], 'string', `${lang} ${key}`);
    assert.equal('freightTab' in messages.ServiceTariffs, false);
    assert.deepEqual(Object.keys(messages.FreightTariffs).sort(), ['accounts', 'catalogue']);
    assert.equal(typeof messages.CommercialAdmin.freightCarrierApi, 'string');
  }
  const vi = JSON.parse(read('messages/vi.json'));
  assert.equal(vi.ServiceTariffs.pricesTab, 'Giá hãng');
  assert.equal(vi.ServiceTariffs.selectionTab, 'Chọn hãng tự động');
  assert.equal(vi.ServiceTariffs.serviceTab, 'Phí dịch vụ');
  assert.equal(
    vi.CommercialAdmin.freightCarrierApi,
    'Cước vận chuyển: theo giá hãng tại thời điểm tạo vận đơn',
  );
});

test('contract and plan forms describe the CARRIER_API tariff in words', () => {
  const text = 'Cước vận chuyển: theo giá hãng tại thời điểm tạo vận đơn';
  assert.equal(label.isCarrierApiTariff('CARRIER_API'), true);
  assert.equal(label.isCarrierApiTariff('carrier_api'), false);
  assert.equal(label.freightTariffLabel({ code: 'CARRIER_API', versionNo: 1 }, text), text);
  assert.equal(label.freightTariffLabel({ code: 'BASIC', versionNo: 3 }, text), 'BASIC · v3');
  for (const path of [
    'src/features/tenants/components/CommercialPlanAdmin.tsx',
    'src/features/tenants/components/TenantContractTab.tsx',
  ])
    assert.match(read(path), /freightTariffLabel\(item, t\('freightCarrierApi'\)\)/, path);
});

test('delivery tier filter marks the cheapest for economy and the fastest for express', () => {
  assert.deepEqual(display.tierHighlights('ALL'), { isCheapestShown: true, isFastestShown: true });
  assert.deepEqual(display.tierHighlights('ECONOMY'), {
    isCheapestShown: true,
    isFastestShown: false,
  });
  assert.deepEqual(display.tierHighlights('EXPRESS'), {
    isCheapestShown: false,
    isFastestShown: true,
  });
});

test('the Admin quote comparison adds the saved markup only to a deliverable quote', () => {
  const quote = { priceVnd: 20000, isDeliverable: true };
  assert.equal(display.sellerQuoteVnd(quote, '5000'), 25000n);
  assert.equal(display.sellerQuoteVnd(quote, '0'), 20000n);
  assert.equal(display.sellerQuoteVnd(quote, undefined), null);
  assert.equal(display.sellerQuoteVnd({ ...quote, isDeliverable: false }, '5000'), null);
  assert.equal(display.sellerQuoteVnd({ ...quote, priceVnd: null }, '5000'), null);
  assert.equal(display.sellerQuoteVnd({ ...quote, priceVnd: 0 }, '5000'), null);
  assert.equal(
    display.sellerQuoteVnd({ ...quote, priceVnd: Number.MAX_SAFE_INTEGER }, '1'),
    9007199254740992n,
  );
});

test('D11 markup endpoint loads the version and writes the exact VND string', async () => {
  const { freightMarkupApi } = await server.ssrLoadModule(
    '/src/features/catalog/api/freightMarkupApi.ts',
  );
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/platform/tariffs/freight-markup'));
    const method = options?.method ?? 'GET';
    calls.push(method);
    if (method === 'GET') return ok({ markupVnd: '5000', version: 6 });
    assert.deepEqual(JSON.parse(options.body), { markupVnd: '0', expectedVersion: 6 });
    return ok({ markupVnd: '0', version: 7 });
  };
  const loaded = await freightMarkupApi.read();
  assert.deepEqual(loaded, { markupVnd: '5000', version: 6 });
  assert.deepEqual(
    await freightMarkupApi.save({ markupVnd: '0', expectedVersion: loaded.version }),
    {
      markupVnd: '0',
      version: 7,
    },
  );
  assert.deepEqual(calls, ['GET', 'PUT']);
  for (const malformed of [-10, '', '-1', '1.23', '1000000000000']) {
    globalThis.fetch = async () => ok({ markupVnd: malformed, version: 7 });
    await assert.rejects(freightMarkupApi.read());
  }
});

test('D11 Seller switch uses its own versioned endpoint and Owner permission', async () => {
  const { sellerDispatchPolicyApi } = await server.ssrLoadModule(
    '/src/features/orders/api/sellerDispatchPolicyApi.ts',
  );
  store.getState().setSession({
    accessToken: 'test-token',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: id,
      email: 'test@orca.test',
      fullName: 'Test',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
    },
  });
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/v1/orders/policy/dispatch'));
    if (options?.method === 'GET') return ok({ autoConfirm: true, version: 8 });
    assert.equal(options?.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { autoConfirm: false, expectedVersion: 8 });
    return ok({ autoConfirm: false, version: 9 });
  };
  const loaded = await sellerDispatchPolicyApi.read();
  assert.deepEqual(loaded, { autoConfirm: true, version: 8 });
  assert.deepEqual(
    await sellerDispatchPolicyApi.save({ autoConfirm: false, expectedVersion: loaded.version }),
    { autoConfirm: false, version: 9 },
  );
  globalThis.fetch = async () => ok({ autoConfirm: 'false', version: 9 });
  await assert.rejects(sellerDispatchPolicyApi.read());
  assert.equal(policy.can(['SELLER_OWNER'], 'orders.policy.manage'), true);
  assert.equal(policy.can(['SELLER_STAFF'], 'orders.policy.manage'), false);
  assert.equal(policy.can(['ORCA_ADMIN'], 'orders.policy.manage'), false);
  assert.match(
    read('src/pages/workspace/SettingsPage.tsx'),
    /can\('orders.policy.manage'\) && <SellerDispatchPolicySettings/,
  );
});

test('last price update ignores running, failed and old file-import jobs', () => {
  const job = (status, finishedAt, source = 'SANDBOX_API') => ({ status, finishedAt, source });
  assert.equal(display.latestPriceUpdate([]), null);
  assert.equal(
    display.latestPriceUpdate([
      job('RUNNING', null),
      job('FAILED', '2026-11-18T05:00:00.000Z'),
      job('SUCCEEDED', '2026-11-18T06:00:00.000Z', 'CONTRACT_IMPORT'),
      job('PARTIAL', '2026-11-18T03:00:00.000Z'),
      job('SUCCEEDED', '2026-11-18T04:00:00.000Z'),
    ]),
    '2026-11-18T04:00:00.000Z',
  );
});

test('balanced preference compares valid price and ETA without marking it cheapest or fastest', () => {
  assert.deepEqual(display.tierHighlights('BALANCED'), {
    isCheapestShown: false,
    isFastestShown: false,
  });
  const quotes = [
    { serviceId: 'cheap', priceVnd: 20000, deliveryDays: 10, isDeliverable: true },
    { serviceId: 'middle', priceVnd: 25000, deliveryDays: 3, isDeliverable: true },
    { serviceId: 'fast', priceVnd: 60000, deliveryDays: 1, isDeliverable: true },
    { serviceId: 'unknown', priceVnd: 1, deliveryDays: null, isDeliverable: true },
  ];
  const comparable = new Set(quotes.map((quote) => quote.serviceId));
  assert.equal(display.balancedServiceId(quotes, comparable), 'middle');
  const withZero = [
    ...quotes,
    { serviceId: 'zero', priceVnd: 0, deliveryDays: 0, isDeliverable: true },
  ];
  assert.equal(display.balancedServiceId(withZero, new Set([...comparable, 'zero'])), 'middle');
  assert.equal(display.balancedServiceId(quotes, new Set(['middle'])), null);
});
