import type { ParcelDimensions, Tier } from './schema';

export interface FreightDraftSeedItem {
  readonly productId: string;
  readonly qty: number;
}

/**
 * Data handed off from Quick Freight Lookup (P1) into ManualOrderForm (P2).
 * Never includes `originWarehouseId` as a warehouse assignment on the order payload,
 * and never fabricates fake SKUs when the quick lookup used a manual parcel.
 */
export interface FreightDraftSeed {
  readonly seedId: string;
  readonly scope: string;
  readonly toProvinceCode: string;
  readonly toWardCode: string;
  readonly deliveryTier: Tier;
  readonly items: readonly FreightDraftSeedItem[];
  readonly assumedParcel: ParcelDimensions;
  readonly assumedOriginWarehouseId: string;
  readonly referenceCodVnd: string;
  readonly referenceDeclaredValueVnd: string;
}

export function consumeFreightDraftSeed(
  currentScope: string,
  seed: FreightDraftSeed | null,
  consumedSeedIds: Set<string>,
): FreightDraftSeed | null {
  if (!seed || seed.scope !== currentScope || consumedSeedIds.has(seed.seedId)) {
    return null;
  }
  consumedSeedIds.add(seed.seedId);
  return seed;
}
