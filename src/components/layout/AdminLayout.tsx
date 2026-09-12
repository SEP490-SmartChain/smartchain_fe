import React from 'react';

import AppLayout from '@/components/layout/AppLayout';
import RouteBreadcrumbs from '@/components/layout/RouteBreadcrumbs';
import Topbar from '@/components/layout/Topbar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <Topbar />
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
