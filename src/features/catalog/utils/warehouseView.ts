import { z } from 'zod';

import type { Bin, Zone } from '../api/warehouseLayoutApi';
import type { VisualEntity, VisualPlan } from '../schemas/warehouseVisualLayoutSchema';

export const warehouseViewFilterSchema = z.object({
  search: z.string(),
  zoneId: z.string(),
  zoneType: z.enum(['all', 'RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE']),
  status: z.enum(['all', 'active', 'inactive']),
  placement: z.enum(['all', 'placed', 'unplaced']),
});
export type WarehouseViewFilters = z.infer<typeof warehouseViewFilterSchema>;
export const defaultWarehouseViewFilters: WarehouseViewFilters = {
  search: '',
  zoneId: '',
  zoneType: 'all',
  status: 'all',
  placement: 'all',
};
export const visualEntityKey = (entity: VisualEntity) => `${entity.kind}:${entity.id}`;

/** Filters catalog results, never the draft or the collision obstacles. */
export function filterWarehouseEntities(
  zones: readonly Zone[],
  bins: readonly Bin[],
  plan: VisualPlan,
  filters: WarehouseViewFilters,
  locale: string,
): VisualEntity[] {
  const query = filters.search.trim().toLocaleLowerCase(locale);
  const placedZones = new Set(plan.zones.map((item) => item.zoneId));
  const placedBins = new Set(plan.bins.map((item) => item.binId));
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));
  const matches = (zone: Zone, active: boolean, placed: boolean, text: string) =>
    (!filters.zoneId || zone.id === filters.zoneId) &&
    (filters.zoneType === 'all' || zone.zoneType === filters.zoneType) &&
    (filters.status === 'all' || active === (filters.status === 'active')) &&
    (filters.placement === 'all' || placed === (filters.placement === 'placed')) &&
    text.toLocaleLowerCase(locale).includes(query);
  return [
    ...zones
      .filter((zone) => matches(zone, zone.isActive, placedZones.has(zone.id), zone.code))
      .map((zone): VisualEntity => ({ kind: 'zone', id: zone.id })),
    ...bins
      .filter((bin) => {
        const zone = zoneMap.get(bin.zoneId);
        return (
          zone &&
          matches(
            zone,
            bin.isActive,
            placedBins.has(bin.id) && placedZones.has(bin.zoneId),
            `${bin.code} ${bin.barcode}`,
          )
        );
      })
      .map((bin): VisualEntity => ({ kind: 'bin', id: bin.id })),
  ];
}

export type WarehouseViewBounds = { x: number; z: number; width: number; depth: number };

/** Bins use coordinates relative to their real parent zone, not array order. */
export function warehouseEntityBounds(
  entity: VisualEntity,
  plan: VisualPlan,
  bins: readonly Bin[],
): WarehouseViewBounds | null {
  if (entity.kind === 'zone') {
    const zone = plan.zones.find((item) => item.zoneId === entity.id);
    return zone ? { x: zone.x, z: zone.z, width: zone.width, depth: zone.depth } : null;
  }
  const bin = bins.find((item) => item.id === entity.id);
  const place = plan.bins.find((item) => item.binId === entity.id);
  const zone = bin && plan.zones.find((item) => item.zoneId === bin.zoneId);
  return place && zone ? { x: zone.x + place.x, z: zone.z + place.z, width: 1, depth: 1 } : null;
}

/** Fit a bounding sphere using the smaller usable field of view, including HUD space. */
export function warehouseCameraDistance(
  bounds: WarehouseViewBounds,
  aspect: number,
  verticalFov: number,
  usableFraction: number,
): number {
  const verticalHalf = (verticalFov * Math.PI) / 360;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect * usableFraction);
  const radius = Math.hypot(bounds.width, bounds.depth, 1.5) / 2;
  return Math.max(6, (radius * 1.15) / Math.sin(Math.min(verticalHalf, horizontalHalf)));
}
