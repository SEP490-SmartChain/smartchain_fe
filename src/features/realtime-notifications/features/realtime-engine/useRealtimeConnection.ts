import { useEffect, useRef } from 'react';

import { useNotificationStore } from './useNotificationStore';
import {
  type InAppNotificationDto,
  type RealtimeClientPort,
  type RealtimeStreamSubscription,
  type RealtimeUiSyncPayload,
  type SseEnvelope,
} from '../../shared';

const DEFAULT_INITIAL_LIST_LIMIT = 30;

export interface RealtimeConnectionCallbacks {
  readonly onNotification?: (
    notification: InAppNotificationDto,
    uiSync?: RealtimeUiSyncPayload,
  ) => void;
  readonly onUiSync?: (uiSync: RealtimeUiSyncPayload) => void;
  readonly onError?: (error: Error) => void;
}

export interface ConnectRealtimeEngineOptions extends RealtimeConnectionCallbacks {
  readonly client: RealtimeClientPort;
  readonly authScopeKey?: string | number;
  readonly initialListLimit?: number;
}

export interface UseRealtimeConnectionOptions extends RealtimeConnectionCallbacks {
  readonly client: RealtimeClientPort | null;
  readonly enabled: boolean;
  readonly authScopeKey: string | number;
  readonly initialListLimit?: number;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' && error.length > 0 ? error : fallbackMessage);
}

/**
 * Imperatively wires a `RealtimeClientPort` into `useNotificationStore`,
 * performing initial list hydration, SSE stream subscription, event handling,
 * notification callback deduplication, and clean teardown.
 */
export function connectRealtimeEngine(options: ConnectRealtimeEngineOptions): () => void {
  const {
    client,
    authScopeKey,
    initialListLimit = DEFAULT_INITIAL_LIST_LIMIT,
    onNotification,
    onUiSync,
    onError,
  } = options;

  let disposed = false;
  let subscription: RealtimeStreamSubscription | null = null;
  const scopeLabel = authScopeKey !== undefined ? String(authScopeKey) : 'default';

  const store = useNotificationStore.getState();
  store.reset();
  store.setConnectionStatus('connecting');

  const handleEnvelope = (envelope: SseEnvelope) => {
    if (disposed) {
      return;
    }
    const currentStore = useNotificationStore.getState();
    switch (envelope.type) {
      case 'connected': {
        currentStore.applyConnected({ unreadCount: envelope.unreadCount });
        break;
      }
      case 'notification': {
        const isDuplicate = currentStore.items.some((item) => item.id === envelope.notification.id);
        currentStore.applyIncomingNotification(envelope.notification, envelope.uiSync);
        if (!isDuplicate) {
          onNotification?.(envelope.notification, envelope.uiSync);
        }
        if (envelope.uiSync) {
          onUiSync?.(envelope.uiSync);
        }
        break;
      }
      case 'ui_sync': {
        currentStore.applyUiSync(envelope.uiSync);
        onUiSync?.(envelope.uiSync);
        break;
      }
      case 'heartbeat': {
        break;
      }
    }
  };

  try {
    subscription = client.openStream({
      onEvent: handleEnvelope,
      onStatusChange: (status) => {
        if (!disposed) {
          useNotificationStore.getState().setConnectionStatus(status);
        }
      },
      onError: (error) => {
        if (!disposed) {
          onError?.(error);
        }
      },
    });
  } catch (error: unknown) {
    if (!disposed) {
      useNotificationStore.getState().setConnectionStatus('disconnected');
      onError?.(toError(error, `Failed to open realtime stream for scope ${scopeLabel}`));
    }
  }

  void client
    .listNotifications({ limit: initialListLimit })
    .then((response) => {
      if (disposed) {
        return;
      }
      useNotificationStore.getState().hydrateInitial({
        items: response.items,
        unreadCount: response.unreadCount,
      });
    })
    .catch((error: unknown) => {
      if (!disposed) {
        onError?.(toError(error, `Failed to hydrate notifications for scope ${scopeLabel}`));
      }
    });

  return () => {
    disposed = true;
    subscription?.close();
    subscription = null;
    useNotificationStore.getState().reset();
  };
}

/**
 * React hook managing the authenticated realtime notification lifecycle.
 * Resets store and reconnects cleanly whenever `authScopeKey` or `client`
 * changes, and tears down on unmount or when `enabled` becomes `false`.
 */
export function useRealtimeConnection(options: UseRealtimeConnectionOptions): void {
  const {
    client,
    enabled,
    authScopeKey,
    initialListLimit = DEFAULT_INITIAL_LIST_LIMIT,
    onNotification,
    onUiSync,
    onError,
  } = options;

  const onNotificationRef = useRef(onNotification);
  const onUiSyncRef = useRef(onUiSync);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onNotificationRef.current = onNotification;
    onUiSyncRef.current = onUiSync;
    onErrorRef.current = onError;
  }, [onNotification, onUiSync, onError]);

  useEffect(() => {
    if (!enabled || !client) {
      useNotificationStore.getState().reset();
      return undefined;
    }

    return connectRealtimeEngine({
      client,
      authScopeKey,
      initialListLimit,
      onNotification: (notification, uiSync) => {
        onNotificationRef.current?.(notification, uiSync);
      },
      onUiSync: (uiSync) => {
        onUiSyncRef.current?.(uiSync);
      },
      onError: (error) => {
        onErrorRef.current?.(error);
      },
    });
  }, [client, enabled, authScopeKey, initialListLimit]);
}
