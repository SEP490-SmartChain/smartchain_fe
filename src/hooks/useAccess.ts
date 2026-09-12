import { useMemo } from 'react';

import {
  can as canRole,
  canAll as canAllRoles,
  canAny as canAnyRoles,
  getDefaultPath,
  getEffectiveRoles,
  isRouteAllowed,
  isSuperAdmin,
  type AuthRole,
} from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

/**
 * Hook truy cập policy UI theo profile hiện tại (mục 9). Trả `can`, `canAny`,
 * `canAll` và các trợ giúp dùng chung cho `Can`, sidebar, search và route guard.
 */
export function useAccess() {
  const user = useAuthStore((state) => state.user);

  const roles = useMemo<AuthRole[]>(() => getEffectiveRoles(user?.roles ?? []), [user?.roles]);
  const defaultPath = useMemo(() => getDefaultPath(roles), [roles]);

  return {
    roles,
    tenantId: user?.tenantId ?? null,
    isSuperAdmin: isSuperAdmin(roles),
    defaultPath,
    can: (capability: string) => canRole(roles, capability),
    canAny: (capabilities: readonly string[]) => canAnyRoles(roles, capabilities),
    canAll: (capabilities: readonly string[]) => canAllRoles(roles, capabilities),
    isRouteAllowed: (pathname: string) => isRouteAllowed(roles, pathname),
  };
}
