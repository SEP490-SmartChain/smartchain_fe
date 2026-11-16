import { z } from 'zod';

export type FulfillmentPendingOperation = 'pick' | 'pack' | 'manifest';

export interface FulfillmentPendingScope {
  actorId: string;
  warehouseId: string;
  operation: FulfillmentPendingOperation;
  resourceId: string;
}

interface FulfillmentPendingEnvelope {
  version: 1;
  scope: FulfillmentPendingScope;
  command: unknown;
}

export interface FulfillmentSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const envelopeSchema = z
  .object({
    version: z.literal(1),
    scope: z
      .object({
        actorId: z.string().min(1),
        warehouseId: z.string().min(1),
        operation: z.enum(['pick', 'pack', 'manifest']),
        resourceId: z.string().min(1),
      })
      .strict(),
    command: z.unknown(),
  })
  .strict();

function storageKey(scope: FulfillmentPendingScope): string {
  return [
    'orca.fulfillment.pending.v1',
    scope.actorId,
    scope.warehouseId,
    scope.operation,
    scope.resourceId,
  ]
    .map(encodeURIComponent)
    .join('.');
}

function sameScope(left: FulfillmentPendingScope, right: FulfillmentPendingScope): boolean {
  return (
    left.actorId === right.actorId &&
    left.warehouseId === right.warehouseId &&
    left.operation === right.operation &&
    left.resourceId === right.resourceId
  );
}

function defaultStorage(): FulfillmentSessionStorage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function commandReference(value: unknown): string | null {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return null;
  const command = parsed.data;
  if (typeof command['operationId'] === 'string') return command['operationId'];
  const payload = command['payload'];
  const parsedPayload = z.record(z.string(), z.unknown()).safeParse(payload);
  if (!parsedPayload.success) return null;
  const clientScanId = parsedPayload.data['clientScanId'];
  return typeof clientScanId === 'string' ? clientScanId : null;
}

export function persistFulfillmentPending<T>(
  scope: FulfillmentPendingScope,
  command: T,
  storage: FulfillmentSessionStorage | null = defaultStorage(),
): void {
  if (!storage) throw new Error('Fulfillment recovery storage is unavailable.');
  const serialized = JSON.stringify({
    version: 1,
    scope,
    command,
  } satisfies FulfillmentPendingEnvelope);
  if (serialized.length > 32_768) throw new Error('Fulfillment recovery command is too large.');
  const key = storageKey(scope);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) {
    throw new Error('Fulfillment recovery command could not be verified.');
  }
}

export function loadFulfillmentPending<T>(
  scope: FulfillmentPendingScope,
  commandSchema: z.ZodType<T>,
  storage: FulfillmentSessionStorage | null = defaultStorage(),
): T | null {
  if (!storage) return null;
  const key = storageKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 32_768) return null;
    const parsed: unknown = JSON.parse(raw);
    const envelope = envelopeSchema.safeParse(parsed);
    if (!envelope.success || !sameScope(scope, envelope.data.scope)) {
      storage.removeItem(key);
      return null;
    }
    const command = commandSchema.safeParse(envelope.data.command);
    if (!command.success) {
      storage.removeItem(key);
      return null;
    }
    return command.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // The corrupt command remains unreadable, so it is never replayed.
    }
    return null;
  }
}

export function clearFulfillmentPending<T>(
  scope: FulfillmentPendingScope,
  command: T,
  storage: FulfillmentSessionStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  const key = storageKey(scope);
  const current = loadFulfillmentPending(scope, z.unknown(), storage);
  if (commandReference(current) === commandReference(command)) storage.removeItem(key);
}
