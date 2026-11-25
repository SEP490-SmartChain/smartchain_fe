import { useEffect, useRef } from 'react';

import { subscribeUiSync, useNotificationStore } from './useNotificationStore';
import { type RealtimeUiSyncPayload, type RealtimeUiSyncResource } from '../../shared';

const DEFAULT_UI_SYNC_DEBOUNCE_MS = 100;

export type RealtimeSyncAreasInput = RealtimeUiSyncResource | readonly RealtimeUiSyncResource[];

export type RealtimeSyncCallback = (uiSync: RealtimeUiSyncPayload) => void | Promise<void>;

export interface UseRealtimeSyncOptions {
  readonly enabled?: boolean;
  readonly debounceMs?: number;
}

export interface SubscribeDebouncedUiSyncOptions {
  readonly syncAreas: RealtimeSyncAreasInput;
  readonly onSync: RealtimeSyncCallback;
  readonly debounceMs?: number;
  readonly setTimeout?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

function normalizeSyncAreasKey(syncAreas: RealtimeSyncAreasInput): string {
  const list = Array.isArray(syncAreas) ? syncAreas : [syncAreas];
  const unique = new Set<string>();
  for (const area of list) {
    if (typeof area === 'string' && area.length > 0) {
      unique.add(area);
    }
  }
  return [...unique].sort().join('\0');
}

function invokeCallbackSafely(
  callback: RealtimeSyncCallback,
  payload: RealtimeUiSyncPayload,
): void {
  try {
    const result = callback(payload);
    if (result !== undefined) {
      void Promise.resolve(result).catch((error: unknown) => {
        console.error('[useRealtimeSync] Async sync callback failed', error);
      });
    }
  } catch (error: unknown) {
    console.error('[useRealtimeSync] Sync callback failed', error);
  }
}

/**
 * Imperatively subscribes to UI-sync events for one or more areas with
 * optional burst debouncing and guaranteed cancellation on dispose.
 */
export function subscribeDebouncedUiSync(options: SubscribeDebouncedUiSyncOptions): () => void {
  const {
    syncAreas,
    onSync,
    debounceMs = DEFAULT_UI_SYNC_DEBOUNCE_MS,
    setTimeout: customSetTimeout,
    clearTimeout: customClearTimeout,
  } = options;

  let disposed = false;
  let cancelTimer: (() => void) | null = null;
  let latestPayload: RealtimeUiSyncPayload | null = null;

  const clearPending = () => {
    if (!cancelTimer) {
      return;
    }
    const cancel = cancelTimer;
    cancelTimer = null;
    cancel();
  };

  const scheduleFlush = (delayMs: number) => {
    clearPending();
    const run = () => {
      cancelTimer = null;
      if (disposed || !latestPayload) {
        return;
      }
      const payload = latestPayload;
      latestPayload = null;
      invokeCallbackSafely(onSync, payload);
    };

    if (customSetTimeout) {
      const handle = customSetTimeout(run, delayMs);
      cancelTimer = () => {
        customClearTimeout?.(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, delayMs);
    cancelTimer = () => {
      globalThis.clearTimeout(handle);
    };
  };

  const unsubscribe = subscribeUiSync(syncAreas, (uiSync) => {
    if (disposed) {
      return;
    }
    if (debounceMs <= 0) {
      invokeCallbackSafely(onSync, uiSync);
      return;
    }
    latestPayload = uiSync;
    scheduleFlush(debounceMs);
  });

  return () => {
    disposed = true;
    latestPayload = null;
    clearPending();
    unsubscribe();
  };
}

/**
 * Subscribes a React screen/component to realtime `ui_sync` broadcasts for a
 * single sync area or an array of sync areas, debouncing bursts and keeping the
 * latest `onSync` callback via ref without resubscribing on re-renders.
 */
export function useRealtimeSync(
  syncAreas: RealtimeSyncAreasInput,
  onSync: RealtimeSyncCallback,
  options: UseRealtimeSyncOptions = {},
): void {
  const { enabled = true, debounceMs = DEFAULT_UI_SYNC_DEBOUNCE_MS } = options;

  const onSyncRef = useRef<RealtimeSyncCallback>(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const areasKey = normalizeSyncAreasKey(syncAreas);

  useEffect(() => {
    if (!enabled || !areasKey) {
      return undefined;
    }

    return subscribeDebouncedUiSync({
      syncAreas: areasKey.split('\0'),
      debounceMs,
      onSync: (uiSync) => onSyncRef.current(uiSync),
    });
  }, [areasKey, debounceMs, enabled]);
}

/**
 * Returns `true` only while the realtime SSE connection is actively connected,
 * allowing screens to skip or stretch fallback polling loops.
 */
export function useIsRealtimeConnected(): boolean {
  return useNotificationStore((state) => state.connectionStatus === 'connected');
}
