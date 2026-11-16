import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { orderScope } from './orderScope';

import type { ExceptionCommand } from '../api/operationsExceptionApi';

// Investigation text stays in page memory; scope change erases pending text.
const pending = new Map<string, ExceptionCommand>();
let scope: string | null = null;
let subscribed = false;
function synchronizeScope() {
  const current = orderScope();
  if (current !== scope) {
    pending.clear();
    scope = current;
  }
}
function initialize() {
  synchronizeScope();
  if (!subscribed) {
    useAuthStore.subscribe(synchronizeScope);
    subscribed = true;
  }
}
export function pendingExceptionCommand(id: string): ExceptionCommand | undefined {
  initialize();
  return pending.get(id);
}
export function beginExceptionCommand(
  id: string,
  input: Omit<ExceptionCommand, 'operationId'>,
): ExceptionCommand {
  initialize();
  const existing = pending.get(id);
  if (existing) return existing;
  const command = { ...input, operationId: createUuid() };
  pending.set(id, command);
  return command;
}
export function completeExceptionCommand(id: string): void {
  pending.delete(id);
}
