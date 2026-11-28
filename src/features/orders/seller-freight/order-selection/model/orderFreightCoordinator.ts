import { FreightApiError } from '../../lookup/api/freightEstimateApi';
import type {
  OrderFreightClient,
  OrderFreightRow,
  OrderLookupItem,
  ParcelFreight,
} from '../../shared';

export const ORDER_STATUS_CHUNK_SIZE = 100;
export const ORDER_LOOKUP_CHUNK_SIZE = 5;
export const ORDER_LOOKUP_MAX_IN_FLIGHT = 2;

export interface OrderFreightBatchProgress {
  readonly running: boolean;
  readonly totalOrders: number;
  readonly completedOrders: number;
  readonly failedOrderIds: readonly string[];
  readonly rateLimitedRetrySeconds: number | null;
}

export interface OrderFreightStoreState {
  readonly scope: string;
  readonly rowsByOrderId: Readonly<Record<string, OrderFreightRow>>;
  readonly pendingOrderIds: ReadonlySet<string>;
  readonly statusLoading: boolean;
  readonly lookupProgress: OrderFreightBatchProgress;
}

function parcelKey(fulfillmentOrderId: string | null): string {
  return fulfillmentOrderId ?? '__UNALLOCATED__';
}

function isProtectedDbState(freight: ParcelFreight): boolean {
  return (
    freight.state === 'RECORDED' ||
    freight.state === 'RECORDED_FEE_MISSING' ||
    freight.state === 'BOOKING_PENDING' ||
    freight.state === 'NOT_APPLICABLE'
  );
}

function isEstimateUnexpired(
  freight: Extract<ParcelFreight, { state: 'ESTIMATED' }>,
  nowMs: number,
): boolean {
  const expiresAt = Date.parse(freight.refreshAfter);
  return Number.isFinite(expiresAt) && nowMs < expiresAt;
}

function computeSubtotal(
  parcels: readonly { fulfillmentOrderId: string | null; freight: ParcelFreight }[],
  state: 'RECORDED' | 'ESTIMATED',
): { count: number; subtotalVnd: string | null } {
  let count = 0;
  let total = BigInt(0);
  for (const parcel of parcels) {
    if (parcel.freight.state === state) {
      count += 1;
      total += BigInt(parcel.freight.amountVnd);
    }
  }
  return { count, subtotalVnd: count > 0 ? total.toString() : null };
}

/**
 * Merges a newly fetched `status` row with cached session state:
 * - DB RECORDED / RECORDED_FEE_MISSING / BOOKING_PENDING / NOT_APPLICABLE ALWAYS wins.
 * - An unexpired ESTIMATED parcel is retained ONLY if `sourceRevision` still matches AND DB says `NOT_QUOTED` / `NEEDS_INPUT`.
 */
export function mergeStatusRow(
  existing: OrderFreightRow | undefined,
  incoming: OrderFreightRow,
  nowMs = Date.now(),
): OrderFreightRow {
  if (incoming.state === 'NOT_FOUND') {
    return incoming;
  }
  if (
    !existing ||
    existing.state !== 'VISIBLE' ||
    existing.sourceRevision !== incoming.sourceRevision ||
    existing.orderVersion !== incoming.orderVersion
  ) {
    return incoming;
  }

  const existingByParcel = new Map(
    existing.parcels.map((p) => [parcelKey(p.fulfillmentOrderId), p.freight]),
  );

  const mergedParcels = incoming.parcels.map((parcel) => {
    if (parcel.freight.state === 'NOT_QUOTED' || parcel.freight.state === 'NEEDS_INPUT') {
      const prev = existingByParcel.get(parcelKey(parcel.fulfillmentOrderId));
      if (prev?.state === 'ESTIMATED' && isEstimateUnexpired(prev, nowMs)) {
        return { fulfillmentOrderId: parcel.fulfillmentOrderId, freight: prev };
      }
    }
    return parcel;
  });

  return {
    ...incoming,
    parcels: mergedParcels,
    recorded: computeSubtotal(mergedParcels, 'RECORDED'),
    estimated: computeSubtotal(mergedParcels, 'ESTIMATED'),
  };
}

/**
 * Merges a newly completed `lookup` row with cached state (monotonic rule A10 + Finding #8):
 * - If a concurrent `status` refresh ALREADY wrote RECORDED / BOOKING_PENDING / RECORDED_FEE_MISSING
 *   at equal or newer `orderVersion`, never downgrade back to late `ESTIMATED`.
 * - If `sourceRevision` changed on `existing` (even with unchanged parent `orderVersion`),
 *   reject a stale late `lookup` response whose `sourceRevision` was superseded or precedes `existing`.
 */
export function mergeLookupRow(
  existing: OrderFreightRow | undefined,
  incoming: OrderFreightRow,
  options?: {
    readonly supersededRevisions?: ReadonlySet<string>;
    readonly statusUpdatedSinceStart?: boolean;
  },
): OrderFreightRow {
  if (incoming.state === 'NOT_FOUND') {
    return incoming;
  }
  if (!existing || existing.state !== 'VISIBLE') {
    return incoming;
  }
  if (incoming.orderVersion < existing.orderVersion) {
    return existing;
  }
  if (incoming.orderVersion > existing.orderVersion) {
    return incoming;
  }
  if (existing.sourceRevision !== incoming.sourceRevision) {
    if (options?.supersededRevisions?.has(incoming.sourceRevision)) {
      return existing;
    }
    if (options?.statusUpdatedSinceStart) {
      return existing;
    }
    const incomingMs = Date.parse(incoming.asOf);
    const existingMs = Date.parse(existing.asOf);
    if (Number.isFinite(incomingMs) && Number.isFinite(existingMs) && incomingMs <= existingMs) {
      return existing;
    }
  }

  const existingByParcel = new Map(
    existing.parcels.map((p) => [parcelKey(p.fulfillmentOrderId), p.freight]),
  );

  const mergedParcels = incoming.parcels.map((parcel) => {
    const prev = existingByParcel.get(parcelKey(parcel.fulfillmentOrderId));
    if (
      prev &&
      isProtectedDbState(prev) &&
      (parcel.freight.state === 'ESTIMATED' ||
        parcel.freight.state === 'NOT_QUOTED' ||
        parcel.freight.state === 'UNAVAILABLE')
    ) {
      return { fulfillmentOrderId: parcel.fulfillmentOrderId, freight: prev };
    }
    return parcel;
  });

  return {
    ...incoming,
    parcels: mergedParcels,
    recorded: computeSubtotal(mergedParcels, 'RECORDED'),
    estimated: computeSubtotal(mergedParcels, 'ESTIMATED'),
  };
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function createInitialOrderFreightState(scope: string): OrderFreightStoreState {
  return {
    scope,
    rowsByOrderId: {},
    pendingOrderIds: new Set(),
    statusLoading: false,
    lookupProgress: {
      running: false,
      totalOrders: 0,
      completedOrders: 0,
      failedOrderIds: [],
      rateLimitedRetrySeconds: null,
    },
  };
}

export class OrderFreightCoordinator {
  private state: OrderFreightStoreState;
  private statusAbort: AbortController | null = null;
  private lookupAbort: AbortController | null = null;
  private statusSeq = 0;
  private lookupSeq = 0;
  private statusAppliedEpoch = 0;
  private readonly supersededRevisionsByOrderId = new Map<string, Set<string>>();
  private readonly listeners = new Set<(state: OrderFreightStoreState) => void>();

  constructor(
    private readonly client: Pick<OrderFreightClient, 'orderStatus' | 'orderLookup'>,
    scope: string,
    private readonly waitMs: (ms: number, signal: AbortSignal) => Promise<void> = (ms, signal) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('Aborted'));
          return;
        }
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          },
          { once: true },
        );
      }),
  ) {
    this.state = createInitialOrderFreightState(scope);
  }

  getState(): OrderFreightStoreState {
    return this.state;
  }

  subscribe(listener: (state: OrderFreightStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  resetScope(nextScope: string): void {
    if (this.state.scope === nextScope) return;
    this.cancelInFlight();
    this.statusAppliedEpoch = 0;
    this.supersededRevisionsByOrderId.clear();
    this.state = createInitialOrderFreightState(nextScope);
    this.emit();
  }

  cancelInFlight(): void {
    this.statusAbort?.abort();
    this.statusAbort = null;
    this.lookupAbort?.abort();
    this.lookupAbort = null;
    if (this.state.statusLoading || this.state.lookupProgress.running) {
      this.state = {
        ...this.state,
        statusLoading: false,
        pendingOrderIds: new Set(),
        lookupProgress: {
          ...this.state.lookupProgress,
          running: false,
        },
      };
      this.emit();
    }
  }

  async refreshStatus(orderIds: readonly string[], nowMs = Date.now()): Promise<void> {
    const uniqueIds = [...new Set(orderIds.filter((id) => id.trim().length > 0))];
    if (uniqueIds.length === 0) return;

    const scopeAtStart = this.state.scope;
    const seq = ++this.statusSeq;
    this.statusAbort?.abort();
    const abort = new AbortController();
    this.statusAbort = abort;

    this.state = { ...this.state, statusLoading: true };
    this.emit();

    const chunks = chunkArray(uniqueIds, ORDER_STATUS_CHUNK_SIZE);
    try {
      for (const chunk of chunks) {
        if (abort.signal.aborted || this.state.scope !== scopeAtStart || this.statusSeq !== seq) {
          return;
        }
        const rows = await this.client.orderStatus(chunk, abort.signal);
        if (abort.signal.aborted || this.state.scope !== scopeAtStart || this.statusSeq !== seq) {
          return;
        }
        const nextMap = { ...this.state.rowsByOrderId };
        for (const row of rows) {
          const prev = nextMap[row.orderId];
          const merged = mergeStatusRow(prev, row, nowMs);
          this.recordRevisionTransition(row.orderId, prev, merged);
          nextMap[row.orderId] = merged;
        }
        this.statusAppliedEpoch += 1;
        this.state = { ...this.state, rowsByOrderId: nextMap };
        this.emit();
      }
    } catch {
      // Fail closed silently on background status refresh abort or transient failure, retaining prior rows.
    } finally {
      if (this.state.scope === scopeAtStart && this.statusSeq === seq) {
        this.state = { ...this.state, statusLoading: false };
        this.emit();
      }
    }
  }

  async lookupOrders(items: readonly OrderLookupItem[]): Promise<void> {
    const deduped = new Map<string, OrderLookupItem>();
    for (const item of items) {
      if (!deduped.has(item.orderId)) {
        deduped.set(item.orderId, item);
      }
    }
    const uniqueItems = [...deduped.values()];
    if (uniqueItems.length === 0) return;

    const scopeAtStart = this.state.scope;
    const seq = ++this.lookupSeq;
    this.lookupAbort?.abort();
    const abort = new AbortController();
    this.lookupAbort = abort;

    const pending = new Set(uniqueItems.map((i) => i.orderId));
    const failed = new Set<string>();
    let completedOrders = 0;

    this.state = {
      ...this.state,
      pendingOrderIds: pending,
      lookupProgress: {
        running: true,
        totalOrders: uniqueItems.length,
        completedOrders: 0,
        failedOrderIds: [],
        rateLimitedRetrySeconds: null,
      },
    };
    this.emit();

    const chunks = chunkArray(uniqueItems, ORDER_LOOKUP_CHUNK_SIZE);
    let nextChunkIndex = 0;

    const runChunk = async (chunk: readonly OrderLookupItem[]): Promise<void> => {
      let remaining: readonly OrderLookupItem[] = chunk;
      let rateLimitRetries = 0;

      while (remaining.length > 0) {
        const statusEpochAtCallStart = this.statusAppliedEpoch;
        try {
          const rows = await this.client.orderLookup(remaining, abort.signal);
          if (abort.signal.aborted || this.state.scope !== scopeAtStart || this.lookupSeq !== seq) {
            return;
          }

          const nextMap = { ...this.state.rowsByOrderId };
          const rowById = new Map<string, OrderFreightRow>();
          for (const row of rows) {
            const prev = nextMap[row.orderId];
            const merged = mergeLookupRow(prev, row, {
              supersededRevisions: this.supersededRevisionsByOrderId.get(row.orderId),
              statusUpdatedSinceStart: this.statusAppliedEpoch !== statusEpochAtCallStart,
            });
            this.recordRevisionTransition(row.orderId, prev, merged);
            nextMap[row.orderId] = merged;
            rowById.set(row.orderId, merged);
          }

          const deferredItems = remaining.filter((item) => {
            const merged = rowById.get(item.orderId);
            return (
              merged?.state === 'VISIBLE' &&
              merged.parcels.some((parcel) => parcel.freight.state === 'NOT_QUOTED')
            );
          });
          const hasPartialDeferral =
            deferredItems.length > 0 && deferredItems.length < remaining.length;
          const deferredIds = new Set(
            hasPartialDeferral ? deferredItems.map((item) => item.orderId) : [],
          );

          const nextPending = new Set(this.state.pendingOrderIds);
          let newlyCompleted = 0;
          for (const item of remaining) {
            if (!deferredIds.has(item.orderId)) {
              nextPending.delete(item.orderId);
              newlyCompleted += 1;
            }
          }
          completedOrders += newlyCompleted;
          this.state = {
            ...this.state,
            rowsByOrderId: nextMap,
            pendingOrderIds: nextPending,
            lookupProgress: {
              ...this.state.lookupProgress,
              completedOrders,
              rateLimitedRetrySeconds: null,
            },
          };
          this.emit();

          if (hasPartialDeferral) {
            remaining = deferredItems;
            rateLimitRetries = 0;
            continue;
          }
          return;
        } catch (error) {
          if (abort.signal.aborted || this.state.scope !== scopeAtStart || this.lookupSeq !== seq) {
            return;
          }
          const isRateLimit =
            error instanceof FreightApiError
              ? error.status === 429
              : Boolean(
                  error &&
                  typeof error === 'object' &&
                  (error as { status?: unknown }).status === 429,
                );
          if (isRateLimit && rateLimitRetries < 1) {
            rateLimitRetries += 1;
            const rawRetry =
              error instanceof FreightApiError
                ? error.retryAfterSeconds
                : (error as { retryAfterSeconds?: number }).retryAfterSeconds;
            const retrySec =
              typeof rawRetry === 'number' && Number.isFinite(rawRetry) && rawRetry > 0
                ? Math.min(Math.ceil(rawRetry), 65)
                : 2;
            this.state = {
              ...this.state,
              lookupProgress: {
                ...this.state.lookupProgress,
                rateLimitedRetrySeconds: retrySec,
              },
            };
            this.emit();
            try {
              await this.waitMs(retrySec * 1000, abort.signal);
              continue;
            } catch {
              return;
            }
          }

          const nextPending = new Set(this.state.pendingOrderIds);
          for (const item of remaining) {
            failed.add(item.orderId);
            nextPending.delete(item.orderId);
          }
          completedOrders += remaining.length;
          this.state = {
            ...this.state,
            pendingOrderIds: nextPending,
            lookupProgress: {
              ...this.state.lookupProgress,
              completedOrders,
              failedOrderIds: [...failed],
            },
          };
          this.emit();
          return;
        }
      }
    };

    const workerCount = Math.min(ORDER_LOOKUP_MAX_IN_FLIGHT, chunks.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextChunkIndex < chunks.length) {
          const chunk = chunks[nextChunkIndex];
          nextChunkIndex += 1;
          if (!chunk || abort.signal.aborted) break;
          await runChunk(chunk);
        }
      }),
    );

    if (this.state.scope === scopeAtStart && this.lookupSeq === seq) {
      this.state = {
        ...this.state,
        pendingOrderIds: new Set(),
        lookupProgress: {
          ...this.state.lookupProgress,
          running: false,
        },
      };
      this.emit();
    }
  }

  private recordRevisionTransition(
    orderId: string,
    prev: OrderFreightRow | undefined,
    next: OrderFreightRow,
  ): void {
    if (
      prev?.state === 'VISIBLE' &&
      next.state === 'VISIBLE' &&
      prev.sourceRevision !== next.sourceRevision
    ) {
      let superseded = this.supersededRevisionsByOrderId.get(orderId);
      if (!superseded) {
        superseded = new Set();
        this.supersededRevisionsByOrderId.set(orderId, superseded);
      }
      superseded.add(prev.sourceRevision);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
