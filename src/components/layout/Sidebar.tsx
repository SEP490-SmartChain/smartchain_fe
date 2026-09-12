import { useState } from 'react';

import { Link, useLocation } from 'react-router-dom';

import {
  AppWindow,
  Boxes,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  CircleCheck,
  CloudUpload,
  CreditCard,
  GitBranch,
  LayoutDashboard,
  ListTree,
  MousePointerClick,
  Network,
  Package,
  PanelLeftClose,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useAuthStore, useUiStore } from '@/stores';

interface MenuItem {
  name: string;
  href?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  tenantAdminOnly?: boolean;
  children?: Array<{
    name: string;
    href: string;
    icon: LucideIcon;
  }>;
}

interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

function isMenuPathActive(pathname: string, href: string) {
  if (href.startsWith('/roles-permissions/')) return pathname.startsWith('/roles-permissions/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const { isSidebarOpen, setSidebarOpen } = useUiStore();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    components: pathname.startsWith('/components'),
    iam: pathname.startsWith('/iam') || pathname.startsWith('/roles-permissions'),
  });
  const t = useTranslations('Sidebar');
  const user = useAuthStore((state) => state.user);

  const groups: MenuGroup[] = [
    {
      heading: t('workspace_heading'),
      items: [
        { name: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
        { name: t('billing'), href: '/billing', icon: CreditCard },
        { name: t('orders'), href: '/orders', icon: Package },
        { name: t('inventory'), href: '/inventory', icon: Boxes },
        { name: t('rules'), href: '/rules', icon: GitBranch },
        { name: t('shipments'), href: '/shipments', icon: Truck },
        { name: t('reconciliation'), href: '/reconciliation', icon: Scale },
        { name: t('analytics'), href: '/analytics', icon: ChartNoAxesCombined },
      ],
    },
    {
      heading: t('manage_accounts_heading'),
      items: [
        {
          name: t('account'),
          icon: Users,
          tenantAdminOnly: true,
          children: [
            { name: t('staff_accounts'), href: '/iam/users', icon: Users },
            {
              name: t('roles_permissions'),
              href: '/roles-permissions/roles',
              icon: ShieldCheck,
            },
          ],
        },
      ],
    },
    {
      heading: t('ui_heading'),
      items: [
        {
          name: t('components'),
          icon: AppWindow,
          children: [
            { name: t('data_table'), href: '/components/data-table', icon: TableProperties },
            { name: t('buttons'), href: '/components/buttons', icon: MousePointerClick },
            { name: t('dropzone'), href: '/components/dropzone', icon: CloudUpload },
            { name: t('data_display'), href: '/components/data-display', icon: ListTree },
          ],
        },
      ],
    },
    {
      heading: t('admin_heading'),
      items: [
        { name: t('admin_tenants'), href: '/admin/tenants', icon: Building2, adminOnly: true },
        { name: t('admin_carriers'), href: '/admin/carriers', icon: Network, adminOnly: true },
      ],
    },
    {
      heading: t('settings_heading'),
      items: [{ name: t('settings'), href: '/settings/profile', icon: Settings }],
    },
  ];

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.adminOnly || user?.roles.includes('SUPER_ADMIN')) &&
          (!item.tenantAdminOnly || user?.roles.includes('TENANT_ADMIN')),
      ),
    }))
    .filter((group) => group.items.length > 0);

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
            to="/dashboard"
            title={!isSidebarOpen ? t('expand_menu') : undefined}
            className="flex min-w-0 items-center gap-2.5"
            onClick={handleBrandClick}
          >
            <span className="grid h-9 w-9 shrink-0 grid-cols-2 gap-[3px] rounded-[10px] bg-[var(--sc-primary)] p-2 shadow-[0_6px_14px_rgb(15_118_110/20%)]">
              <span className="rounded-[2px] bg-white" />
              <span className="rounded-[2px] bg-white/70" />
              <span className="rounded-[2px] bg-white/70" />
              <span className="rounded-[2px] bg-white" />
            </span>
            <span className={cn('truncate text-[17px] font-semibold', !isSidebarOpen && 'hidden')}>
              SmartChain
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
            {visibleGroups.map((group, groupIndex) => (
              <section
                key={group.heading}
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
                  {group.heading}
                </p>
                <ul>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const hasActiveChild = item.children?.some((child) =>
                      isMenuPathActive(pathname, child.href),
                    );
                    const isActive =
                      hasActiveChild || (item.href && isMenuPathActive(pathname, item.href));
                    const menuKey = item.children?.[0]?.href.split('/')[1] ?? item.name;
                    const isExpanded = Boolean(expandedMenus[menuKey]) || Boolean(hasActiveChild);

                    if (item.children) {
                      return (
                        <li key={item.name}>
                          <button
                            type="button"
                            title={!isSidebarOpen ? item.name : undefined}
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
                                [menuKey]: !isExpanded,
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
                              {item.name}
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
                              {item.children.map((child) => {
                                const ChildIcon = child.icon;
                                const childActive = isMenuPathActive(pathname, child.href);
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
                                      <span className="truncate">{child.name}</span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href!}
                          title={!isSidebarOpen ? item.name : undefined}
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
                            {item.name}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          <div className="mt-auto pb-6 pt-3">
            {isSidebarOpen ? (
              <div className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 shadow-[var(--sc-shadow-section)]">
                <div className="mb-5 flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sc-primary)]">
                    <Sparkles size={17} strokeWidth={1.6} />
                  </span>
                  <span>SmartChain v0.1.0</span>
                </div>
                <h2 className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
                  {t('connected_title')}
                </h2>
                <p className="mb-3 mt-1 text-xs leading-4 text-[var(--sc-text-secondary)]">
                  {t('connected_copy')}
                </p>
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--sc-success-dark)]">
                  <CircleCheck size={15} />
                  {t('online')}
                </div>
              </div>
            ) : (
              <div
                title={t('online')}
                className="mx-auto hidden h-10 w-10 items-center justify-center rounded-xl bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)] min-[1200px]:flex"
              >
                <CircleCheck size={18} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
