// Visual fixture only; never imported by the production router.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '../../src/styles/globals.css';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import { InventoryWorkspace } from '../../src/features/inventory';
import { useAuthStore } from '../../src/stores/authStore';

const query = new URLSearchParams(location.search);
const role = query.get('role') || 'WAREHOUSE_MANAGER';
const scenario = query.get('scenario') || 'populated';
const locale = query.get('locale') === 'en' ? 'en' : 'vi';
if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
const uuid = (value: number) => `10250000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const tenant = role.startsWith('SELLER_');
const principal = {
  userId: uuid(9),
  tenantId: tenant ? uuid(8) : null,
  actorScope: tenant ? ('TENANT' as const) : ('PLATFORM' as const),
  roles: [role],
  permissions: [],
  warehouseIds: [uuid(1), uuid(2)],
  email: 'preview@example.test',
  fullName: role,
};
useAuthStore
  .getState()
  .setSession({ user: principal, accessToken: 'synthetic-local-inventory', expiresIn: 3600 });
const warehouses = [
  { id: uuid(1), code: 'HN-01', name: 'Kho Hà Nội' },
  { id: uuid(2), code: 'HCM-01', name: 'Kho Hồ Chí Minh' },
];
const states = [
  'SELLABLE',
  'NEAR_EXPIRY',
  'QUARANTINE',
  'NEAR_EXPIRY_LOCKED',
  'EXPIRED',
  'RECALLED',
];
const reasons = ['ELIGIBLE', 'ELIGIBLE', 'BLOCKED', 'SHELF_LIFE', 'BLOCKED', 'BLOCKED'];
const products = [
  'Cà phê Arabica 250g',
  'Sữa yến mạch 1L',
  'Trà xanh 100g',
  'Nước ép cam 500ml',
  'Bánh hạt dinh dưỡng',
  'Bột cacao 200g',
];
const ok = (data: unknown, hasNext = false) =>
  Response.json({
    success: true,
    data,
    meta: { pagination: { limit: 50, hasNext, nextCursor: hasNext ? uuid(99) : null } },
  });
const fail = (status: number) =>
  Response.json(
    {
      success: false,
      error: { code: 'PREVIEW.ERROR', statusCode: status, message: 'Synthetic preview error' },
      meta: {},
    },
    { status },
  );
let warehouseFailed = false;
let pageFailed = false;
const requests: string[] = [];
// Explicit debug evidence for local UI verification.
Object.assign(window, { inventoryPreviewRequests: requests });
window.fetch = async (input, options = {}) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.origin,
  );
  const path = url.pathname;
  requests.push(`${options.method || 'GET'} ${path}${url.search}`);
  if (options.method && options.method !== 'GET') return fail(405);
  if (path.endsWith('/warehouses')) {
    if (scenario === 'warehouse-error' && !warehouseFailed) {
      warehouseFailed = true;
      return fail(503);
    }
    if (scenario === 'warehouse-loading') await new Promise((resolve) => setTimeout(resolve, 5000));
    return ok(
      scenario === 'no-warehouses'
        ? []
        : scenario === 'single-warehouse'
          ? warehouses.slice(0, 1)
          : warehouses,
    );
  }
  if (scenario === 'denied') return fail(403);
  if (scenario === 'error') return fail(503);
  if (scenario === 'loading') await new Promise((resolve) => setTimeout(resolve, 5000));
  if (scenario === 'slow-switch')
    await new Promise((resolve) =>
      setTimeout(resolve, url.searchParams.get('warehouseId') === uuid(1) ? 2000 : 100),
    );
  if (scenario === 'page-error' && url.searchParams.has('cursor') && !pageFailed) {
    pageFailed = true;
    return fail(503);
  }
  const warehouse =
    warehouses.find((item) => item.id === url.searchParams.get('warehouseId')) || warehouses[0];
  const search = (url.searchParams.get('search') || '').toLowerCase();
  const empty = scenario === 'empty' || search.includes('missing');
  const hasNext = ['paginated', 'page-error'].includes(scenario) && !url.searchParams.has('cursor');
  const offset = url.searchParams.has('cursor') ? 10 : 0;
  if ((path.endsWith('/stocks') || path.endsWith('/stocks/summary')) && !tenant) return fail(403);
  if (path.endsWith('/stocks/summary')) return ok({ totalSkus: 248, availableUnits: 14820 });
  if (path.endsWith('/stocks'))
    return ok(
      empty
        ? []
        : products.map((productName, i) => ({
            id: uuid(20 + i + offset),
            productId: uuid(40 + i),
            sku: `SKU-${i + 1}`,
            productName,
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            onHandQty: 120 - i * 10,
            reservedQty: i * 3,
            availableQty: 120 - i * 13,
            lastSyncedAt: '2026-10-15T03:00:00.000Z',
          })),
      hasNext,
    );
  if (path.endsWith('/positions') && scenario === 'receiving')
    return ok([
      {
        id: uuid(20),
        sku: 'Tivi',
        productName: 'Tivi Xiaomi',
        warehouseCode: 'ORCA1',
        lotCode: 'RCV-6dcf6ea2-f370-4ba7-ba56-4041d5f9c25e',
        binCode: 'HHHH-01',
        expiresOn: null,
        lotStatus: 'SELLABLE',
        stockState: 'RECEIVING',
        positionKind: 'LOT_BIN',
        onHandQty: 10,
        reservedQty: 0,
        availableQty: 10,
        eligibilityReason: 'NOT_STORAGE',
      },
    ]);
  if (path.endsWith('/positions'))
    return ok(
      empty
        ? []
        : products
            .map((productName, i) => ({
              id: uuid(20 + i + offset),
              sku: `SKU-${i + 1}`,
              productName,
              warehouseCode: warehouse.code,
              lotCode: i === 2 ? null : `LOT-2026-${i + 1}`,
              binCode: i === 2 ? null : `A-0${i + 1}`,
              expiresOn: i === 2 ? null : '2026-11-15',
              lotStatus: states[i],
              stockState: i === 2 ? 'QUARANTINE' : 'SELLABLE',
              positionKind: 'LOT_BIN',
              onHandQty: 120 - i * 10,
              reservedQty: i * 3,
              availableQty: 120 - i * 13,
              eligibilityReason: reasons[i],
            }))
            .filter(
              (item) =>
                !url.searchParams.get('lotStatus') ||
                item.lotStatus === url.searchParams.get('lotStatus'),
            ),
      hasNext,
    );
  if (path.endsWith('/near-expiry'))
    return ok(
      empty
        ? []
        : products.slice(1).map((productName, i) => ({
            id: uuid(20 + i + offset),
            lotId: uuid(50 + i),
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            sku: `SKU-${i + 2}`,
            productName,
            lotCode: `LOT-2026-${i + 2}`,
            binCode: `A-0${i + 2}`,
            expiresOn:
              i === 3 ? null : i === 2 ? '2026-10-13' : i === 1 ? '2026-10-15' : '2026-11-14',
            remainingDays: [30, 0, -2, null, 3][i],
            lotStatus: ['NEAR_EXPIRY', 'NEAR_EXPIRY_LOCKED', 'EXPIRED', 'QUARANTINE', 'RECALLED'][
              i
            ],
            onHandQty: 60,
            reservedQty: 10,
            availableQty: 50,
            minOutboundDays: 7,
            warningDays: 45,
            isBlocked: i > 0,
            stockVersion: 1,
            lotVersion: 1,
          })),
      hasNext,
    );
  if (path.endsWith('/ledger'))
    return ok(
      empty
        ? []
        : ['RECEIVE', 'PICK', 'RESERVE', 'RELEASE'].map((type, i) => ({
            id: uuid(20 + i + offset),
            sku: `SKU-${i + 1}`,
            warehouseCode: warehouse.code,
            lotCode: `LOT-2026-${i + 1}`,
            binCode: 'A-01',
            type,
            onHandDelta: [120, -8, 0, 0][i],
            reservedDelta: [0, -8, 10, -10][i],
            onHandAfter: 120,
            reservedAfter: 10,
            refType: 'inventory_operation',
            refId: uuid(60 + i),
            actorReference: 'warehouse-staff-01',
            createdAt: '2026-10-15T03:00:00.000Z',
          })),
      hasNext,
    );
  if (path.endsWith('/notification-settings'))
    return ok({
      tenantId: uuid(8),
      warehouseId: null,
      version: 1,
      expiryEnabled: true,
      lowStockEnabled: false,
      lowStockAvailable: false,
      warningDays: 45,
      transitDays: 2,
      bufferDays: 5,
      emailRecipient: 'preview@example.test',
      zaloRecipient: null,
      channels: ['EMAIL'],
      updatedAt: '2026-10-15T03:00:00.000Z',
    });
  return fail(403);
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : vi}>
      <main className="mx-auto max-w-[1200px] p-4 sm:p-8">
        <p className="mb-4 text-xs text-[var(--sc-text-secondary)]">
          Local preview · synthetic data · {role} · {scenario}
        </p>
        <InventoryWorkspace />
      </main>
    </NextIntlClientProvider>
  </React.StrictMode>,
);
