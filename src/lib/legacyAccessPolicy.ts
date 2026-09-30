/**
 * @deprecated Danh mục role/capability legacy của SmartChain trước ORCA.
 *
 * Module này **chỉ để hiển thị** trên trang `Roles & Permissions` cũ. Nó KHÔNG
 * được dùng để cấp quyền: mọi quyết định route/nav/search/action phải đi qua
 * `src/lib/accessPolicy.ts`. Bốn role legacy dưới đây là deny-by-default.
 *
 * Sẽ bị xoá cùng trang Roles & Permissions khi hoàn tất cutover ORCA.
 */

import type { CapabilityDomain, LegacyRole } from './accessPolicy';

export type { LegacyRole };

export type LegacyWorkspaceRole = Exclude<LegacyRole, 'SUPER_ADMIN'>;

export const LEGACY_WORKSPACE_ROLES: readonly LegacyWorkspaceRole[] = [
  'TENANT_ADMIN',
  'DISPATCHER',
  'ACCOUNTANT',
];

export interface LegacyCapabilityDef {
  code: string;
  domain: CapabilityDomain;
  roles: readonly LegacyRole[];
}

export const LEGACY_CAPABILITIES: readonly LegacyCapabilityDef[] = [
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
