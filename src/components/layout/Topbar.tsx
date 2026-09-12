import { useEffect, useMemo, useRef, useState } from 'react';

import { Link, useLocation } from 'react-router-dom';

import {
  Bell,
  Command,
  Globe2,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';
import { useAuth } from '@/hooks/useAuth';
import { getSearchLinks } from '@/lib/accessPolicy';
import { cn } from '@/lib/utils';
import { useAuthStore, useLocaleStore, useUiStore } from '@/stores';
import type { ThemeMode } from '@/stores/uiStore';

import { NAV_ICONS } from './navIcons';
import RouteBreadcrumbs from './RouteBreadcrumbs';

type PopoverName = 'search' | 'theme' | 'notification' | 'profile' | null;

interface SearchItem {
  label: string;
  caption: string;
  href: string;
  icon: LucideIcon;
}

export default function Topbar() {
  const [activePopover, setActivePopover] = useState<PopoverName>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsRead, setNotificationsRead] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { pathname } = useLocation();
  const t = useTranslations('Topbar');
  const sidebar = useTranslations('Sidebar');
  const locale = useLocale();
  const { setLocale } = useLocaleStore();
  const { logout, isLoggingOut } = useAuth();
  const user = useAuthStore((state) => state.user);
  const { setSidebarOpen, themeMode, isDarkMode, setThemeMode } = useUiStore();

  const displayName = user?.fullName ?? user?.email ?? t('member');
  const initials = displayName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: t('role_super_admin'),
    TENANT_ADMIN: t('role_tenant_admin'),
    DISPATCHER: t('role_dispatcher'),
    ACCOUNTANT: t('role_accountant'),
  };
  const role = roleLabels[user?.roles[0] ?? ''] ?? t('member');

  const themeOptions: Array<{ id: ThemeMode; label: string; icon: typeof Sun }> = [
    { id: 'light', label: t('theme_light'), icon: Sun },
    { id: 'dark', label: t('theme_dark'), icon: Moon },
    { id: 'system', label: t('theme_system'), icon: Monitor },
  ];

  const { roles } = useAccess();

  const searchItems = useMemo<SearchItem[]>(
    () =>
      getSearchLinks(roles, import.meta.env.DEV).map((link) => ({
        label: sidebar(link.key),
        caption: sidebar(link.groupKey),
        href: link.href,
        icon: NAV_ICONS[link.key] ?? Search,
      })),
    [roles, sidebar],
  );

  const filteredItems = searchItems.filter((item) => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase(locale);
    return (
      normalizedQuery === '' ||
      (item.label + ' ' + item.caption).toLocaleLowerCase(locale).includes(normalizedQuery)
    );
  });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
        setActivePopover(null);
      }
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActivePopover('search');
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') setActivePopover(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyboard);
    };
  }, []);

  const togglePopover = (popover: Exclude<PopoverName, null>) => {
    setActivePopover((current) => (current === popover ? null : popover));
  };

  return (
    <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center border-b border-[var(--sc-border-default)] bg-[var(--sc-topbar-bg)] px-4 backdrop-blur-xl min-[900px]:h-[var(--sc-topbar-height)] sm:px-6">
      <button
        type="button"
        aria-label={sidebar('open_menu')}
        className="sc-icon-button sc-mobile-menu-button mr-2"
        onClick={() => setSidebarOpen(true)}
      >
        <PanelOpenIcon />
      </button>

      <div className="hidden min-w-0 min-[900px]:block">
        <RouteBreadcrumbs />
      </div>

      <div ref={controlsRef} className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative">
          <label className="relative block">
            <span className="sr-only">{t('search')}</span>
            <Search
              size={18}
              strokeWidth={1.5}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sc-text-secondary)]"
            />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              placeholder={t('search')}
              aria-expanded={activePopover === 'search'}
              aria-controls="global-search-results"
              onFocus={() => setActivePopover('search')}
              onClick={() => setActivePopover('search')}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setActivePopover('search');
              }}
              className="h-9 w-[170px] rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] py-[7px] pl-9 pr-12 text-sm leading-[18px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)] sm:w-60"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[var(--sc-text-tertiary)]">
              <Command size={13} />
              <span className="text-[11px]">+ K</span>
            </span>
          </label>

          {activePopover === 'search' && (
            <div
              id="global-search-results"
              role="listbox"
              className="sc-popover-enter fixed left-4 right-4 top-[72px] z-50 overflow-hidden rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1 shadow-[var(--sc-shadow-popover)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[420px]"
            >
              <p className="px-3 py-2 text-xs text-[var(--sc-text-tertiary)]">
                {searchQuery.trim() ? t('search_results') : t('search_hint')}
              </p>
              <div className="max-h-80 overflow-y-auto">
                {filteredItems.length > 0 ? (
                  filteredItems.map(({ label, caption, href, icon: Icon }) => (
                    <Link
                      key={href}
                      to={href}
                      role="option"
                      aria-selected={pathname === href}
                      onClick={() => {
                        setActivePopover(null);
                        setSearchQuery('');
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                        pathname === href
                          ? 'bg-[var(--sc-primary-lighter)]'
                          : 'hover:bg-[var(--sc-bg-secondary)]',
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-primary)]">
                        <Icon size={17} strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{label}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--sc-text-tertiary)]">
                          {caption}
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Search
                      size={26}
                      strokeWidth={1.25}
                      className="mx-auto text-[var(--sc-text-tertiary)]"
                    />
                    <p className="mb-0 mt-2 text-sm text-[var(--sc-text-secondary)]">
                      {t('search_empty')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            className="sc-icon-button"
            onClick={() => togglePopover('theme')}
            aria-label={t('toggle_theme')}
            aria-haspopup="menu"
            aria-expanded={activePopover === 'theme'}
          >
            {isDarkMode ? (
              <Moon size={16} strokeWidth={1.5} />
            ) : (
              <Sun size={16} strokeWidth={1.5} />
            )}
          </button>
          {activePopover === 'theme' && (
            <div
              role="menu"
              className="sc-popover-enter absolute right-0 top-[calc(100%+0.5rem)] z-50 w-36 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1 shadow-[var(--sc-shadow-popover)]"
            >
              {themeOptions.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={themeMode === id}
                  key={id}
                  onClick={() => {
                    setThemeMode(id);
                    setActivePopover(null);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    themeMode === id
                      ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                      : 'text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]',
                  )}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            className="sc-icon-button relative"
            onClick={() => togglePopover('notification')}
            aria-label={t('notifications')}
            aria-haspopup="dialog"
            aria-expanded={activePopover === 'notification'}
          >
            <Bell
              size={16}
              strokeWidth={1.5}
              className={cn(!notificationsRead && 'sc-notification-ring')}
            />
            {!notificationsRead && (
              <span className="absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full bg-[var(--sc-error)] ring-1 ring-[var(--sc-bg-surface)]" />
            )}
          </button>

          {activePopover === 'notification' && (
            <div
              role="dialog"
              aria-label={t('notifications')}
              className="sc-popover-enter fixed left-4 right-4 top-[72px] z-50 overflow-hidden rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-[var(--sc-shadow-popover)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[420px]"
            >
              <div className="flex items-center justify-between border-b border-[var(--sc-border-default)] p-3">
                <h2 className="m-0 text-base font-medium">{t('all_notifications')}</h2>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs font-medium text-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)]"
                  onClick={() => setNotificationsRead(true)}
                  disabled={notificationsRead}
                >
                  {t('mark_all_read')}
                </button>
              </div>
              <p className="px-4 pb-1 pt-3 text-xs text-[var(--sc-text-tertiary)]">
                {t('last_seven_days')}
              </p>
              <ul className="max-h-[405px] overflow-y-auto px-1 pb-2">
                {[
                  ['shipment_update', 'shipment_update_caption'],
                  ['inventory_alert', 'inventory_alert_caption'],
                  ['reconciliation_ready', 'reconciliation_ready_caption'],
                ].map(([titleKey, captionKey], index) => (
                  <li key={titleKey}>
                    <button
                      type="button"
                      className="flex w-full gap-3 rounded-lg p-3 text-left transition-colors hover:bg-[var(--sc-bg-secondary)]"
                    >
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          notificationsRead || index === 1
                            ? 'bg-[var(--sc-border-strong)]'
                            : 'bg-[var(--sc-primary)]',
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--sc-text-primary)]">
                          {t(titleKey)}
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-[var(--sc-text-tertiary)]">
                          {t(captionKey)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={activePopover === 'profile'}
            aria-label={t('user_menu')}
            onClick={() => togglePopover('profile')}
            className="flex items-center gap-2 rounded-lg text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sc-primary-lighter)] text-[11px] font-semibold text-[var(--sc-primary-dark)]">
              {initials}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-36 truncate text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                {displayName}
              </span>
              <span className="mt-0.5 block max-w-36 truncate text-xs leading-4 text-[var(--sc-text-tertiary)]">
                {role}
              </span>
            </span>
          </button>

          {activePopover === 'profile' && (
            <div
              role="menu"
              className="sc-popover-enter absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[220px] rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-2 shadow-[var(--sc-shadow-popover)]"
            >
              <div className="flex flex-col items-center px-3 py-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sc-primary-lighter)] text-sm font-semibold text-[var(--sc-primary-dark)]">
                  {initials}
                </span>
                <p className="mb-0 mt-2 max-w-full truncate text-sm font-medium">{displayName}</p>
                <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-tertiary)]">{role}</p>
              </div>
              <div className="my-2 h-px bg-[var(--sc-border-default)]" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-lg p-2 text-sm hover:bg-[var(--sc-bg-secondary)]"
                onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
              >
                <Globe2 size={16} strokeWidth={1.5} />
                <span>{t('language')}</span>
                <span className="ml-auto text-xs uppercase text-[var(--sc-text-tertiary)]">
                  {locale}
                </span>
              </button>
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setActivePopover(null)}
                className="my-1 flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-[var(--sc-bg-secondary)]"
              >
                <Settings size={16} strokeWidth={1.5} />
                {sidebar('settings')}
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--sc-border-default)] text-sm font-medium shadow-[var(--sc-shadow-button)] hover:border-[var(--sc-primary)]"
                onClick={() => void logout()}
                disabled={isLoggingOut}
              >
                {t('logout')}
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PanelOpenIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m13 9 3 3-3 3" />
    </svg>
  );
}
