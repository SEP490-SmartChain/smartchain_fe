import React, { useEffect } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/Common';
import '@/styles/globals.css';

import { ErrorBoundary } from '@/components/Common';
import { useLocaleStore } from '@/stores';
import { useAuth } from '@/hooks/useAuth';

import enMessages from '@messages/en.json';
import viMessages from '@messages/vi.json';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleStore();
  const messages = locale === 'en' ? enMessages : viMessages;
  const { logout } = useAuth();

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized as EventListener);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized as EventListener);
    };
  }, [logout]);

  return (
    <div className="font-inter">
      <NextIntlClientProvider messages={messages} locale={locale}>
        <ErrorBoundary>
          <Toaster position="top-right" richColors />
          {children}
        </ErrorBoundary>
      </NextIntlClientProvider>
    </div>
  );
}

