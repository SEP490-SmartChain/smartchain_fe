// Isolated synthetic visual fixture; never imported by the production router.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '../../src/styles/globals.css';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import { ServiceTariffManager } from '../../src/features/tenants';
import type { ServiceTariff } from '../../src/features/tenants/schemas/serviceTariffSchema';
import { useAuthStore } from '../../src/stores/authStore';

const query = new URLSearchParams(location.search);
const role = query.get('role') ?? 'ORCA_ACCOUNTANT';
const locale = query.get('locale') === 'en' ? 'en' : 'vi';
if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
const id = (n: number) => `99900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
useAuthStore
  .getState()
  .setSession({
    accessToken: 'synthetic-service-tariff-preview',
    expiresIn: 3600,
    user: {
      userId: id(9),
      tenantId: role.startsWith('SELLER') ? id(8) : null,
      actorScope: role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
      roles: [role],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic tariff reviewer',
    },
  });
let versions: ServiceTariff[] = [
  {
    id: id(1),
    code: 'FULFILLMENT',
    versionNo: 1,
    status: 'DRAFT',
    effectiveFrom: '2026-11-01T00:00:00.000Z',
    effectiveTo: null,
    updatedAt: '2026-10-17T00:00:00.000Z',
    lines: [
      {
        feeType: 'PICK_PACK_ORDER',
        unit: 'ORDER',
        lowerBound: '0',
        upperBound: null,
        unitPriceVnd: '8000',
        rounding: 'CEIL_VND',
      },
      {
        feeType: 'INBOUND_CARTON',
        unit: 'CARTON',
        lowerBound: '0',
        upperBound: null,
        unitPriceVnd: '20000',
        rounding: 'CEIL_VND',
      },
      {
        feeType: 'RETURN_HANDLING',
        unit: 'PARCEL',
        lowerBound: '0',
        upperBound: null,
        unitPriceVnd: '5000',
        rounding: 'CEIL_VND',
      },
    ],
  },
];
const ok = (data: unknown, pagination = false) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-17T00:00:00Z',
      path: '/api/v1/commercial/service-tariffs',
      requestId: 'synthetic-ss999',
      ...(pagination ? { pagination: { limit: 20, hasNext: false, nextCursor: null } } : {}),
    },
  });
const liveFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes('/v1/commercial/service-tariffs')) return liveFetch(input, init);
  if (query.get('scenario') === 'error')
    return Response.json(
      {
        success: false,
        error: {
          code: 'COMMERCIAL.TARIFF_UNAVAILABLE',
          message: 'Synthetic tariff error',
          statusCode: 503,
        },
      },
      { status: 503 },
    );
  if (!init?.method || init.method === 'GET')
    return ok(query.get('scenario') === 'empty' ? [] : versions, true);
  const payload: unknown = JSON.parse(String(init.body));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid synthetic command');
  const body = payload as Record<string, unknown>;
  const row = versions.find((entry) => url.includes(entry.id));
  if (!row || body.expectedUpdatedAt !== row.updatedAt || !String(body.reason ?? '').trim())
    return Response.json(
      {
        success: false,
        error: {
          code: 'COMMERCIAL.TARIFF_STALE_OR_PUBLISHED',
          message: 'Synthetic stale version',
          statusCode: 409,
        },
      },
      { status: 409 },
    );
  const updatedAt = new Date(new Date(row.updatedAt).getTime() + 1000).toISOString();
  const result = url.endsWith('/publish')
    ? { ...row, status: 'PUBLISHED' as const, updatedAt }
    : url.endsWith('/close')
      ? { ...row, effectiveTo: String(body.effectiveTo), updatedAt }
      : {
          ...row,
          lines: body.lines as ServiceTariff['lines'],
          effectiveFrom: String(body.effectiveFrom),
          effectiveTo: body.effectiveTo === null ? null : String(body.effectiveTo),
          updatedAt,
        };
  versions = versions.map((entry) => (entry.id === row.id ? result : entry));
  return ok(result);
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : vi}>
      <main className="mx-auto max-w-[1200px] p-4 sm:p-8">
        <ServiceTariffManager />
      </main>
    </NextIntlClientProvider>
  </React.StrictMode>,
);
