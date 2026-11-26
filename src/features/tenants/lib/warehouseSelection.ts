import { warehouseApi, type Warehouse } from '@/features/catalog';

import type { CommercialPlan } from '../api/commercialApi';

export type PlanWarehouseRuleSubject = Pick<CommercialPlan, 'code' | 'warehouseAllowance'>;

export interface WarehouseSelectionValidation {
  valid: boolean;
  reason?: 'required' | 'exactOne' | 'maxLimit';
  normalizedIds: string[];
  max: number;
}

/** Deduplicate and sort warehouse UUIDs canonically to match BE storage and idempotency keys. */
export function normalizeWarehouseIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function isBasicWarehousePlan(plan: PlanWarehouseRuleSubject): boolean {
  return plan.code === 'BASIC' || plan.warehouseAllowance === 1;
}

export function maxSelectableWarehouses(plan: PlanWarehouseRuleSubject): number {
  if (plan.code === 'BASIC') return 1;
  if (plan.code === 'STANDARD') {
    return Math.max(1, Math.min(3, plan.warehouseAllowance || 3));
  }
  return Math.max(1, plan.warehouseAllowance || 1);
}

export function validatePlanWarehouseSelection(
  plan: PlanWarehouseRuleSubject,
  ids: readonly string[],
): WarehouseSelectionValidation {
  const normalizedIds = normalizeWarehouseIds(ids);
  const max = maxSelectableWarehouses(plan);
  const exactOne = isBasicWarehousePlan(plan);

  if (normalizedIds.length === 0) {
    return { valid: false, reason: exactOne ? 'exactOne' : 'required', normalizedIds, max };
  }
  if (exactOne && normalizedIds.length !== 1) {
    return { valid: false, reason: 'exactOne', normalizedIds, max };
  }
  if (normalizedIds.length > max) {
    return { valid: false, reason: 'maxLimit', normalizedIds, max };
  }
  return { valid: true, normalizedIds, max };
}

export function buildWarehouseSelectionFingerprint(base: string, ids?: readonly string[]): string {
  if (ids === undefined) return base;
  return `${base}:wh=${normalizeWarehouseIds(ids).join(',')}`;
}

export async function loadActivePlatformWarehouses(signal?: AbortSignal): Promise<Warehouse[]> {
  const items: Warehouse[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    signal?.throwIfAborted();
    const page = await warehouseApi.list({ search: '', status: 'ACTIVE' }, cursor, signal);
    for (const warehouse of page.items) {
      if (warehouse.tenantId === null && warehouse.status === 'ACTIVE') {
        items.push(warehouse);
      }
    }
    if (!page.pagination.hasNext) break;
    const next = page.pagination.nextCursor;
    if (!next || seenCursors.has(next)) {
      throw new Error('Invalid warehouse pagination cursor');
    }
    seenCursors.add(next);
    cursor = next;
  } while (cursor);

  return items.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
}
