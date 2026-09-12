import React, { useEffect } from 'react';

import { NextIntlClientProvider } from 'next-intl';

import { Toaster, ErrorBoundary } from '@/components/Common';
import { useLocaleStore, useUiStore } from '@/stores';

import enMessages from '@messages/en.json';
import viMessages from '@messages/vi.json';

import { AuthSessionBoundary } from './AuthSessionBoundary';

import '@/styles/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleStore();
  const { themeMode, setThemeMode } = useUiStore();
  const messages = locale === 'en' ? enMessages : viMessages;

  useEffect(() => {
    if (themeMode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => setThemeMode('system');
    mediaQuery.addEventListener('change', syncSystemTheme);
    return () => mediaQuery.removeEventListener('change', syncSystemTheme);
  }, [setThemeMode, themeMode]);

  return (
    <div>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <ErrorBoundary>
          <Toaster position="top-right" richColors />
          <AuthSessionBoundary>{children}</AuthSessionBoundary>
        </ErrorBoundary>
      </NextIntlClientProvider>
    </div>
  );
}
