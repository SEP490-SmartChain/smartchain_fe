/**
 * Access policy trung tâm cho giao diện theo vai trò SmartChain.
 *
 * Module này là hàm/thuần (không import React/store) để Sidebar, route guard,
 * global search, breadcrumb, settings tab và action-level visibility dùng CHUNG
 * một nguồn sự thật, đồng thời test được bằng Node qua Vite `ssrLoadModule`.
 *
 * Nguồn: `docs/RBAC_UI_SCOPE.md` (mục 4–8). Giai đoạn hiện tại policy dùng ROLE
 * làm nguồn và ánh xạ role → capability nội bộ. Khi backend có seed permission
 * và contract chính thức, chuyển nguồn policy sang permission server qua feature
 * flag/contract version rõ ràng — KHÔNG union ngầm hai nguồn.
 */

export type AuthRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DISPATCHER' | 'ACCOUNTANT';

export const AUTH_ROLES: readonly AuthRole[] = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'DISPATCHER',
  'ACCOUNTANT',
];

/** Role workspace có thể gán cho thành viên (loại trừ SUPER_ADMIN — role nền tảng). */
export type WorkspaceRole = Exclude<AuthRole, 'SUPER_ADMIN'>;

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  'TENANT_ADMIN',
  'DISPATCHER',
  'ACCOUNTANT',
];

export type CapabilityDomain =
  | 'workspace'
  | 'iam'
  | 'carriers'
  | 'warehouses'
  | 'catalog'
  | 'inventory'
  | 'rules'
  | 'orders'
  | 'shipments'
  | 'reconciliation'
  | 'analytics'
  | 'integration'
  | 'audit'
  | 'platform';

export interface CapabilityDef {
  code: string;
  domain: CapabilityDomain;
  roles: readonly AuthRole[];
}

/**
 * Catalog capability UI (mục 8) + một vài capability nội bộ cần thiết cho route
 * không có mã trong mục 8 (`workspace.billing.view`, `integration.errors.view`).
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    code: 'workspace.dashboard.view',
    domain: 'workspace',
    roles: ['TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  },
  { code: 'workspace.settings.manage', domain: 'workspace', roles: ['TENANT_ADMIN'] },
  { code: 'workspace.billing.view', domain: 'workspace', roles: ['TENANT_ADMIN'] },
  { code: 'iam.users.manage', domain: 'iam', roles: ['TENANT_ADMIN'] },
  { code: 'iam.roles.assign', domain: 'iam', roles: ['TENANT_ADMIN'] },
  { code: 'carriers.credentials.manage', domain: 'carriers', roles: ['TENANT_ADMIN'] },
  { code: 'warehouses.view', domain: 'warehouses', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'warehouses.manage', domain: 'warehouses', roles: ['TENANT_ADMIN'] },
  { code: 'catalog.products.view', domain: 'catalog', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'catalog.products.manage', domain: 'catalog', roles: ['TENANT_ADMIN'] },
  { code: 'inventory.view', domain: 'inventory', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'rules.view', domain: 'rules', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'rules.create_delete', domain: 'rules', roles: ['TENANT_ADMIN'] },
  { code: 'rules.operate', domain: 'rules', roles: ['DISPATCHER'] },
  { code: 'orders.view', domain: 'orders', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'orders.operate', domain: 'orders', roles: ['DISPATCHER'] },
  { code: 'shipments.view', domain: 'shipments', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'shipments.operate', domain: 'shipments', roles: ['DISPATCHER'] },
  { code: 'reconciliation.view', domain: 'reconciliation', roles: ['TENANT_ADMIN', 'ACCOUNTANT'] },
  { code: 'reconciliation.operate', domain: 'reconciliation', roles: ['ACCOUNTANT'] },
  { code: 'analytics.operations.view', domain: 'analytics', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'analytics.finance.view', domain: 'analytics', roles: ['TENANT_ADMIN', 'ACCOUNTANT'] },
  { code: 'integration.errors.view', domain: 'integration', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { code: 'audit.tenant.view', domain: 'audit', roles: ['TENANT_ADMIN'] },
  { code: 'audit.platform.view', domain: 'audit', roles: ['SUPER_ADMIN'] },
  { code: 'platform.tenants.manage', domain: 'platform', roles: ['SUPER_ADMIN'] },
  { code: 'platform.carriers.manage', domain: 'platform', roles: ['SUPER_ADMIN'] },
  { code: 'platform.plans.manage', domain: 'platform', roles: ['SUPER_ADMIN'] },
  { code: 'platform.observability.view', domain: 'platform', roles: ['SUPER_ADMIN'] },
];

export const CAPABILITY_ROLES: Readonly<Record<string, readonly AuthRole[]>> = Object.freeze(
  CAPABILITIES.reduce<Record<string, AuthRole[]>>((acc, capability) => {
    acc[capability.code] = [...capability.roles];
    return acc;
  }, {}),
);

/** Ma trận route cấp cao (mục 6). `prefix` áp dụng cho cả nhánh con. */
export interface RoutePolicy {
  path: string;
  prefix?: boolean;
  roles: readonly AuthRole[];
}

export const ROUTE_POLICY: readonly RoutePolicy[] = [
  { path: '/dashboard', roles: ['TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'] },
  { path: '/orders', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { path: '/inventory', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { path: '/rules', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { path: '/shipments', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  { path: '/reconciliation', roles: ['TENANT_ADMIN', 'ACCOUNTANT'] },
  { path: '/analytics', roles: ['TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'] },
  { path: '/billing', roles: ['TENANT_ADMIN'] },
  { path: '/iam/users', roles: ['TENANT_ADMIN'] },
  { path: '/roles-permissions', prefix: true, roles: ['TENANT_ADMIN'] },
  { path: '/settings/profile', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'] },
  { path: '/settings/general', roles: ['TENANT_ADMIN'] },
  { path: '/settings/integrations', roles: ['TENANT_ADMIN'] },
  { path: '/settings/webhooks', roles: ['TENANT_ADMIN'] },
  { path: '/audit', roles: ['TENANT_ADMIN'] },
  { path: '/integration-errors', roles: ['TENANT_ADMIN', 'DISPATCHER'] },
  // Catalog phát triển: chỉ tồn tại khi DEV; trong DEV mọi role đăng nhập đều xem được.
  { path: '/components', prefix: true, roles: AUTH_ROLES },
  { path: '/admin', prefix: true, roles: ['SUPER_ADMIN'] },
];

export interface NavLink {
  key: string;
  href: string;
  capability?: string;
  anyCapability?: string[];
}

export interface NavItem extends NavLink {
  children?: NavLink[];
}

export type NavScope = 'platform' | 'workspace' | 'shared';

export interface NavGroup {
  key: string;
  scope: NavScope;
  devOnly?: boolean;
  items: NavItem[];
}

/** Template sidebar (mục 5) dùng chung; lọc theo capability để ra template từng role. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'platform_heading',
    scope: 'platform',
    items: [
      { key: 'admin_tenants', href: '/admin/tenants', capability: 'platform.tenants.manage' },
      { key: 'admin_carriers', href: '/admin/carriers', capability: 'platform.carriers.manage' },
      { key: 'subscription_plans', href: '/admin/plans', capability: 'platform.plans.manage' },
    ],
  },
  {
    key: 'monitoring_heading',
    scope: 'platform',
    items: [
      { key: 'platform_health', href: '/admin/health', capability: 'platform.observability.view' },
      { key: 'admin_audit_trail', href: '/admin/audit', capability: 'audit.platform.view' },
      {
        key: 'api_traffic_logs',
        href: '/admin/api-traffic',
        capability: 'platform.observability.view',
      },
      {
        key: 'system_observability',
        href: '/admin/observability',
        capability: 'platform.observability.view',
      },
      {
        key: 'webhook_delivery_logs',
        href: '/admin/webhooks',
        capability: 'platform.observability.view',
      },
      { key: 'quota_management', href: '/admin/quotas', capability: 'platform.observability.view' },
    ],
  },
  {
    key: 'workspace_heading',
    scope: 'workspace',
    items: [{ key: 'dashboard', href: '/dashboard', capability: 'workspace.dashboard.view' }],
  },
  {
    key: 'operations_heading',
    scope: 'workspace',
    items: [
      { key: 'orders', href: '/orders', capability: 'orders.view' },
      { key: 'inventory', href: '/inventory', capability: 'warehouses.view' },
      { key: 'rules', href: '/rules', capability: 'rules.view' },
      { key: 'shipments', href: '/shipments', capability: 'shipments.view' },
    ],
  },
  {
    key: 'finance_heading',
    scope: 'workspace',
    items: [{ key: 'reconciliation', href: '/reconciliation', capability: 'reconciliation.view' }],
  },
  {
    key: 'reports_heading',
    scope: 'workspace',
    items: [
      {
        key: 'analytics',
        href: '/analytics',
        anyCapability: ['analytics.operations.view', 'analytics.finance.view'],
      },
    ],
  },
  {
    key: 'integrations_heading',
    scope: 'workspace',
    items: [
      {
        key: 'carrier_connections',
        href: '/settings/integrations',
        capability: 'carriers.credentials.manage',
      },
    ],
  },
  {
    key: 'manage_accounts_heading',
    scope: 'workspace',
    items: [
      { key: 'staff_accounts', href: '/iam/users', capability: 'iam.users.manage' },
      {
        key: 'roles_permissions',
        href: '/roles-permissions/roles',
        capability: 'iam.roles.assign',
      },
    ],
  },
  {
    key: 'workspace_settings_heading',
    scope: 'workspace',
    items: [
      { key: 'general', href: '/settings/general', capability: 'workspace.settings.manage' },
      { key: 'webhooks', href: '/settings/webhooks', capability: 'workspace.settings.manage' },
      { key: 'usage', href: '/billing', capability: 'workspace.billing.view' },
    ],
  },
  {
    key: 'monitoring_heading',
    scope: 'workspace',
    items: [
      { key: 'audit_trail', href: '/audit', capability: 'audit.tenant.view' },
      {
        key: 'integration_errors',
        href: '/integration-errors',
        capability: 'integration.errors.view',
      },
    ],
  },
  {
    key: 'account_heading',
    scope: 'shared',
    items: [{ key: 'profile', href: '/settings/profile' }],
  },
  {
    key: 'ui_heading',
    scope: 'shared',
    devOnly: true,
    items: [
      {
        key: 'components',
        href: '/components/data-table',
        children: [
          { key: 'data_table', href: '/components/data-table' },
          { key: 'buttons', href: '/components/buttons' },
          { key: 'dropzone', href: '/components/dropzone' },
          { key: 'data_display', href: '/components/data-display' },
        ],
      },
    ],
  },
];

export function getEffectiveRoles(roles: readonly string[]): AuthRole[] {
  const normalized = roles.filter((role): role is AuthRole =>
    (AUTH_ROLES as readonly string[]).includes(role),
  );
  // SUPER_ADMIN là tài khoản nền tảng, không trộn menu/capability workspace vào.
  if (normalized.includes('SUPER_ADMIN')) return ['SUPER_ADMIN'];
  return normalized;
}

export function isSuperAdmin(roles: readonly AuthRole[]): boolean {
  return roles.includes('SUPER_ADMIN');
}

export function can(roles: readonly AuthRole[], capability: string): boolean {
  const allowed = CAPABILITY_ROLES[capability];
  if (!allowed) return false;
  return roles.some((role) => allowed.includes(role));
}

export function canAny(roles: readonly AuthRole[], capabilities: readonly string[]): boolean {
  return capabilities.some((capability) => can(roles, capability));
}

export function canAll(roles: readonly AuthRole[], capabilities: readonly string[]): boolean {
  return capabilities.every((capability) => can(roles, capability));
}

/** Bỏ dấu `/` cuối (trừ root) để `/dashboard/` khớp route `/dashboard`. */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '');
  }
  return pathname;
}

export function isRouteAllowed(roles: readonly AuthRole[], pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return ROUTE_POLICY.some((route) => {
    const matches = route.prefix
      ? normalized === route.path || normalized.startsWith(`${route.path}/`)
      : normalized === route.path;
    return matches && roles.some((role) => route.roles.includes(role));
  });
}

/** Route mặc định sau đăng nhập (mục 4.8). */
export function getDefaultPath(roles: readonly AuthRole[]): string {
  return isSuperAdmin(roles) ? '/admin/tenants' : '/dashboard';
}

function isLinkAllowed(roles: readonly AuthRole[], link: NavLink): boolean {
  if (link.capability && !can(roles, link.capability)) return false;
  if (link.anyCapability && !canAny(roles, link.anyCapability)) return false;
  return true;
}

export interface VisibleNavGroup {
  key: string;
  items: Array<NavItem & { children?: NavLink[] }>;
}

/**
 * Sidebar builder: chỉ giữ group/menu có ít nhất một route được phép (mục 9).
 * `isDev` bật các group `devOnly` (catalog `/components/*`).
 */
export function getVisibleNavGroups(roles: readonly AuthRole[], isDev: boolean): VisibleNavGroup[] {
  const platform = isSuperAdmin(roles);
  return NAV_GROUPS.filter((group) => {
    if (group.devOnly) return isDev;
    if (group.scope === 'platform') return platform;
    if (group.scope === 'workspace') return !platform;
    return true;
  })
    .map((group) => ({
      key: group.key,
      items: group.items
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => isLinkAllowed(roles, child)),
        }))
        .filter((item) => {
          if (item.children) return item.children.length > 0;
          return isLinkAllowed(roles, item);
        }),
    }))
    .filter((group) => group.items.length > 0);
}

export interface SearchLink {
  key: string;
  href: string;
  groupKey: string;
}

/** Global search policy: chỉ trả route mà vai trò được truy cập (mục 4.4). */
export function getSearchLinks(roles: readonly AuthRole[], isDev: boolean): SearchLink[] {
  return getVisibleNavGroups(roles, isDev).flatMap((group) =>
    group.items.flatMap((item) => {
      if (item.children && item.children.length > 0) {
        return item.children.map((child) => ({
          key: child.key,
          href: child.href,
          groupKey: group.key,
        }));
      }
      return [{ key: item.key, href: item.href, groupKey: group.key }];
    }),
  );
}
