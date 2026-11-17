import { z } from 'zod';

import type { AuthUser } from '@/stores/authStore';

import { getEffectiveRoles } from './accessPolicy';

const uuid = z.string().uuid();
const snapshotSchema = z.object({
  warehouseIds: z.array(uuid).max(10000),
  readIds: z.array(uuid).max(10000),
});
export type AssignmentNoticeSnapshot = z.infer<typeof snapshotSchema>;

/** This is device-local acknowledgement of current grants, never an authorization source. */
export function assignedWarehouseIds(user: AuthUser | null): string[] {
  if (!user || user.actorScope !== 'PLATFORM' || user.tenantId !== null) return [];
  const roles = getEffectiveRoles(user.roles, user.actorScope);
  if (
    !roles.some((role) => ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'OPS_DISPATCHER'].includes(role))
  ) {
    return [];
  }
  return [...new Set((user.warehouseIds ?? []).filter((id) => uuid.safeParse(id).success))].sort();
}

export function reconcileAssignmentNotices(
  warehouseIds: readonly string[],
  stored: unknown,
): AssignmentNoticeSnapshot {
  const previous = snapshotSchema.safeParse(stored);
  return {
    warehouseIds: [...warehouseIds],
    readIds: previous.success
      ? warehouseIds.filter(
          (id) => previous.data.warehouseIds.includes(id) && previous.data.readIds.includes(id),
        )
      : [],
  };
}
