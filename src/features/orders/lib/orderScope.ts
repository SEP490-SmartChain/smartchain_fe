import { getEffectiveRoles, can } from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

export function orderScope() {
  const { user, revision, status } = useAuthStore.getState();
  return JSON.stringify([
    revision,
    status,
    user?.userId,
    user?.tenantId,
    user?.actorScope,
    user?.roles,
    user?.permissions,
  ]);
}
export function sellerOrderAccess() {
  const user = useAuthStore.getState().user;
  const roles = getEffectiveRoles(user?.roles ?? [], user?.actorScope);
  return {
    read: !!user?.tenantId && can(roles, 'orders.seller.read'),
    create: !!user?.tenantId && can(roles, 'orders.create'),
  };
}
