import { useMemo } from 'react';

import {
  can as canRole,
  canAll as canAllRoles,
  canAny as canAnyRoles,
  getDefaultPath,
  getEffectiveRoles,
  isRouteAllowed,
  type OrcaRole,
} from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

/**
 * Hook truy cập policy UI theo profile hiện tại (mục 9). Trả `can`, `canAny`,
 * `canAll` và các trợ giúp dùng chung cho `Can`, sidebar, search và route guard.
 *
 * Role được chuẩn hóa theo `actorScope` của phiên (fail-closed: thiếu scope ⇒
 * không có role hiệu lực). Mọi consumer dùng chung một policy trung tâm.
 */
export function useAccess() {
  const user = useAuthStore((state) => state.user);
  const actorScope = user?.actorScope ?? null;

  const roles = useMemo<OrcaRole[]>(
    () => getEffectiveRoles(user?.roles ?? [], user?.actorScope),
    [user?.roles, user?.actorScope],
  );
  const defaultPath = useMemo(() => getDefaultPath(roles), [roles]);

  return {
    roles,
    actorScope,
    tenantId: user?.tenantId ?? null,
    defaultPath,
    can: (capability: string) => canRole(roles, capability),
    canAny: (capabilities: readonly string[]) => canAnyRoles(roles, capabilities),
    canAll: (capabilities: readonly string[]) => canAllRoles(roles, capabilities),
    isRouteAllowed: (pathname: string) => isRouteAllowed(roles, pathname, import.meta.env.DEV),
  };
}
