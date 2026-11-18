import { useState } from 'react';

import { Link, useLocation } from 'react-router-dom';

import { ChevronDown, PanelLeftClose, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';
import { getVisibleNavGroups, isNavItemActive, type NavLink } from '@/lib/accessPolicy';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

import { NAV_ICONS } from './navIcons';

export default function Sidebar() {
  const { pathname } = useLocation();
  const { isSidebarOpen, setSidebarOpen } = useUiStore();
  const { roles, defaultPath } = useAccess();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    components: pathname.startsWith('/components'),
  });
  const t = useTranslations('Sidebar');

  const groups = getVisibleNavGroups(roles, import.meta.env.DEV);

  const closeTemporaryDrawer = () => {
    if (window.matchMedia('(max-width: 1199px)').matches) setSidebarOpen(false);
  };

  const handleBrandClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isSidebarOpen && window.matchMedia('(min-width: 1200px)').matches) {
      event.preventDefault();
      setSidebarOpen(true);
      return;
    }
    closeTemporaryDrawer();
  };

  const renderChild = (child: NavLink) => {
    const ChildIcon = NAV_ICONS[child.key] ?? Settings;
    const childActive = isNavItemActive(child, pathname);
    return (
      <li key={child.href}>
        <Link
          to={child.href}
          aria-current={childActive ? 'page' : undefined}
          onClick={closeTemporaryDrawer}
          className={cn(
            'my-0.5 flex min-h-9 items-center gap-2.5 rounded px-2 py-2 text-[13px] transition-colors',
            childActive
              ? 'bg-[var(--sc-primary-alpha-08)] font-medium text-[var(--sc-primary-dark)]'
              : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]',
          )}
        >
          <ChildIcon size={16} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{t(child.key)}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label={t('close_menu')}
          className="fixed inset-0 z-40 cursor-default border-0 bg-[rgb(15_23_42/35%)] backdrop-blur-[2px] min-[1200px]:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        aria-label={t('navigation')}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[var(--sc-sidebar-width)] flex-col overflow-hidden border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)]',
          'transition-[width,transform] duration-200 ease-out',
          isSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full min-[1200px]:w-[var(--sc-sidebar-mini-width)] min-[1200px]:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-[68px] shrink-0 items-center justify-between min-[900px]:h-[var(--sc-topbar-height)]',
            isSidebarOpen ? 'px-4' : 'min-[1200px]:justify-center min-[1200px]:px-0',
          )}
        >
          <Link
            to={defaultPath}
            title={!isSidebarOpen ? t('expand_menu') : undefined}
            className="flex min-w-0 items-center gap-2.5"
            onClick={handleBrandClick}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-[10px] shadow-[0_6px_14px_rgb(15_118_110/20%)]"
            >
              <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="var(--sc-primary)" />
              <path
                d="M10.2 25.5C10.2 17.2 16.1 10.4 25.1 8.8C23.4 12.6 23.7 16.1 26.1 18.5C28.1 20.4 29.6 22.7 29.6 25.5H22.8C22.8 22.7 20.6 20.6 17.8 20.6C15.1 20.6 13.1 22.6 12.6 25.5H10.2Z"
                fill="#ffffff"
              />
              <rect
                x="24.2"
                y="12.5"
                width="4.4"
                height="2.6"
                rx="1.3"
                transform="rotate(-18 24.2 12.5)"
                fill="#99f6e4"
              />
              <rect x="10.2" y="28" width="8.8" height="2.8" rx="1.4" fill="#ffffff" />
              <rect
                x="20.8"
                y="28"
                width="8.8"
                height="2.8"
                rx="1.4"
                fill="#99f6e4"
                fillOpacity="0.85"
              />
            </svg>
            <span className={cn('truncate text-[17px] font-semibold', !isSidebarOpen && 'hidden')}>
              ORCA
            </span>
          </Link>

          {isSidebarOpen && (
            <button
              type="button"
              aria-label={t('collapse_menu')}
              className="sc-icon-button"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        <div
          className={cn(
            'h-px shrink-0 bg-[var(--sc-border-default)]',
            isSidebarOpen ? 'mx-4' : 'min-[1200px]:mx-3',
          )}
        />

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            isSidebarOpen ? 'px-4' : 'min-[1200px]:px-3',
          )}
        >
          <nav className="py-4">
            {groups.map((group, groupIndex) => (
              <section
                key={group.key}
                className={cn(
                  groupIndex > 0 && 'mt-2 border-t border-[var(--sc-border-default)] pt-3',
                )}
              >
                <p
                  className={cn(
                    'mb-1.5 px-0 text-xs leading-4 text-[var(--sc-text-tertiary)]',
                    !isSidebarOpen && 'min-[1200px]:sr-only',
                  )}
                >
                  {t(group.key)}
                </p>
                <ul>
                  {group.items.map((item) => {
                    const Icon = NAV_ICONS[item.key] ?? Settings;
                    const hasActiveChild = item.children?.some((child) =>
                      isNavItemActive(child, pathname, item.children),
                    );
                    const isActive = hasActiveChild || isNavItemActive(item, pathname, group.items);
                    const isExpanded = Boolean(expandedMenus[item.key]) || Boolean(hasActiveChild);

                    if (item.children) {
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            title={!isSidebarOpen ? t(item.key) : undefined}
                            aria-expanded={isExpanded}
                            className={cn(
                              'group my-0.5 flex min-h-10 w-full items-center gap-3 rounded px-2 py-2.5 text-sm leading-[18px] transition-colors duration-150 ease-out',
                              isActive
                                ? 'bg-[var(--sc-primary-lighter)] font-medium text-[var(--sc-primary-dark)]'
                                : 'text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]',
                              !isSidebarOpen && 'min-[1200px]:justify-center min-[1200px]:px-0',
                            )}
                            onClick={() => {
                              if (!isSidebarOpen) setSidebarOpen(true);
                              setExpandedMenus((current) => ({
                                ...current,
                                [item.key]: !isExpanded,
                              }));
                            }}
                          >
                            <Icon
                              aria-hidden="true"
                              size={18}
                              strokeWidth={1.5}
                              className="shrink-0"
                            />
                            <span
                              className={cn('truncate', !isSidebarOpen && 'min-[1200px]:hidden')}
                            >
                              {t(item.key)}
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              size={16}
                              className={cn(
                                'ml-auto shrink-0 transition-transform',
                                isExpanded && 'rotate-180',
                                !isSidebarOpen && 'min-[1200px]:hidden',
                              )}
                            />
                          </button>

                          {isExpanded && isSidebarOpen && (
                            <ul className="mb-1 ml-4 border-l border-[var(--sc-border-default)] pl-3">
                              {item.children.map(renderChild)}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href!}
                          title={!isSidebarOpen ? t(item.key) : undefined}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={closeTemporaryDrawer}
                          className={cn(
                            'group my-0.5 flex min-h-10 items-center gap-3 rounded px-2 py-2.5 text-sm leading-[18px]',
                            'transition-colors duration-150 ease-out',
                            isActive
                              ? 'bg-[var(--sc-primary-lighter)] font-medium text-[var(--sc-primary-dark)] hover:bg-[var(--sc-primary-light)]'
                              : 'text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]',
                            !isSidebarOpen && 'min-[1200px]:justify-center min-[1200px]:px-0',
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            size={18}
                            strokeWidth={1.5}
                            className="shrink-0"
                          />
                          <span className={cn('truncate', !isSidebarOpen && 'min-[1200px]:hidden')}>
                            {t(item.key)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
