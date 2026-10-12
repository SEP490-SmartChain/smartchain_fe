import type { ActorScope } from './accessPolicy';

interface ScopedUser {
  userId: string;
  tenantId: string | null;
  actorScope?: ActorScope | null;
  roles: string[];
  permissions: string[];
  warehouseIds?: readonly string[];
}

/** Server-owned scope snapshot; filters and access-token rotation are not grants. */
export function getAuthScopeKey(user: ScopedUser | null): string {
  if (!user) return '';
  const sorted = (values: readonly string[]) => [...new Set(values)].sort();
  return JSON.stringify([
    user.userId,
    user.actorScope ?? null,
    user.tenantId,
    sorted(user.roles),
    sorted(user.permissions),
    sorted(user.warehouseIds ?? []),
  ]);
}
