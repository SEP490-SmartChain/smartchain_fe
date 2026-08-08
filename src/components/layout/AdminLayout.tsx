import React from 'react';

import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <Topbar />
      {children}
    </AppLayout>
  );
}
