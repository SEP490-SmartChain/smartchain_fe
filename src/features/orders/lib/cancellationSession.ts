import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { isRejectedOperation } from './fulfillmentRetry';
import { orderScope } from './orderScope';
import { cancellationReasonSchema } from '../schemas/orderCancellationSchema';

import type { Cancellation, orderCancellationApi } from '../api/orderCancellationApi';

type Command = { operationId: string; expectedVersion: number; reason: string };
type Review = Omit<Command, 'operationId'>;
interface SessionState {
  review: Review | null;
  pending: Command | null;
  cancellation: Cancellation | null;
  busy: boolean;
  checked: boolean;
  errorKey: string;
}

// Free-text reasons exist only in this page's memory, scoped to the current identity.
const pendingCommands = new Map<string, Command>();
let memoryScope: string | null = null;
let subscribed = false;
function initializeMemory() {
  const currentScope = orderScope();
  if (currentScope !== memoryScope) {
    pendingCommands.clear();
    memoryScope = currentScope;
  }
  if (!subscribed) {
    useAuthStore.subscribe(() => {
      const nextScope = orderScope();
      if (nextScope !== memoryScope) {
        pendingCommands.clear();
        memoryScope = nextScope;
      }
    });
    subscribed = true;
  }
}

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code.split('.').at(-1);
    if (
      code &&
      [
        'STALE_VERSION',
        'ALREADY_HANDED_OVER',
        'FORBIDDEN',
        'NOT_FOUND',
        'IDEMPOTENCY_CONFLICT',
      ].includes(code)
    ) {
      return `errors.${code}`;
    }
  }
  return isRejectedOperation(error) ? 'rejectedError' : 'writeError';
}

export function createCancellationSession({
  scope,
  orderId,
  api,
  requestId = createUuid,
  onCompleted,
}: {
  scope: string;
  orderId: string;
  api: typeof orderCancellationApi;
  requestId?: () => string;
  onCompleted?: () => void;
}) {
  initializeMemory();
  const listeners = new Set<() => void>();
  let state: SessionState = {
    review: null,
    pending: scope === memoryScope ? (pendingCommands.get(orderId) ?? null) : null,
    cancellation: null,
    busy: false,
    checked: false,
    errorKey: '',
  };
  let controller: AbortController | null = null;
  let running = false;
  let notified = false;
  const active = () => orderScope() === scope;
  function update(change: Partial<SessionState>) {
    if (!active()) return;
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  }
  function clearPending() {
    if (pendingCommands.get(orderId)?.operationId === state.pending?.operationId) {
      pendingCommands.delete(orderId);
    }
  }
  function current(request: AbortController) {
    return active() && controller === request && !request.signal.aborted;
  }
  function notifyCompletion(cancellation: Cancellation) {
    if (cancellation.status === 'CANCELLED' && !notified) {
      notified = true;
      onCompleted?.();
    }
  }
  async function write(command: Command) {
    if (running || !active()) return;
    running = true;
    const request = new AbortController();
    controller = request;
    pendingCommands.set(orderId, command);
    update({ review: null, pending: command, busy: true, errorKey: '' });
    try {
      const cancellation = await api.cancel(orderId, command, request.signal);
      if (!current(request)) return;
      if (cancellation.status === 'CANCELLED') clearPending();
      update({
        cancellation,
        checked: true,
        pending: cancellation.status === 'CANCELLED' ? null : command,
      });
      notifyCompletion(cancellation);
    } catch (error: unknown) {
      if (!current(request)) return;
      const rejected = isRejectedOperation(error);
      if (rejected) clearPending();
      update({
        pending: rejected ? null : command,
        checked: rejected ? false : state.checked,
        errorKey: errorKey(error),
      });
    } finally {
      if (current(request)) {
        running = false;
        update({ busy: false });
      }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    review(reason: string, expectedVersion: number) {
      const result = cancellationReasonSchema.safeParse({ reason });
      if (
        !active() ||
        running ||
        state.pending ||
        !state.checked ||
        state.cancellation?.status !== 'NOT_REQUESTED' ||
        !result.success
      ) {
        return false;
      }
      update({ review: { reason: result.data.reason, expectedVersion }, errorKey: '' });
      return true;
    },
    dismiss() {
      if (!running) update({ review: null });
    },
    async confirm() {
      if (!state.review || running || state.pending || !active()) return;
      const existing = pendingCommands.get(orderId);
      if (existing) {
        update({ review: null, pending: existing, errorKey: 'writeError' });
        return;
      }
      await write({ operationId: requestId(), ...state.review });
    },
    async retry() {
      if (state.pending) await write(state.pending);
    },
    async check() {
      if (running || !active()) return;
      running = true;
      const request = new AbortController();
      controller = request;
      update({ busy: true, errorKey: '', review: null });
      try {
        const cancellation = await api.cancellation(orderId, request.signal);
        if (!current(request)) return;
        if (cancellation.status === 'CANCELLED') clearPending();
        // NOT_REQUESTED cannot discard a timed-out command that may still be committing.
        update({
          cancellation,
          checked: true,
          pending: cancellation.status === 'CANCELLED' ? null : state.pending,
        });
        notifyCompletion(cancellation);
      } catch (error: unknown) {
        if (current(request)) {
          update({
            checked: false,
            errorKey:
              error instanceof ApiError && [403, 404].includes(error.status)
                ? errorKey(error)
                : 'statusError',
          });
        }
      } finally {
        if (current(request)) {
          running = false;
          update({ busy: false });
        }
      }
    },
    stop() {
      controller?.abort();
      running = false;
    },
  };
}
