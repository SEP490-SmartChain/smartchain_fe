import {
  visualPlanSchema,
  type VisualEntity,
  type VisualPlan,
} from '../schemas/warehouseVisualLayoutSchema';

import type { Bin, Zone } from '../api/warehouseLayoutApi';

export function validVisualPlan(
  plan: VisualPlan,
  zones: readonly Zone[],
  bins: readonly Bin[],
): boolean {
  if (!visualPlanSchema.safeParse(plan).success) return false;
  const actualZones = new Set(zones.map((zone) => zone.id));
  const actualBins = new Map(bins.map((bin) => [bin.id, bin]));
  const placedZones = new Map(plan.zones.map((zone) => [zone.zoneId, zone]));
  const cells = new Set<string>();
  for (const zone of plan.zones) {
    if (
      !actualZones.has(zone.zoneId) ||
      zone.x + zone.width > plan.width ||
      zone.z + zone.depth > plan.depth
    ) {
      return false;
    }
    if (
      plan.zones.some(
        (other) =>
          other.zoneId !== zone.zoneId &&
          zone.x < other.x + other.width &&
          zone.x + zone.width > other.x &&
          zone.z < other.z + other.depth &&
          zone.z + zone.depth > other.z,
      )
    ) {
      return false;
    }
  }
  for (const bin of plan.bins) {
    const actual = actualBins.get(bin.binId);
    const zone = actual && placedZones.get(actual.zoneId);
    const key = `${actual?.zoneId}:${bin.x}:${bin.z}`;
    if (!zone || bin.x >= zone.width || bin.z >= zone.depth || cells.has(key)) return false;
    cells.add(key);
  }
  return true;
}

/** Deterministic first layout, based on real identifiers. Cells are schematic, not metres. */
export function arrangeVisualPlan(zones: readonly Zone[], bins: readonly Bin[]): VisualPlan {
  if (zones.length > 100 || bins.length > 1000) throw new Error('VISUAL_LAYOUT_LIMIT');
  const plan: VisualPlan = { schemaVersion: 1, width: 128, depth: 128, zones: [], bins: [] };
  const sizes = zones.map((zone) => {
    const count = bins.filter((bin) => bin.zoneId === zone.id).length;
    const width = Math.max(8, Math.ceil(Math.sqrt(count * 2)) + 2);
    return { width, depth: Math.max(6, Math.ceil(count / Math.floor((width - 2) / 2)) * 2 + 2) };
  });
  plan.width = Math.min(
    128,
    Math.max(
      32,
      ...sizes.map((size) => size.width + 4),
      Math.ceil(
        Math.sqrt(sizes.reduce((sum, size) => sum + (size.width + 3) * (size.depth + 3), 0)),
      ),
    ),
  );
  let x = 2,
    z = 2,
    rowDepth = 0;
  for (const zone of zones) {
    const children = bins.filter((bin) => bin.zoneId === zone.id);
    const width = Math.max(8, Math.ceil(Math.sqrt(children.length * 2)) + 2);
    const columns = Math.floor((width - 2) / 2);
    const depth = Math.max(6, Math.ceil(children.length / columns) * 2 + 2);
    if (x + width > plan.width - 2) {
      x = 2;
      z += rowDepth + 3;
      rowDepth = 0;
    }
    if (z + depth > plan.depth - 2) {
      plan.depth = 256;
    }
    if (z + depth > plan.depth - 2) throw new Error('VISUAL_LAYOUT_LIMIT');
    plan.zones.push({ zoneId: zone.id, x, z, width, depth });
    children.forEach((bin, index) =>
      plan.bins.push({
        binId: bin.id,
        x: 1 + (index % columns) * 2,
        z: 1 + Math.floor(index / columns) * 2,
      }),
    );
    x += width + 3;
    rowDepth = Math.max(rowDepth, depth);
  }
  plan.width = Math.max(
    32,
    Math.ceil(Math.max(...plan.zones.map((zone) => zone.x + zone.width + 2), 16) / 4) * 4,
  );
  plan.depth = Math.max(32, Math.ceil((z + rowDepth + 2) / 4) * 4);
  return plan;
}

export function moveVisualEntity(
  plan: VisualPlan,
  entity: VisualEntity,
  x: number,
  z: number,
  zones: readonly Zone[],
  bins: readonly Bin[],
): VisualPlan | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const next = {
    ...plan,
    zones: plan.zones.map((zone) =>
      entity.kind === 'zone' && zone.zoneId === entity.id
        ? { ...zone, x: Math.round(x), z: Math.round(z) }
        : zone,
    ),
    bins: plan.bins.map((bin) =>
      entity.kind === 'bin' && bin.binId === entity.id
        ? { ...bin, x: Math.round(x), z: Math.round(z) }
        : bin,
    ),
  };
  return validVisualPlan(next, zones, bins) ? next : null;
}

export function visualPlanKey(plan: VisualPlan): string {
  return JSON.stringify({
    ...plan,
    zones: [...plan.zones].sort((a, b) => a.zoneId.localeCompare(b.zoneId)),
    bins: [...plan.bins].sort((a, b) => a.binId.localeCompare(b.binId)),
  });
}
