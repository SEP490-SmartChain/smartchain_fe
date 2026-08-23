import Sidebar from '@/components/layout/Sidebar';
import { useUiStore } from '@/stores';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen } = useUiStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div
        className={cn(
          'min-h-screen flex flex-col transition-[margin-left] duration-300 ease',
          isSidebarOpen ? 'md:ml-64' : 'md:ml-[4.5rem]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
