import { useEffect } from 'react';

import Sidebar from '@/components/layout/Sidebar';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen, setSidebarOpen } = useUiStore();

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)');
    const syncSidebar = (event: MediaQueryList | MediaQueryListEvent) =>
      setSidebarOpen(event.matches);

    syncSidebar(desktop);
    desktop.addEventListener('change', syncSidebar);
    return () => desktop.removeEventListener('change', syncSidebar);
  }, [setSidebarOpen]);

  return (
    <div className="min-h-screen bg-[var(--sc-bg-primary)]">
      <Sidebar />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin-left] duration-200 ease-out',
          isSidebarOpen
            ? 'min-[1200px]:ml-[var(--sc-sidebar-width)]'
            : 'min-[1200px]:ml-[var(--sc-sidebar-mini-width)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
