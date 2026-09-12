import { Fragment } from 'react';

import { Link, useLocation } from 'react-router-dom';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const ADMIN_LABEL_KEYS: Record<string, string> = {
  '/admin/tenants': 'admin_tenants',
  '/admin/carriers': 'admin_carriers',
  '/admin/plans': 'subscription_plans',
  '/admin/health': 'platform_health',
  '/admin/audit': 'admin_audit_trail',
  '/admin/api-traffic': 'api_traffic_logs',
  '/admin/observability': 'system_observability',
  '/admin/webhooks': 'webhook_delivery_logs',
  '/admin/quotas': 'quota_management',
};

export default function RouteBreadcrumbs() {
  const { pathname } = useLocation();
  const { defaultPath } = useAccess();
  const topbar = useTranslations('Topbar');
  const sidebar = useTranslations('Sidebar');
  const settings = useTranslations('Settings');
  const rolesPermissions = useTranslations('RolesPermissions');

  const primaryPath = '/' + pathname.split('/').filter(Boolean)[0];
  const pageLabels: Record<string, string> = {
    '/dashboard': sidebar('dashboard'),
    '/billing': sidebar('usage'),
    '/orders': sidebar('orders'),
    '/inventory': sidebar('inventory'),
    '/rules': sidebar('rules'),
    '/shipments': sidebar('shipments'),
    '/reconciliation': sidebar('reconciliation'),
    '/analytics': sidebar('analytics'),
    '/iam': sidebar('staff_accounts'),
    '/roles-permissions': sidebar('roles_permissions'),
    '/audit': sidebar('audit_trail'),
    '/integration-errors': sidebar('integration_errors'),
    '/settings': sidebar('profile'),
  };

  const items: BreadcrumbItem[] = [{ label: topbar('home'), href: defaultPath }];

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
    items.push({ label: sidebar('platform_heading') });
    items.push({ label: sidebar(ADMIN_LABEL_KEYS[pathname] ?? 'admin_tenants') });
  } else if (primaryPath === '/settings') {
    const settingTab = pathname.split('/').filter(Boolean)[1] ?? 'profile';
    items.push({
      label: sidebar(settingTab === 'profile' ? 'account_heading' : 'workspace_settings_heading'),
    });
    if (['profile', 'general', 'integrations', 'webhooks'].includes(settingTab)) {
      items.push({ label: settings(settingTab) });
    }
  } else if (primaryPath === '/iam') {
    items.push({ label: sidebar('manage_accounts_heading') });
    items.push({ label: sidebar('staff_accounts') });
  } else if (primaryPath === '/roles-permissions') {
    const roleTab = pathname.split('/').filter(Boolean)[1] ?? 'roles';
    items.push({ label: sidebar('manage_accounts_heading') });
    items.push({ label: sidebar('roles_permissions'), href: '/roles-permissions/roles' });
    items.push({
      label:
        roleTab === 'permissions'
          ? rolesPermissions('permissions')
          : roleTab === 'members'
            ? rolesPermissions('members')
            : rolesPermissions('roles'),
    });
  } else if (primaryPath === '/billing') {
    items.push({ label: sidebar('workspace_settings_heading') });
    items.push({ label: sidebar('usage') });
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
