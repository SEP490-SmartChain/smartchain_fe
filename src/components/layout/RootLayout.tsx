import React from 'react';

import { NextIntlClientProvider } from 'next-intl';

import { Toaster, ErrorBoundary } from '@/components/Common';
import { useLocaleStore } from '@/stores';

import enMessages from '@messages/en.json';
import viMessages from '@messages/vi.json';

import { AuthSessionBoundary } from './AuthSessionBoundary';

import '@/styles/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleStore();
  const messages = locale === 'en' ? enMessages : viMessages;

  return (
    <div className="font-inter">
      <NextIntlClientProvider messages={messages} locale={locale}>
        <ErrorBoundary>
          <Toaster position="top-right" richColors />
          <AuthSessionBoundary>{children}</AuthSessionBoundary>
        </ErrorBoundary>
      </NextIntlClientProvider>
    </div>
  );
}
