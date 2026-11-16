import { can, getEffectiveRoles } from '@/lib/accessPolicy';
import { getAuthScopeKey } from '@/lib/authScope';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { packingApi } from '../api/packingApi';
import { handoverAckSchema } from '../schemas/packingSchema';
import { isRejectedOperation } from './fulfillmentRetry';

import type { z } from 'zod';

type SignValues = z.infer<typeof handoverAckSchema>;
type SignCommand = Readonly<SignValues & { operationId: string }>;
interface PendingSign {
  command: SignCommand | null;
  request: AbortController | null;
  completed: boolean;
}

// Names and evidence references remain in page memory only, never browser storage.
const pendingSigns = new Map<string, PendingSign>();
let memoryScope = '';
let subscribed = false;
function authScope(): string {
  const state = useAuthStore.getState();
  return JSON.stringify([state.revision, state.status, getAuthScopeKey(state.user)]);
}
function initializeMemory() {
  const invalidate = () => {
    const next = authScope();
    if (next === memoryScope) return;
    for (const entry of pendingSigns.values()) entry.request?.abort();
    pendingSigns.clear();
    memoryScope = next;
  };
  invalidate();
  if (!subscribed) {
    useAuthStore.subscribe(invalidate);
    subscribed = true;
  }
}

/** Recover uncertain writes across component remounts, not browser reloads. */
export function createHandoverSignRecovery(
  warehouseId: string,
  manifestId: string,
  api: Pick<typeof packingApi, 'sign'> = packingApi,
  requestId: () => string = createUuid,
) {
  initializeMemory();
  const scope = memoryScope;
  const key = JSON.stringify([scope, warehouseId, manifestId]);
  function active() {
    const { user, status } = useAuthStore.getState();
    return (
      authScope() === scope &&
      status === 'authenticated' &&
      user?.tenantId === null &&
      can(getEffectiveRoles(user.roles, user.actorScope), 'warehouse.handover.confirm') &&
      user.warehouseIds?.includes(warehouseId) === true
    );
  }
  function pending(): SignCommand | null {
    return active() ? (pendingSigns.get(key)?.command ?? null) : null;
  }
  return {
    pending,
    async submit(values: SignValues, signal: AbortSignal): Promise<boolean> {
      if (!active() || signal.aborted) return false;
      let entry = pendingSigns.get(key);
      if (entry?.request || entry?.completed) return false;
      if (!entry) {
        entry = { command: null, request: null, completed: false };
        pendingSigns.set(key, entry);
      }
      entry.command ??= Object.freeze({
        ...handoverAckSchema.parse(values),
        operationId: requestId(),
      });
      const controller = new AbortController();
      entry.request = controller;
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const current = () => active() && !controller.signal.aborted;
      try {
        const response = await api.sign(warehouseId, manifestId, entry.command, controller.signal);
        if (!current()) return false;
        if (response.id !== manifestId || response.status !== 'SIGNED') {
          throw new Error('Handover sign outcome is not confirmed.');
        }
        entry.command = null;
        entry.completed = true;
        return true;
      } catch (error: unknown) {
        if (current() && isRejectedOperation(error)) entry.command = null;
        throw error;
      } finally {
        signal.removeEventListener('abort', abort);
        if (entry.request === controller) entry.request = null;
      }
    },
  };
}
