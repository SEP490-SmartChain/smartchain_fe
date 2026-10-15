import { useEffect, useState } from 'react';

import { Link, useLocation } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { getEffectiveRoles } from '@/lib/accessPolicy';
import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

export function SellerServiceNotice() {
  const t = useTranslations('Commercial');
  const user = useAuthStore((state) => state.user);
  const revision = useAuthStore((state) => state.revision);
  const { pathname } = useLocation();
  const [refresh, setRefresh] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const roles = getEffectiveRoles(user?.roles ?? [], user?.actorScope);
  const isSeller = roles.some((role) => role === 'SELLER_OWNER' || role === 'SELLER_STAFF');
  useEffect(() => {
    if (!isSeller) return;
    let controller: AbortController | null = null;
    const reload = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      void apiClient
        .currentUser(current.signal)
        .then(() => {
          if (!current.signal.aborted) setLoadFailed(false);
        })
        .catch(() => {
          if (!current.signal.aborted) setLoadFailed(true);
        });
    };
    reload();
    window.addEventListener('focus', reload);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', reload);
    };
  }, [isSeller, revision, pathname, refresh]);

  if (!isSeller || (user?.serviceStatus === 'ACTIVE' && !loadFailed)) return null;
  const status = loadFailed ? null : user?.serviceStatus;
  return (
    <Alert
      variant="warning"
      className="mb-6"
      title={t(status ? `service.${status}` : 'serviceUnavailable')}
    >
      <p>{t(status ? `serviceHelp.${status}` : 'serviceUnavailableHelp')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {roles.includes('SELLER_OWNER') ? (
          <Link to="/settings/contract" className="font-medium underline">
            {t('manageService')}
          </Link>
        ) : (
          <p>{t('contactOwner')}</p>
        )}
        <Button variant="ghost" size="sm" onClick={() => setRefresh((value) => value + 1)}>
          {t('refresh')}
        </Button>
      </div>
    </Alert>
  );
}
