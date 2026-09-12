import { Fragment } from 'react';

import { Link, useLocation } from 'react-router-dom';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function RouteBreadcrumbs() {
  const { pathname } = useLocation();
  const topbar = useTranslations('Topbar');
  const sidebar = useTranslations('Sidebar');
  const settings = useTranslations('Settings');
  const rolesPermissions = useTranslations('RolesPermissions');

  const primaryPath = '/' + pathname.split('/').filter(Boolean)[0];
  const pageLabels: Record<string, string> = {
    '/dashboard': sidebar('dashboard'),
    '/billing': sidebar('billing'),
    '/orders': sidebar('orders'),
    '/inventory': sidebar('inventory'),
    '/rules': sidebar('rules'),
    '/shipments': sidebar('shipments'),
    '/reconciliation': sidebar('reconciliation'),
    '/analytics': sidebar('analytics'),
    '/iam': sidebar('staff_accounts'),
    '/roles-permissions': sidebar('roles_permissions'),
    '/settings': sidebar('settings'),
  };

  const items: BreadcrumbItem[] = [{ label: topbar('home'), href: '/dashboard' }];

  if (primaryPath === '/components') {
    const componentLabels: Record<string, string> = {
      '/components/data-table': sidebar('data_table'),
      '/components/buttons': sidebar('buttons'),
      '/components/dropzone': sidebar('dropzone'),
      '/components/data-display': sidebar('data_display'),
    };
    items.push({ label: sidebar('ui_heading') });
    items.push({ label: sidebar('components'), href: '/components/data-table' });
    items.push({ label: componentLabels[pathname] ?? sidebar('components') });
  } else if (primaryPath === '/admin') {
    items.push({ label: sidebar('admin_heading') });
    items.push({
      label: pathname.startsWith('/admin/carriers')
        ? sidebar('admin_carriers')
        : sidebar('admin_tenants'),
    });
  } else if (primaryPath === '/settings') {
    items.push({ label: sidebar('settings_heading') });
    const settingTab = pathname.split('/').filter(Boolean)[1] ?? 'profile';
    if (
      ['profile', 'general', 'pricing', 'internationalization', 'authentication'].includes(
        settingTab,
      )
    ) {
      items.push({ label: settings(settingTab) });
    }
  } else if (primaryPath === '/iam') {
    items.push({ label: sidebar('staff_accounts') });
  } else if (primaryPath === '/roles-permissions') {
    const roleTab = pathname.split('/').filter(Boolean)[1] ?? 'roles';
    items.push({ label: sidebar('roles_permissions'), href: '/roles-permissions/roles' });
    items.push({
      label:
        roleTab === 'permissions'
          ? rolesPermissions('permissions')
          : roleTab === 'system-users'
            ? rolesPermissions('systemUsers')
            : rolesPermissions('roles'),
    });
  } else {
    items.push({ label: sidebar('workspace_heading') });
    items.push({ label: pageLabels[primaryPath] ?? topbar('default_title') });
  }

  return (
    <nav aria-label={topbar('breadcrumb')} className="flex min-w-0 items-center text-sm">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <ChevronRight
              aria-hidden="true"
              size={16}
              className="mx-0.5 shrink-0 text-[var(--sc-text-tertiary)]"
            />
          )}
          {item.href && index !== items.length - 1 ? (
            <Link
              to={item.href}
              className="rounded-sm p-1 text-[var(--sc-text-tertiary)] transition-colors hover:text-[var(--sc-primary)]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="truncate p-1 text-[var(--sc-text-primary)]">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
