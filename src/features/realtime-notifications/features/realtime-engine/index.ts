import {
  FetchSseClient,
  computeReconnectDelayMs,
  createFetchSseStream,
  type CreateFetchSseStreamOptions,
  type FetchLike,
  type FetchSseClientConfig,
  type SseTimerHandle,
} from './fetchSseClient';
import {
  createSseEnvelopeParser,
  createSseFrameParser,
  parseSseEnvelope,
  parseSseLines,
  type SseFrame,
  type SseFrameParser,
} from './sseParser';
import {
  subscribeUiSync,
  useNotificationStore,
  type NotificationConnectedInput,
  type NotificationHydrateInput,
  type NotificationStoreState,
  type UiSyncAreasInput,
  type UiSyncListener,
} from './useNotificationStore';
import {
  connectRealtimeEngine,
  useRealtimeConnection,
  type ConnectRealtimeEngineOptions,
  type RealtimeConnectionCallbacks,
  type UseRealtimeConnectionOptions,
} from './useRealtimeConnection';
import {
  subscribeDebouncedUiSync,
  useIsRealtimeConnected,
  useRealtimeSync,
  type RealtimeSyncAreasInput,
  type RealtimeSyncCallback,
  type SubscribeDebouncedUiSyncOptions,
  type UseRealtimeSyncOptions,
} from './useRealtimeSync';

export const C07_STORES = [useNotificationStore] as const;

export const C07_HOOKS = [useRealtimeConnection, useRealtimeSync, useIsRealtimeConnected] as const;

export {
  FetchSseClient,
  computeReconnectDelayMs,
  connectRealtimeEngine,
  createFetchSseStream,
  createSseEnvelopeParser,
  createSseFrameParser,
  parseSseEnvelope,
  parseSseLines,
  subscribeDebouncedUiSync,
  subscribeUiSync,
  useIsRealtimeConnected,
  useNotificationStore,
  useRealtimeConnection,
  useRealtimeSync,
};

export type {
  ConnectRealtimeEngineOptions,
  CreateFetchSseStreamOptions,
  FetchLike,
  FetchSseClientConfig,
  NotificationConnectedInput,
  NotificationHydrateInput,
  NotificationStoreState,
  RealtimeConnectionCallbacks,
  RealtimeSyncAreasInput,
  RealtimeSyncCallback,
  SseFrame,
  SseFrameParser,
  SseTimerHandle,
  SubscribeDebouncedUiSyncOptions,
  UiSyncAreasInput,
  UiSyncListener,
  UseRealtimeConnectionOptions,
  UseRealtimeSyncOptions,
};
