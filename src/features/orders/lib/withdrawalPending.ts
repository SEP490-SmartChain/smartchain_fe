import { useAuthStore } from '@/stores/authStore';

import { withdrawalCommandSchema } from '../schemas/withdrawalSchema';

import type { z } from 'zod';

type Command = z.infer<typeof withdrawalCommandSchema>;
function key() {
  const user = useAuthStore.getState().user;
  if (user?.actorScope !== 'TENANT' || !user.tenantId) return null;
  return `orca:withdrawal-pending:v1:${user.userId}:${user.tenantId}`;
}

/** Only IDs, quantity and address version; never store tokens or recipient data. */
export function readPendingWithdrawal(): Command | null {
  try {
    const scope = key();
    const raw = scope ? sessionStorage.getItem(scope) : null;
    return raw ? withdrawalCommandSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Persist before sending, so an unknown result survives a reload in this tab. */
export function persistPendingWithdrawal(input: Command) {
  const scope = key();
  if (!scope) throw new Error('Withdrawal identity is unavailable.');
  const value = JSON.stringify(withdrawalCommandSchema.parse(input));
  const raw = sessionStorage.getItem(scope);
  if (raw && JSON.stringify(withdrawalCommandSchema.parse(JSON.parse(raw))) !== value) {
    throw new Error('Resolve the existing withdrawal before starting another.');
  }
  sessionStorage.setItem(scope, value);
  if (sessionStorage.getItem(scope) !== value) {
    throw new Error('Withdrawal recovery storage is unavailable.');
  }
}

export function clearPendingWithdrawal(clientRequestId: string) {
  try {
    const scope = key();
    if (scope && readPendingWithdrawal()?.clientRequestId === clientRequestId) {
      sessionStorage.removeItem(scope);
    }
  } catch {
    // Keeping a resolved reference is safe: replay returns the original order.
  }
}
