import { useState, useRef, useEffect, useMemo } from 'react';

import { useLocation } from 'react-router-dom';

import { Bell, Mail, ChevronDown, LogOut, Globe } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

import { useLocaleStore, useAuthStore } from '@/stores';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function Topbar({ title }: { title?: string }) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const t = useTranslations('Topbar');
  const locale = useLocale();
  const { setLocale } = useLocaleStore();
  const { logout } = useAuth();
  const user = useAuthStore((s) => s.user);

  const displayName = user?.name ?? user?.username ?? 'User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const displayTitle = useMemo(() => {
    const titleMap: Record<string, string> = {
      '/dashboard': t('title_dashboard'),
      '/orders': t('title_orders'),
      '/inventory': t('title_inventory'),
      '/rules': t('title_rules'),
      '/shipments': t('title_shipments'),
      '/reconciliation': t('title_reconciliation'),
      '/analytics': t('title_analytics'),
      '/settings': t('title_settings'),
      '/admin': t('title_admin'),
    };
    return (
      title || titleMap[pathname] || titleMap[`/${pathname.split('/')[1]}`] || t('default_title')
    );
  }, [title, pathname, t]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = () => {
    const newLocale = locale === 'vi' ? 'en' : 'vi';
    setLocale(newLocale);
  };

  return (
    <header className="h-[4.5rem] bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-30">
      <h2 className="text-xl font-semibold text-gray-900">{displayTitle}</h2>
      <div className="flex-1" />

      <div className="flex items-center">
        <div className="flex items-center gap-4">
          <button
            className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg text-gray-600 cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:text-gray-900"
            onClick={toggleLanguage}
            title={`Switch to ${locale === 'vi' ? 'English' : 'Tiếng Việt'}`}
          >
            <Globe size={18} />
            <span className="text-[0.65rem] font-semibold ml-1 uppercase">{locale}</span>
          </button>

          <button className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg text-gray-600 cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:text-gray-900">
            <Bell size={18} />
            <span className="absolute -top-[2px] -right-[2px] w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>

          <button className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg text-gray-600 cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:text-gray-900">
            <Mail size={18} />
          </button>

          <div className="relative" ref={popoverRef}>
            <div
              className="flex items-center gap-3 px-3 py-1.5 border border-[#E2E8F0] rounded-lg cursor-pointer bg-white transition-colors duration-200 hover:bg-[#F8FAFC]"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            >
              <div className="w-7 h-7 rounded-md bg-[#0F766E] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                {initials}
              </div>
              <span className="text-[13px] font-medium text-[#0F172A]">{displayName}</span>
              <ChevronDown
                size={14}
                className={cn(
                  'text-[#94A3B8] transition-transform duration-200',
                  isPopoverOpen && 'rotate-180',
                )}
              />
            </div>

            {isPopoverOpen && (
              <>
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-[200px] bg-white border border-[#E2E8F0] rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.08)] z-50 overflow-hidden animate-[slideDown_0.15s_ease-out_forwards]">
                  <div className="px-4 py-3">
                    <p className="m-0 text-sm font-semibold text-[#0F172A]">{displayName}</p>
                    <p className="mt-1 text-xs text-[#475569] mb-0 capitalize">
                      {user?.role ?? 'Member'}
                    </p>
                  </div>
                  <div className="h-[1px] bg-[#E2E8F0] m-0" />
                  <button
                    className="flex items-center gap-3 w-full px-4 py-3 bg-transparent border-none text-sm text-[#475569] cursor-pointer transition-colors duration-150 text-left hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                    onClick={logout}
                  >
                    <LogOut size={16} />
                    <span>{t('logout')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
