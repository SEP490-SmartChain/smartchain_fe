import { useEffect, type ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

export function AuthSessionBoundary({ children }: { children: ReactNode }) {
  const t = useTranslations('Auth');
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    void apiClient.initializeSession();
  }, []);

  if (status === 'initializing') {
    return (
      <div role="status" className="min-h-screen flex items-center justify-center">
        {t('restoringSession')}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center p-6">
        <p role="alert">{t('restoreSessionError')}</p>
        <Button onClick={() => void apiClient.initializeSession()}>{t('retrySession')}</Button>
      </div>
    );
  }
  return children;
}
