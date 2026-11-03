import { can, getEffectiveRoles } from '@/lib/accessPolicy';
import type { AuthUser } from '@/stores/authStore';

import type { TenantSummary } from '../types/tenant.types';

function csvCell(value: string | number): string {
  const text = String(value);
  // CSV quoting alone does not prevent Excel/LibreOffice formula execution.
  const safe = /^[\s\p{Cc}]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export only the loaded seller-directory page and its visible field allowlist. */
export function tenantCsvExport(
  tenants: readonly TenantSummary[],
  user: AuthUser | null,
  headers: readonly string[],
): string {
  if (
    user?.actorScope !== 'PLATFORM' ||
    user.tenantId !== null ||
    !can(getEffectiveRoles(user.roles, user.actorScope), 'platform.tenants.manage')
  ) {
    throw new Error('AUTH.FORBIDDEN');
  }
  const rows = tenants.map((tenant) => [
    tenant.id,
    tenant.name,
    tenant.slug,
    tenant.adminEmail ?? '',
    tenant.subscription.planCode ?? 'STANDARD',
    tenant.status,
    tenant.quota.ordersUsed,
    tenant.quota.ordersTotal,
    tenant.createdAt.slice(0, 10),
  ]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
