import { useLocation, Link } from 'react-router-dom';

import {
  Home,
  Package,
  Warehouse,
  GitBranch,
  Truck,
  Scale,
  PieChart,
  Building2,
  Network,
  Settings as SettingsIcon,
  Menu,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useUiStore, useAuthStore } from '@/stores';

export default function Sidebar() {
  const { pathname } = useLocation();
  const { isSidebarOpen, toggleSidebar } = useUiStore();
  const t = useTranslations('Sidebar');
  const user = useAuthStore((s) => s.user);

  const MENUS: Array<{
    name: string;
    href: string;
    icon?: LucideIcon;
    isHeading?: boolean;
    adminOnly?: boolean;
  }> = [
    { name: t('dashboard'), href: '/dashboard', icon: Home },
    { name: t('orders'), href: '/orders', icon: Package },
    { name: t('inventory'), href: '/inventory', icon: Warehouse },
    { name: t('rules'), href: '/rules', icon: GitBranch },
    { name: t('shipments'), href: '/shipments', icon: Truck },
    { name: t('reconciliation'), href: '/reconciliation', icon: Scale },
    { name: t('analytics'), href: '/analytics', icon: PieChart },
    { name: t('admin_heading'), href: '', isHeading: true, adminOnly: true },
    { name: t('admin_tenants'), href: '/admin/tenants', icon: Building2, adminOnly: true },
    { name: t('admin_carriers'), href: '/admin/carriers', icon: Network, adminOnly: true },
    { name: t('settings_heading'), href: '', isHeading: true },
    { name: t('settings'), href: '/settings', icon: SettingsIcon },
  ];

  const displayName = user?.fullName ?? user?.email ?? 'User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/* Mobile burger */}
      <button
        aria-label="Mở menu"
        className="flex md:hidden fixed top-4 left-4 z-[110] p-2 bg-[#0F172A] text-white rounded-md border-none pointer-events-auto"
        onClick={toggleSidebar}
      >
        <Menu size={24} />
      </button>

      <aside
        className={cn(
          'fixed top-0 left-0 h-full bg-[#0F172A] text-white transition-all duration-300 z-[100] flex flex-col shadow-[2px_0_16px_rgba(0,0,0,0.25)] pointer-events-auto',
          isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-[4.5rem]',
        )}
      >
        {/* Collapse toggle */}
        <button
          aria-label={isSidebarOpen ? 'Thu gọn sidebar' : 'Mở rộng sidebar'}
          className="absolute -right-[1.125rem] top-[1.125rem] w-9 h-9 bg-white border border-[#E2E8F0] rounded-lg text-[#0F172A] flex items-center justify-center cursor-pointer z-[110] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all duration-200 hover:bg-[#F8FAFC] pointer-events-auto"
          onClick={toggleSidebar}
        >
          {isSidebarOpen ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        </button>

        {/* ── Logo / Brand ──────────────────────────────────────────── */}
        <div className="px-4 py-4 border-b border-gray-800 bg-[#0B1120] flex-shrink-0">
          <div
            className={cn(
              'flex items-center gap-2.5 overflow-hidden',
              !isSidebarOpen && 'justify-center',
            )}
          >
            {/* SC badge */}
            <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center font-bold text-white text-sm shadow-md flex-shrink-0">
              SC
            </div>

            {isSidebarOpen && (
              <div className="font-bold text-[15px] leading-tight whitespace-nowrap">
                <span className="text-[#10B981]">Smart</span>
                <span className="text-white">Chain</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Nav items ─────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3">
          <ul className="flex flex-col gap-0.5 m-0 p-0 list-none">
            {MENUS.filter((menu) => !menu.adminOnly || user?.roles.includes('SUPER_ADMIN')).map(
              (menu) => {
                if (menu.isHeading) {
                  return (
                    <li
                      key={`heading-${menu.name}`}
                      className={cn(
                        'text-[0.65rem] font-bold text-gray-500 px-3 pt-5 pb-1.5 uppercase tracking-widest whitespace-nowrap',
                        !isSidebarOpen && 'hidden',
                      )}
                    >
                      {menu.name}
                    </li>
                  );
                }

                const Icon: LucideIcon = menu.icon!;
                const isActive = pathname === menu.href || pathname.startsWith(`${menu.href}/`);

                return (
                  <li key={menu.href}>
                    <Link
                      to={menu.href}
                      title={!isSidebarOpen ? menu.name : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 no-underline whitespace-nowrap pointer-events-auto',
                        !isSidebarOpen && 'justify-center px-0 py-3 mx-auto w-12',
                        isActive
                          ? 'bg-[#0F766E] text-white shadow-md shadow-teal-950/50 font-semibold'
                          : 'text-gray-400 hover:bg-[#0F766E]/20 hover:text-[#10B981]',
                      )}
                    >
                      <Icon
                        size={17}
                        className={cn('flex-shrink-0', isActive ? 'text-white' : 'text-gray-400')}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      {isSidebarOpen && <span>{menu.name}</span>}
                    </Link>
                  </li>
                );
              },
            )}
          </ul>
        </nav>

        {/* ── User footer ───────────────────────────────────────────── */}
        <div className="p-3 border-t border-gray-800 bg-[#0B1120]/60 flex-shrink-0">
          <div
            className={cn(
              'flex items-center gap-2.5 px-2 py-1.5 rounded-lg overflow-hidden',
              !isSidebarOpen && 'justify-center px-0',
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[#0F766E] flex items-center justify-center text-[11px] font-bold text-white shadow flex-shrink-0">
              {initials}
            </div>
            {isSidebarOpen && (
              <div className="text-xs font-semibold text-white truncate">{displayName}</div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
