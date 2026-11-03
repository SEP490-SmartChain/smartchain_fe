import type { ReactNode } from 'react';

import AdminLayout from './AdminLayout';

interface PortalLayoutProps {
  children: ReactNode;
}

/** Shared shell applies the common layout to every authenticated route. */
export function PortalLayout({ children }: PortalLayoutProps) {
  return <AdminLayout>{children}</AdminLayout>;
}
