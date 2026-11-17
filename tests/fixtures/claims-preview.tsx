// Visual fixture only, excluded from the production router and bundle.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '../../src/styles/globals.css';
import messages from '../../messages/vi.json';
import ClaimsPage from '../../src/pages/workspace/ClaimsPage';
import { useAuthStore } from '../../src/stores/authStore';

const params = new URLSearchParams(location.search);
const role = params.get('role') === 'accountant' ? 'ORCA_ACCOUNTANT' : 'OPS_DISPATCHER';
useAuthStore.getState().setSession({
  accessToken: `preview-${role}`,
  expiresIn: 86400,
  user: {
    userId: '00000000-0000-4000-8000-000000000002',
    tenantId: '00000000-0000-4000-8000-000000000003',
    email: 'preview@example.test',
    fullName: 'Synthetic seller',
    actorScope: 'PLATFORM',
    serviceStatus: 'ACTIVE',
    roles: [role],
    warehouseIds: ['00001314-0000-4000-8000-000000000010', '00001314-0000-4000-8000-000000000020'],
    permissions: [],
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NextIntlClientProvider locale="vi" messages={messages}>
        <main className="min-h-screen bg-[var(--sc-bg-primary)] p-6 text-[var(--sc-text-primary)]">
          <p className="mb-4 text-sm text-[var(--sc-text-secondary)]">
            Preview riêng • dữ liệu synthetic • {role}
          </p>
          <button
            type="button"
            className="mb-4 underline"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[type="file"]');
              if (!input) return;
              const bytes = Uint8Array.from(
                atob(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L9AAAAAASUVORK5CYII=',
                ),
                (c) => c.charCodeAt(0),
              );
              const selection = new DataTransfer();
              selection.items.add(
                new File([bytes], 'synthetic-claim-photo.png', { type: 'image/png' }),
              );
              input.files = selection.files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }}
          >
            Nạp PNG mẫu kiểm thử (preview riêng)
          </button>
          <Routes>
            <Route path="/claims/:claimId?" element={<ClaimsPage />} />
            <Route path="/tests/fixtures/claims-preview.html" element={<ClaimsPage />} />
          </Routes>
        </main>
      </NextIntlClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
