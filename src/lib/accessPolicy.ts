/**
 * Access policy trung tâm ORCA cho giao diện theo vai trò.
 *
 * Đây là NGUỒN DUY NHẤT cho route guard, sidebar, global search, breadcrumb,
 * settings tab và action-level visibility. Module thuần (không React/store) để
 * test bằng Node qua Vite `ssrLoadModule`.
 *
 * Mô hình (contract v0.2 §2, §3, §8, §11):
 * - 7 role ORCA, 2 actor scope `TENANT`/`PLATFORM`; hợp quyền (union) CHỈ trong
 *   một scope, cấm trộn scope trong một principal.
 * - Thiếu scope, role rỗng, role lạ hoặc role legacy ⇒ DENY (fail-closed).
 *   Không union với bất kỳ fallback role cũ nào.
 * - Capability catalog bám ma trận màn hình `R3 line 407–424` (D2 baseline).
 *   Capability chưa có nguồn được duyệt mang `provenance: 'PROPOSED'` và không
 *   cấp quyền, kể cả khi đã có role dự kiến trong catalog.
 */

/** Hai phạm vi actor của ORCA. Thiếu/không hợp lệ ⇒ deny. */
export type ActorScope = 'TENANT' | 'PLATFORM';

export const ACTOR_SCOPES: readonly ActorScope[] = ['TENANT', 'PLATFORM'];

/** Bảy role ORCA (SRS line 906; R3 line 84–90). */
export const ORCA_ROLES = [
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
] as const;

export type OrcaRole = (typeof ORCA_ROLES)[number];

/** Mỗi role ORCA thuộc đúng một actor scope (contract §3). */
export const ROLE_ACTOR_SCOPE: Readonly<Record<OrcaRole, ActorScope>> = Object.freeze({
  ORCA_ADMIN: 'PLATFORM',
  OPS_DISPATCHER: 'PLATFORM',
  WAREHOUSE_MANAGER: 'PLATFORM',
  WAREHOUSE_STAFF: 'PLATFORM',
  ORCA_ACCOUNTANT: 'PLATFORM',
  SELLER_OWNER: 'TENANT',
  SELLER_STAFF: 'TENANT',
});

/**
 * Bốn role legacy của SmartChain trước ORCA. Chỉ giữ để migration/compile-time:
 * chúng được nhận diện nhưng **không cấp bất kỳ quyền nào** (deny-by-default).
 */
export const LEGACY_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'] as const;

export type LegacyRole = (typeof LEGACY_ROLES)[number];

export function isOrcaRole(role: string): role is OrcaRole {
  return (ORCA_ROLES as readonly string[]).includes(role);
}

export function isLegacyRole(role: string): role is LegacyRole {
  return (LEGACY_ROLES as readonly string[]).includes(role);
}

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
  | 'platform'
  | 'finance'
  | 'apikey';

export type CapabilityProvenance = 'APPROVED' | 'PROPOSED';

/** Capability gắn với scope: `ANY` nghĩa là dùng chung cho cả hai scope. */
export type CapabilityScope = ActorScope | 'ANY';

export interface CapabilityDef {
  code: string;
  domain: CapabilityDomain;
  scope: CapabilityScope;
  roles: readonly OrcaRole[];
  provenance: CapabilityProvenance;
  /** Nguồn yêu cầu (R3/SRS/contract) hoặc nhãn PROPOSED khi chưa được duyệt. */
  source: string;
}

const R3_MATRIX = 'R3 line 407–424 (screen authorization matrix, D2 baseline)';
const D8_PROPOSED = 'FE aggregate capability chưa có action tương ứng trong D8 v3';
const D8_APPROVED = 'proposed-permission-matrix.md v3 §2 (đã duyệt)';
const CONTRACT_SECURITY = 'contract v0.2 §11 (security DoD)';

function capability(
  code: string,
  domain: CapabilityDomain,
  scope: CapabilityScope,
  roles: readonly OrcaRole[],
  provenance: CapabilityProvenance,
  source: string,
): CapabilityDef {
  return { code, domain, scope, roles, provenance, source };
}

const ALL_ORCA_ROLES: readonly OrcaRole[] = ORCA_ROLES;

/**
 * Catalog capability UI. Mọi ô không khai báo ở đây ⇒ DENY.
 * Role trong cùng một capability phải cùng scope với `scope` (hoặc `ANY`).
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  capability(
    'workspace.dashboard.view',
    'workspace',
    'ANY',
    [
      'ORCA_ADMIN',
      'OPS_DISPATCHER',
      'WAREHOUSE_MANAGER',
      'ORCA_ACCOUNTANT',
      'SELLER_OWNER',
      'SELLER_STAFF',
    ],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'workspace.settings.manage',
    'workspace',
    'TENANT',
    ['SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'workspace.billing.view',
    'workspace',
    'ANY',
    ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'iam.users.manage',
    'iam',
    'ANY',
    ['ORCA_ADMIN', 'SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'iam.roles.assign',
    'iam',
    'ANY',
    ['ORCA_ADMIN', 'SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'carriers.credentials.manage',
    'carriers',
    'PLATFORM',
    ['ORCA_ADMIN'],
    'PROPOSED',
    'R3 UC-92: ORCA Admin; UI integrations hiện vẫn dùng API tenant legacy',
  ),
  capability(
    'warehouses.view',
    'warehouses',
    'ANY',
    [
      'ORCA_ADMIN',
      'OPS_DISPATCHER',
      'WAREHOUSE_MANAGER',
      'WAREHOUSE_STAFF',
      'SELLER_OWNER',
      'SELLER_STAFF',
    ],
    'APPROVED',
    R3_MATRIX,
  ),
  capability('warehouses.manage', 'warehouses', 'PLATFORM', ['ORCA_ADMIN'], 'APPROVED', R3_MATRIX),
  capability(
    'catalog.products.view',
    'catalog',
    'ANY',
    [
      'ORCA_ADMIN',
      'OPS_DISPATCHER',
      'WAREHOUSE_MANAGER',
      'WAREHOUSE_STAFF',
      'SELLER_OWNER',
      'SELLER_STAFF',
    ],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'catalog.products.manage',
    'catalog',
    'ANY',
    ['SELLER_OWNER', 'SELLER_STAFF'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability('inventory.view', 'inventory', 'ANY', ALL_ORCA_ROLES, 'APPROVED', R3_MATRIX),
  capability(
    'inventory.reservations.view',
    'inventory',
    'TENANT',
    ['SELLER_OWNER', 'SELLER_STAFF'],
    'PROPOSED',
    'SS-507 tenant-owned reservation API chưa có mapping ORCA được duyệt',
  ),
  capability(
    'inventory.reservations.release',
    'inventory',
    'TENANT',
    ['SELLER_OWNER'],
    'PROPOSED',
    'SS-507 manual release chưa có action trong D8 v3',
  ),
  capability(
    'rules.view',
    'rules',
    'PLATFORM',
    ['ORCA_ADMIN', 'OPS_DISPATCHER', 'ORCA_ACCOUNTANT'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability('rules.create_delete', 'rules', 'PLATFORM', ['ORCA_ADMIN'], 'APPROVED', R3_MATRIX),
  capability('rules.operate', 'rules', 'PLATFORM', ['OPS_DISPATCHER'], 'APPROVED', R3_MATRIX),
  capability('orders.view', 'orders', 'ANY', ALL_ORCA_ROLES, 'APPROVED', R3_MATRIX),
  capability(
    'orders.operate',
    'orders',
    'ANY',
    ['OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'SELLER_OWNER', 'SELLER_STAFF'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'shipments.view',
    'shipments',
    'ANY',
    [
      'ORCA_ADMIN',
      'OPS_DISPATCHER',
      'WAREHOUSE_MANAGER',
      'WAREHOUSE_STAFF',
      'SELLER_OWNER',
      'SELLER_STAFF',
    ],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'shipments.operate',
    'shipments',
    'ANY',
    ['OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'reconciliation.view',
    'reconciliation',
    'PLATFORM',
    ['ORCA_ADMIN', 'ORCA_ACCOUNTANT'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'reconciliation.operate',
    'reconciliation',
    'PLATFORM',
    ['ORCA_ACCOUNTANT'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'analytics.operations.view',
    'analytics',
    'ANY',
    [
      'ORCA_ADMIN',
      'OPS_DISPATCHER',
      'WAREHOUSE_MANAGER',
      'ORCA_ACCOUNTANT',
      'SELLER_OWNER',
      'SELLER_STAFF',
    ],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'analytics.finance.view',
    'analytics',
    'ANY',
    ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'integration.errors.view',
    'integration',
    'ANY',
    ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability('audit.tenant.view', 'audit', 'TENANT', ['SELLER_OWNER'], 'APPROVED', R3_MATRIX),
  capability('audit.platform.view', 'audit', 'PLATFORM', ['ORCA_ADMIN'], 'APPROVED', R3_MATRIX),
  capability(
    'platform.tenants.manage',
    'platform',
    'PLATFORM',
    ['ORCA_ADMIN'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'platform.carriers.manage',
    'platform',
    'PLATFORM',
    ['ORCA_ADMIN'],
    'APPROVED',
    'R3 UC-91: ORCA Admin quản lý carrier catalog',
  ),
  capability(
    'platform.plans.manage',
    'platform',
    'PLATFORM',
    ['ORCA_ADMIN'],
    'APPROVED',
    R3_MATRIX,
  ),
  capability(
    'platform.observability.view',
    'platform',
    'PLATFORM',
    ['ORCA_ADMIN'],
    'APPROVED',
    R3_MATRIX,
  ),
  // Hành động nhạy cảm: warehouse staff bị DENY (contract §11; R3 line 407 note).
  capability(
    'finance.view',
    'finance',
    'ANY',
    ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'PROPOSED',
    `${D8_PROPOSED}; ${CONTRACT_SECURITY}`,
  ),
  capability(
    'cod.view',
    'finance',
    'ANY',
    ['ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'APPROVED',
    D8_APPROVED,
  ),
  capability(
    'invoice.view',
    'finance',
    'ANY',
    ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'],
    'APPROVED',
    D8_APPROVED,
  ),
  capability(
    'apikey.manage',
    'apikey',
    'TENANT',
    ['SELLER_OWNER'],
    'APPROVED',
    `${D8_APPROVED}; SRS line 213`,
  ),
];

export const CAPABILITY_ROLES: Readonly<Record<string, readonly OrcaRole[]>> = Object.freeze(
  CAPABILITIES.reduce<Record<string, readonly OrcaRole[]>>((acc, capabilityDef) => {
    acc[capabilityDef.code] = [...capabilityDef.roles];
    return acc;
  }, {}),
);

const CAPABILITY_BY_CODE: Readonly<Record<string, CapabilityDef>> = Object.freeze(
  CAPABILITIES.reduce<Record<string, CapabilityDef>>((acc, capabilityDef) => {
    acc[capabilityDef.code] = capabilityDef;
    return acc;
  }, {}),
);

/** Ma trận route cấp cao. `prefix` áp dụng cho cả nhánh con. */
export interface RoutePolicy {
  path: string;
  prefix?: boolean;
  capability?: string;
  anyCapability?: readonly string[];
  /** Route thuộc catalog phát triển, chỉ tồn tại khi DEV. */
  devOnly?: boolean;
}

export const ROUTE_POLICY: readonly RoutePolicy[] = [
  { path: '/dashboard', capability: 'workspace.dashboard.view' },
  { path: '/orders', capability: 'orders.view' },
  { path: '/warehouses', capability: 'warehouses.view' },
  { path: '/inventory', capability: 'inventory.view' },
  { path: '/rules', capability: 'rules.view' },
  { path: '/shipments', capability: 'shipments.view' },
  { path: '/reconciliation', capability: 'reconciliation.view' },
  {
    path: '/analytics',
    anyCapability: ['analytics.operations.view', 'analytics.finance.view'],
  },
  { path: '/billing', capability: 'workspace.billing.view' },
  { path: '/iam/users', capability: 'iam.users.manage' },
  // Profile chỉ cần đăng nhập + scope/role hợp lệ, mọi role ORCA đều xem được.
  { path: '/settings/profile' },
  { path: '/settings/general', capability: 'workspace.settings.manage' },
  { path: '/settings/integrations', capability: 'carriers.credentials.manage' },
  { path: '/settings/api-keys', capability: 'apikey.manage' },
  { path: '/settings/webhooks', capability: 'workspace.settings.manage' },
  { path: '/audit', capability: 'audit.tenant.view' },
  { path: '/integration-errors', capability: 'integration.errors.view' },
  // Catalog phát triển: chỉ tồn tại khi DEV.
  { path: '/components', prefix: true, devOnly: true },
  {
    path: '/admin',
    prefix: true,
    anyCapability: [
      'platform.tenants.manage',
      'platform.carriers.manage',
      'platform.plans.manage',
      'platform.observability.view',
      'audit.platform.view',
    ],
  },
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
      { key: 'warehouses', href: '/warehouses', capability: 'warehouses.view' },
      { key: 'inventory', href: '/inventory', capability: 'inventory.view' },
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
      {
        key: 'api_keys',
        href: '/settings/api-keys',
        capability: 'apikey.manage',
      },
    ],
  },
  {
    key: 'manage_accounts_heading',
    scope: 'workspace',
    items: [{ key: 'staff_accounts', href: '/iam/users', capability: 'iam.users.manage' }],
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

/**
 * Scope hiệu lực của một tập role. Bất kỳ role lạ/legacy hoặc role khác scope
 * đều làm principal không hợp lệ, kể cả khi có role ORCA hợp lệ đi kèm.
 */
export function resolveActorScope(roles: readonly string[]): ActorScope | null {
  let scope: ActorScope | null = null;
  for (const role of roles) {
    if (!isOrcaRole(role)) return null;
    const roleScope = ROLE_ACTOR_SCOPE[role];
    if (scope === null) {
      scope = roleScope;
    } else if (scope !== roleScope) {
      return null;
    }
  }
  return scope;
}

/**
 * Chuẩn hóa role từ server về tập role ORCA hợp lệ **trong đúng một scope**.
 * Fail-closed: thiếu scope, hoặc bất kỳ code nào không thuộc bảy role ORCA
 * (legacy/khoảng trắng/lạ) ⇒ mảng rỗng (deny **toàn bộ** principal), kể cả khi
 * các code còn lại hợp lệ. Không bao giờ union với role fallback cũ.
 */
export function getEffectiveRoles(
  roles: readonly string[],
  actorScope: ActorScope | null | undefined,
): OrcaRole[] {
  if (actorScope !== 'TENANT' && actorScope !== 'PLATFORM') return [];

  const effective: OrcaRole[] = [];
  for (const role of roles) {
    // Một code ngoài bảy role ORCA (legacy hoặc lạ) ⇒ deny toàn bộ principal,
    // không bỏ qua rồi tiếp tục với các role hợp lệ còn lại.
    if (!isOrcaRole(role)) return [];
    // Một role thuộc scope khác ⇒ toàn bộ principal bị deny (không trộn scope).
    if (ROLE_ACTOR_SCOPE[role] !== actorScope) return [];
    if (!effective.includes(role)) effective.push(role);
  }
  return effective;
}

export function can(roles: readonly string[], capability: string): boolean {
  const def = CAPABILITY_BY_CODE[capability];
  if (!def || def.provenance !== 'APPROVED') return false;

  const roleScope = resolveActorScope(roles);
  if (roleScope === null) return false;
  if (def.scope !== 'ANY' && def.scope !== roleScope) return false;
  return roles.some((role) => (def.roles as readonly string[]).includes(role));
}

export function canAny(roles: readonly string[], capabilities: readonly string[]): boolean {
  return capabilities.some((capability) => can(roles, capability));
}

export function canAll(roles: readonly string[], capabilities: readonly string[]): boolean {
  return capabilities.every((capability) => can(roles, capability));
}

/** Bỏ dấu `/` cuối (trừ root) để `/dashboard/` khớp route `/dashboard`. */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '');
  }
  return pathname;
}

function matchesRoute(route: RoutePolicy, pathname: string): boolean {
  if (route.prefix) {
    return pathname === route.path || pathname.startsWith(`${route.path}/`);
  }
  return pathname === route.path;
}

export function isRouteAllowed(roles: readonly string[], pathname: string, isDev = false): boolean {
  if (resolveActorScope(roles) === null) return false;

  const route = ROUTE_POLICY.find((candidate) =>
    matchesRoute(candidate, normalizePathname(pathname)),
  );
  if (!route) return false;
  if (route.devOnly === true && !isDev) return false;
  if (route.capability !== undefined && !can(roles, route.capability)) return false;
  if (route.anyCapability !== undefined && !canAny(roles, route.anyCapability)) return false;
  return true;
}

const DEFAULT_PATHS: Readonly<Record<OrcaRole, string>> = Object.freeze({
  ORCA_ADMIN: '/admin/tenants',
  OPS_DISPATCHER: '/orders',
  WAREHOUSE_MANAGER: '/warehouses',
  WAREHOUSE_STAFF: '/inventory',
  ORCA_ACCOUNTANT: '/reconciliation',
  SELLER_OWNER: '/dashboard',
  SELLER_STAFF: '/dashboard',
});

/** Route mặc định sau đăng nhập; không có role hợp lệ ⇒ `/403` (fail-closed). */
export function getDefaultPath(roles: readonly string[]): string {
  if (resolveActorScope(roles) === null) return '/403';
  for (const role of ORCA_ROLES) {
    if ((roles as readonly string[]).includes(role)) return DEFAULT_PATHS[role];
  }
  return '/403';
}

function isLinkAllowed(roles: readonly string[], link: NavLink): boolean {
  if (link.capability !== undefined && !can(roles, link.capability)) return false;
  if (link.anyCapability !== undefined && !canAny(roles, link.anyCapability)) return false;
  return true;
}

export interface VisibleNavGroup {
  key: string;
  items: Array<NavItem & { children?: NavLink[] }>;
}

/**
 * Sidebar builder: chỉ giữ group/menu có ít nhất một route được phép (mục 9).
 * `isDev` bật group `devOnly` (catalog `/components/*`). Các group trùng key
 * (vd "Giám sát" của platform và workspace) được gộp để không trùng React key.
 */
export function getVisibleNavGroups(roles: readonly string[], isDev: boolean): VisibleNavGroup[] {
  if (resolveActorScope(roles) === null) return [];

  const visible: VisibleNavGroup[] = [];
  for (const group of NAV_GROUPS) {
    if (group.devOnly === true && !isDev) continue;

    const items = group.items
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => isLinkAllowed(roles, child)),
      }))
      .filter((item) => {
        if (item.children) return item.children.length > 0;
        return isLinkAllowed(roles, item);
      });

    if (items.length === 0) continue;

    const existing = visible.find((candidate) => candidate.key === group.key);
    if (existing) {
      existing.items.push(...items);
    } else {
      visible.push({ key: group.key, items });
    }
  }
  return visible;
}

export interface SearchLink {
  key: string;
  href: string;
  groupKey: string;
}

/** Global search policy: chỉ trả route mà vai trò được truy cập (mục 4.4). */
export function getSearchLinks(roles: readonly string[], isDev: boolean): SearchLink[] {
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
