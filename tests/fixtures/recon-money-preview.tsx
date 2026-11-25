// Browser test fixture only. No production router, credentials or database.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '../../src/styles/globals.css';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import { CarrierSettlementBatches } from '../../src/features/reconciliation/components/CarrierSettlementBatches';
import { PayoutStatementDetail } from '../../src/features/tenants/components/PayoutStatementDetail';
import { Button } from '../../src/components/Common/Button/Button';
import { useAuthStore } from '../../src/stores/authStore';
import { useLocaleStore } from '../../src/stores/localeStore';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en' ? 'en' : 'vi';
useLocaleStore.setState({ locale });
useAuthStore.getState().setSession({
  accessToken: 'synthetic-recon-ui',
  expiresIn: 3600,
  user: {
    userId: '10120001-0000-4000-8000-000000000009',
    tenantId: null,
    actorScope: 'PLATFORM',
    roles: ['ORCA_ACCOUNTANT'],
    permissions: [],
    email: 'accountant@example.test',
    fullName: 'Synthetic Accountant',
  },
});
function Preview() {
  const [payout, setPayout] = useState(false);
  return (
    <main className="min-h-screen space-y-6 bg-[var(--sc-bg-primary)] p-6 text-[var(--sc-text-primary)]">
      <p>UI TEST ONLY · Synthetic API · No project database or bank transfer</p>
      <Button onClick={() => setPayout(true)}>Open test payout</Button>
      <CarrierSettlementBatches />
      {payout && (
        <PayoutStatementDetail
          id="10120001-0000-4000-8000-000000000002"
          onClose={() => setPayout(false)}
          onChanged={() => {}}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NextIntlClientProvider locale={locale} messages={locale === 'vi' ? vi : en}>
        <Preview />
      </NextIntlClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
