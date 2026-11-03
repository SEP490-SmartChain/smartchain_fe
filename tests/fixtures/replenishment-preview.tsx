// Isolated visual fixture, never imported by the production router. No real API calls.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '../../src/styles/globals.css';
import vi from '../../messages/vi.json';
import { RunningLowCard } from '../../src/features/inventory/components/RunningLowCard';
import { AsnAllocationSuggestion } from '../../src/features/inbound/components/AsnAllocationSuggestion';
import { useAuthStore } from '../../src/stores/authStore';
const id = '00000000-0000-4000-8000-000000000001';
useAuthStore
  .getState()
  .setSession({
    accessToken: 'synthetic-preview-only',
    expiresIn: 3600,
    user: {
      userId: id,
      tenantId: id,
      actorScope: 'TENANT',
      email: 'preview@example.test',
      fullName: 'Preview',
      roles: ['SELLER_OWNER'],
      permissions: [],
    },
  });
const warehouses = [
  {
    warehouseId: id,
    warehouseCode: 'HN-01',
    warehouseName: 'Kho Hà Nội',
    region: 'NORTH',
    dailyVelocity: 10,
    sharePercent: 30,
    suggestedQty: 100,
    cappedByExpiry: true,
    maxSellableBeforeExpiry: 100,
    redistributedQty: 0,
  },
  {
    warehouseId: '00000000-0000-4000-8000-000000000002',
    warehouseCode: 'HCM-01',
    warehouseName: 'Kho Hồ Chí Minh',
    region: 'SOUTH',
    dailyVelocity: 20,
    sharePercent: 60,
    suggestedQty: 200,
    cappedByExpiry: true,
    maxSellableBeforeExpiry: 200,
    redistributedQty: 0,
  },
  {
    warehouseId: '00000000-0000-4000-8000-000000000003',
    warehouseCode: 'DN-01',
    warehouseName: 'Kho Đà Nẵng',
    region: 'CENTRAL',
    dailyVelocity: 10 / 3,
    sharePercent: 10,
    suggestedQty: 33,
    cappedByExpiry: true,
    maxSellableBeforeExpiry: 33,
    redistributedQty: 0,
  },
];
window.fetch = async (input) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.origin,
  );
  const data = url.pathname.endsWith('/running-low')
    ? [
        {
          productId: id,
          sku: 'ORCA-001',
          productName: 'Sữa yến mạch hữu cơ 1L',
          warehouseId: id,
          warehouseCode: 'HN-01',
          warehouseName: 'Kho Hà Nội',
          availableStock: 139,
          dailyVelocity: 20,
          daysOfStockLeft: 6.95,
          suggestedReplenishmentQty: 281,
          urgencyLevel: 'WARNING',
        },
      ]
    : {
        productId: id,
        sku: 'ORCA-001',
        productName: 'Sữa yến mạch hữu cơ 1L',
        totalQuantity: 400,
        declaredExpiryOn: '2026-10-29',
        daysUntilExpiry: 10,
        hasSufficientHistory: true,
        basis: 'HISTORICAL_VELOCITY_30D',
        unallocatedQuantity: 67,
        warnings: ['UNALLOCATED_EXPIRY_CAPACITY'],
        allocations: warehouses,
      };
  return Response.json({ success: true, data, meta: {} });
};
function Preview() {
  const [chosen, setChosen] = useState('');
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <p className="text-sm text-[var(--sc-text-secondary)]">SS-1004 · Dữ liệu minh họa</p>
        <h1 className="text-2xl font-semibold">Kế hoạch bổ sung tồn kho</h1>
      </div>
      <RunningLowCard />
      <AsnAllocationSuggestion
        productId={id}
        quantity={400}
        expiry="2026-10-29"
        disabled={false}
        onChoose={(warehouse, qty) => setChosen(`${warehouse}: ${qty}`)}
      />
      {chosen && <p role="status">Đã chọn cho bản nháp: {chosen}</p>}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale="vi" messages={vi}>
    <BrowserRouter>
      <Preview />
    </BrowserRouter>
  </NextIntlClientProvider>,
);
