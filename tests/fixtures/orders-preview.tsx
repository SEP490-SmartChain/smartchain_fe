// Visual fixture only, excluded from the production router and bundle.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '../../src/styles/globals.css';
import messages from '../../messages/vi.json';
import { SellerOrders } from '../../src/features/orders';
import { useAuthStore } from '../../src/stores/authStore';

const params = new URLSearchParams(location.search);
const staff = params.get('role') === 'staff';
useAuthStore.getState().setSession({
  accessToken: staff ? 'preview-staff' : 'preview-owner',
  expiresIn: 3600,
  user: {
    userId: '00000000-0000-4000-8000-000000000002',
    tenantId: '00000000-0000-4000-8000-000000000003',
    email: 'preview@example.test',
    fullName: 'Synthetic seller',
    actorScope: 'TENANT',
    roles: [staff ? 'SELLER_STAFF' : 'SELLER_OWNER'],
    permissions: [],
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NextIntlClientProvider locale="vi" messages={messages}>
        <main className="min-h-screen bg-[var(--sc-bg-primary)] p-6 text-[var(--sc-text-primary)]">
          <p className="mb-4 text-sm text-[var(--sc-text-secondary)]">
            Preview riêng • dữ liệu synthetic • {staff ? 'Seller Staff' : 'Seller Owner'}
          </p>
          <SellerOrders />
        </main>
      </NextIntlClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
