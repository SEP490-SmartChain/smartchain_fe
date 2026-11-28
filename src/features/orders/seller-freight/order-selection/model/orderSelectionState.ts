import type { OrderFreightRow, OrderLookupItem, ParcelDimensions } from '../../shared';

export interface AssumptionModalParcelTarget {
  readonly key: string;
  readonly orderId: string;
  readonly fulfillmentOrderId: string | null;
  readonly parcelNumber: number;
  readonly totalParcelsForOrder: number;
  readonly requiresOrigin: boolean;
}

export function assumptionParcelKey(orderId: string, fulfillmentOrderId: string | null): string {
  return `${orderId}::${fulfillmentOrderId ?? '__UNALLOCATED__'}`;
}

export function buildAssumptionModalTargets(
  targetOrderIds: readonly string[],
  rowsByOrderId: Readonly<Record<string, OrderFreightRow>>,
): readonly AssumptionModalParcelTarget[] {
  const targets: AssumptionModalParcelTarget[] = [];
  for (const orderId of targetOrderIds) {
    const existing = rowsByOrderId[orderId];
    if (existing?.state === 'VISIBLE') {
      const needsInputEntries = existing.parcels
        .map((parcel, idx) => ({ parcel, parcelNumber: idx + 1 }))
        .filter(({ parcel }) => parcel.freight.state === 'NEEDS_INPUT');
      for (const entry of needsInputEntries) {
        targets.push({
          key: assumptionParcelKey(orderId, entry.parcel.fulfillmentOrderId),
          orderId,
          fulfillmentOrderId: entry.parcel.fulfillmentOrderId,
          parcelNumber: entry.parcelNumber,
          totalParcelsForOrder: existing.parcels.length,
          requiresOrigin: entry.parcel.fulfillmentOrderId === null,
        });
      }
    } else {
      targets.push({
        key: assumptionParcelKey(orderId, null),
        orderId,
        fulfillmentOrderId: null,
        parcelNumber: 1,
        totalParcelsForOrder: 1,
        requiresOrigin: true,
      });
    }
  }
  return targets;
}

export function createInitialAssumptionParcels(
  targets: readonly AssumptionModalParcelTarget[],
  defaultParcel: ParcelDimensions,
  existing?: Readonly<Record<string, ParcelDimensions>>,
): Record<string, ParcelDimensions> {
  const next: Record<string, ParcelDimensions> = {};
  for (const target of targets) {
    const prev = existing?.[target.key];
    next[target.key] = prev ? { ...prev } : { ...defaultParcel, itemCount: 1 };
  }
  return next;
}

export function buildLookupItemsFromAssumptions(params: {
  readonly targetOrderIds: readonly string[];
  readonly rowsByOrderId: Readonly<Record<string, OrderFreightRow>>;
  readonly parcelsByKey: Readonly<Record<string, ParcelDimensions>>;
  readonly selectedOriginId: string;
  readonly defaultParcel: ParcelDimensions;
}): OrderLookupItem[] {
  const { targetOrderIds, rowsByOrderId, parcelsByKey, selectedOriginId, defaultParcel } = params;
  return targetOrderIds.map((orderId) => {
    const existing = rowsByOrderId[orderId];
    if (existing?.state === 'VISIBLE') {
      const assumptions = existing.parcels
        .filter((p) => p.freight.state === 'NEEDS_INPUT')
        .map((p) => {
          const parcel = parcelsByKey[assumptionParcelKey(orderId, p.fulfillmentOrderId)] ?? {
            ...defaultParcel,
            itemCount: 1,
          };
          return {
            fulfillmentOrderId: p.fulfillmentOrderId,
            ...(p.fulfillmentOrderId === null && selectedOriginId
              ? { originWarehouseId: selectedOriginId }
              : {}),
            parcel,
          };
        });
      return { orderId, assumptions };
    }
    const fallbackParcel = parcelsByKey[assumptionParcelKey(orderId, null)] ?? {
      ...defaultParcel,
      itemCount: 1,
    };
    return {
      orderId,
      assumptions: [
        {
          fulfillmentOrderId: null,
          ...(selectedOriginId ? { originWarehouseId: selectedOriginId } : {}),
          parcel: fallbackParcel,
        },
      ],
    };
  });
}

export function toggleOrderSelection(current: ReadonlySet<string>, orderId: string): Set<string> {
  const next = new Set(current);
  if (next.has(orderId)) {
    next.delete(orderId);
  } else {
    next.add(orderId);
  }
  return next;
}

export function toggleVisibleOrderSelection(
  current: ReadonlySet<string>,
  visibleOrderIds: readonly string[],
): Set<string> {
  if (visibleOrderIds.length === 0) {
    return new Set(current);
  }
  const allSelected = visibleOrderIds.every((id) => current.has(id));
  const next = new Set(current);
  if (allSelected) {
    for (const id of visibleOrderIds) {
      next.delete(id);
    }
  } else {
    for (const id of visibleOrderIds) {
      next.add(id);
    }
  }
  return next;
}

export function retainOrderSelection(
  current: ReadonlySet<string>,
  visibleOrderIds: readonly string[],
): Set<string> {
  const visible = new Set(visibleOrderIds);
  const next = new Set<string>();
  for (const id of current) {
    if (visible.has(id)) {
      next.add(id);
    }
  }
  return next;
}
