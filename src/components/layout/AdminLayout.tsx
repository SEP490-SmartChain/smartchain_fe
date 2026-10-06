import React from 'react';

import { useLocation } from 'react-router-dom';

import AppLayout from '@/components/layout/AppLayout';
import RouteBreadcrumbs from '@/components/layout/RouteBreadcrumbs';
import Topbar from '@/components/layout/Topbar';
import { WarehouseNavigation } from '@/components/layout/WarehouseNavigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <AppLayout>
      <Topbar />
      {pathname.startsWith('/warehouse/') && <WarehouseNavigation />}
      <div className="border-b border-[var(--sc-border-default)] px-4 py-1.5 min-[900px]:hidden">
        <RouteBreadcrumbs />
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <div className="sc-page-enter mx-auto w-full max-w-[var(--sc-content-max)] sm:px-4">
          {children}
        </div>
      </main>
    </AppLayout>
  );
}
