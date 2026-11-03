import type { AuthUser } from '@/stores/authStore';

import { getEffectiveRoles } from './accessPolicy';

export function canStartSellerIntake(user: AuthUser | null): boolean {
  const roles = getEffectiveRoles(user?.roles ?? [], user?.actorScope);
  return (
    !!user?.tenantId &&
    user.serviceStatus === 'ACTIVE' &&
    roles.some((role) => role === 'SELLER_OWNER' || role === 'SELLER_STAFF')
  );
}
