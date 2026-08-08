import { useLocation, Link } from 'react-router-dom';

import {
  Home,
  Users,
  PieChart,
  MessageSquare,
  Settings as SettingsIcon,
  HelpCircle,
  Menu,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAppStore } from '@/hooks/useAppStore';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const { pathname } = useLocation();
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const t = useTranslations('Sidebar');

  const MENUS: Array<{ name: string; href: string; icon?: LucideIcon; isHeading?: boolean }> = [
    { name: t('dashboard'), href: '/dashboard', icon: Home },
    { name: t('customers'), href: '/customers', icon: Users },
    { name: t('analytics'), href: '/analytics', icon: PieChart },
    { name: t('settings_heading'), href: '', isHeading: true },
    { name: t('messages'), href: '/messages', icon: MessageSquare },
    { name: t('setting'), href: '/setting', icon: SettingsIcon },
    { name: t('help'), href: '/help', icon: HelpCircle },
  ];

  return (
    <>
      <button
        className="flex md:hidden fixed top-4 left-4 z-[110] p-2 bg-gray-800 text-white rounded-md border-none pointer-events-auto"
        onClick={toggleSidebar}
      >
        <Menu size={24} />
      </button>

      <aside
        className={cn(
          'fixed top-0 left-0 h-full bg-[#24252a] text-[#9ba0a8] transition-all duration-300 z-[100] flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.1)] pointer-events-auto',
          isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-[4.5rem]',
        )}
      >
        <button
          className="absolute -right-[1.125rem] top-[1.125rem] w-9 h-9 bg-white border border-gray-200 rounded-lg text-[#1a1d21] flex items-center justify-center cursor-pointer z-[110] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all duration-200 hover:bg-gray-50 pointer-events-auto"
          onClick={toggleSidebar}
        >
          {isSidebarOpen ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        </button>

        <div className="py-8 px-6 flex items-center justify-center h-[5.5rem] overflow-hidden">
          {isSidebarOpen ? (
            <h1 className="text-[1.75rem] font-semibold text-white leading-none tracking-tight whitespace-nowrap">
              Brand.
            </h1>
          ) : (
            <h1 className="text-[1.75rem] font-semibold text-white leading-none">B.</h1>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden">
          <ul className="flex flex-col gap-1 m-0 p-0 list-none">
            {MENUS.map((menu) => {
              if (menu.isHeading) {
                return (
                  <li
                    key={`heading-${menu.name}`}
                    className={cn(
                      'text-[0.7rem] font-semibold text-[#6a6e76] px-6 pt-6 pb-2 uppercase tracking-wide whitespace-nowrap',
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
                <li key={menu.href} className="flex flex-col">
                  <Link
                    to={menu.href}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3.5 mx-4 my-1 rounded-lg text-[13px] font-medium tracking-[0.02em] transition-all duration-200 no-underline whitespace-nowrap pointer-events-auto',
                      !isSidebarOpen && 'p-3.5 mx-auto my-1 justify-center w-12',
                      isActive
                        ? 'bg-[#36373e] text-white'
                        : 'text-[#9ba0a8] hover:bg-[#2d2e34] hover:text-white',
                    )}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className="min-w-[18px]" />
                    {isSidebarOpen && <span>{menu.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
