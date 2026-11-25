import { create } from 'zustand';

import {
  type InAppNotificationDto,
  type RealtimeConnectionStatus,
  type RealtimeUiSyncPayload,
  type RealtimeUiSyncResource,
} from '../../shared';

export type UiSyncAreasInput = RealtimeUiSyncResource | readonly RealtimeUiSyncResource[];
export type UiSyncListener = (uiSync: RealtimeUiSyncPayload) => void;

export interface NotificationHydrateInput {
  readonly items: readonly InAppNotificationDto[];
  readonly unreadCount: number;
}

export interface NotificationConnectedInput {
  readonly unreadCount: number;
}

export interface NotificationStoreState {
  readonly items: InAppNotificationDto[];
  readonly unreadCount: number;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly lastUiSyncByArea: Record<string, RealtimeUiSyncPayload>;
  readonly hydrated: boolean;
  hydrateInitial: (input: NotificationHydrateInput) => void;
  applyConnected: (input: NotificationConnectedInput) => void;
  applyIncomingNotification: (
    notification: InAppNotificationDto,
    uiSync?: RealtimeUiSyncPayload,
  ) => void;
  applyUiSync: (uiSync: RealtimeUiSyncPayload) => void;
  subscribeUiSync: (areas: UiSyncAreasInput, listener: UiSyncListener) => () => void;
  markReadLocal: (id: string, readAt: string, unreadCount?: number) => void;
  markAllReadLocal: (readAt?: string) => void;
  setConnectionStatus: (status: RealtimeConnectionStatus) => void;
  reset: () => void;
}

interface RegisteredUiSyncListener {
  readonly areas: ReadonlySet<string>;
  readonly listener: UiSyncListener;
}

const uiSyncRegistry = new Set<RegisteredUiSyncListener>();

function normalizeAreaSet(areas: UiSyncAreasInput): ReadonlySet<string> {
  const list = Array.isArray(areas) ? areas : [areas];
  const result = new Set<string>();
  for (const area of list) {
    if (typeof area === 'string' && area.length > 0) {
      result.add(area);
    }
  }
  return result;
}

function doesUiSyncMatch(areas: ReadonlySet<string>, uiSync: RealtimeUiSyncPayload): boolean {
  if (areas.size === 0) {
    return false;
  }
  if (areas.has('*') || areas.has(uiSync.topic) || areas.has(uiSync.resourceType)) {
    return true;
  }
  for (const area of uiSync.syncAreas) {
    if (areas.has(area)) {
      return true;
    }
  }
  return false;
}

function notifyUiSyncListeners(uiSync: RealtimeUiSyncPayload): void {
  const snapshot = [...uiSyncRegistry];
  for (const entry of snapshot) {
    if (!uiSyncRegistry.has(entry)) {
      continue;
    }
    if (!doesUiSyncMatch(entry.areas, uiSync)) {
      continue;
    }
    try {
      entry.listener(uiSync);
    } catch (error: unknown) {
      console.error('[useNotificationStore] UI sync listener error', error);
    }
  }
}

function compareCreatedAtDesc(a: InAppNotificationDto, b: InAppNotificationDto): number {
  const timeA = Date.parse(a.createdAt);
  const timeB = Date.parse(b.createdAt);
  if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.createdAt !== b.createdAt) {
    return b.createdAt.localeCompare(a.createdAt);
  }
  return 0;
}

/**
 * Registers an imperative UI-sync listener outside React render cycles.
 */
export function subscribeUiSync(areas: UiSyncAreasInput, listener: UiSyncListener): () => void {
  const entry: RegisteredUiSyncListener = {
    areas: normalizeAreaSet(areas),
    listener,
  };
  uiSyncRegistry.add(entry);
  return () => {
    uiSyncRegistry.delete(entry);
  };
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  items: [],
  unreadCount: 0,
  connectionStatus: 'idle',
  lastUiSyncByArea: {},
  hydrated: false,

  hydrateInitial: ({ items: serverItems, unreadCount }) => {
    set((state) => {
      const mergedById = new Map<string, InAppNotificationDto>();
      const serverIds = new Set<string>();

      for (const existing of state.items) {
        mergedById.set(existing.id, existing);
      }

      for (const incoming of serverItems) {
        serverIds.add(incoming.id);
        const existing = mergedById.get(incoming.id);
        if (!existing) {
          mergedById.set(incoming.id, incoming);
          continue;
        }
        // Preserve local read transitions if an item was already marked read in memory.
        const isRead = existing.isRead || incoming.isRead;
        mergedById.set(incoming.id, {
          ...incoming,
          isRead,
          readAt: existing.readAt ?? incoming.readAt,
        });
      }

      const sorted = [...mergedById.values()].sort(compareCreatedAtDesc);
      const extraLiveUnread = !state.hydrated
        ? state.items.filter((item) => !item.isRead && !serverIds.has(item.id)).length
        : 0;

      return {
        items: sorted,
        unreadCount: Math.max(0, unreadCount + extraLiveUnread),
        hydrated: true,
      };
    });
  },

  applyConnected: ({ unreadCount }) => {
    set({
      unreadCount: Math.max(0, unreadCount),
      connectionStatus: 'connected',
    });
  },

  applyIncomingNotification: (notification, uiSync) => {
    set((state) => {
      const exists = state.items.some((item) => item.id === notification.id);
      if (exists) {
        return state;
      }
      return {
        items: [notification, ...state.items],
        unreadCount: notification.isRead ? state.unreadCount : state.unreadCount + 1,
      };
    });

    if (uiSync) {
      get().applyUiSync(uiSync);
    }
  },

  applyUiSync: (uiSync) => {
    set((state) => {
      const next: Record<string, RealtimeUiSyncPayload> = { ...state.lastUiSyncByArea };
      for (const area of uiSync.syncAreas) {
        if (area) {
          next[area] = uiSync;
        }
      }
      if (uiSync.topic) {
        next[uiSync.topic] = uiSync;
      }
      if (uiSync.resourceType) {
        next[uiSync.resourceType] = uiSync;
      }
      return { lastUiSyncByArea: next };
    });

    notifyUiSyncListeners(uiSync);
  },

  subscribeUiSync: (areas, listener) => subscribeUiSync(areas, listener),

  markReadLocal: (id, readAt, unreadCount) => {
    set((state) => {
      let wasUnread = false;
      const nextItems = state.items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        if (!item.isRead) {
          wasUnread = true;
          return { ...item, isRead: true, readAt };
        }
        return item;
      });

      const nextUnreadCount =
        typeof unreadCount === 'number' && Number.isFinite(unreadCount)
          ? Math.max(0, unreadCount)
          : wasUnread
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount;

      return {
        items: nextItems,
        unreadCount: nextUnreadCount,
      };
    });
  },

  markAllReadLocal: (readAt) => {
    const effectiveReadAt = readAt ?? new Date().toISOString();
    set((state) => ({
      items: state.items.map((item) =>
        item.isRead ? item : { ...item, isRead: true, readAt: item.readAt ?? effectiveReadAt },
      ),
      unreadCount: 0,
    }));
  },

  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },

  reset: () => {
    set({
      items: [],
      unreadCount: 0,
      connectionStatus: 'idle',
      lastUiSyncByArea: {},
      hydrated: false,
    });
  },
}));
