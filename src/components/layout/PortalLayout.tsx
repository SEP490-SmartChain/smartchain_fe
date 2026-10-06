import type { ReactNode } from 'react';

import { useLocation } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';
import { getPortal } from '@/lib/accessPolicy';

import AdminLayout from './AdminLayout';

interface PortalLayoutProps {
  children: ReactNode;
}

/** Shared shell keeps the same guard while identifying each ORCA portal. */
export function PortalLayout({ children }: PortalLayoutProps) {
  const { roles } = useAccess();
  const { pathname } = useLocation();
  const t = useTranslations('Portals');
  const portal = getPortal(roles, pathname);
  return (
    <AdminLayout>
      {portal && (
        <p className="mb-4 mt-0 text-sm font-medium text-[var(--sc-text-secondary)]">{t(portal)}</p>
      )}
      {children}
    </AdminLayout>
  );
}
