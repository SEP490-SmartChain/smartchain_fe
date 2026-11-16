import { useCallback, useEffect, useRef, useState } from 'react';

import {
  assignedWarehouseIds,
  reconcileAssignmentNotices,
  type AssignmentNoticeSnapshot,
} from '@/lib/warehouseAssignmentNotices';
import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

const storageKey = (userId: string) => `orca:warehouse-assignment-notices:v1:${userId}`;

function saveSnapshot(userId: string, snapshot: AssignmentNoticeSnapshot) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    // A blocked/full local store must not prevent access to assigned work.
  }
}

export function useWarehouseAssignmentNotices() {
  const user = useAuthStore((state) => state.user);
  const warehouseIds = assignedWarehouseIds(user);
  const userId = user?.userId ?? '';
  const key = JSON.stringify([userId, warehouseIds]);
  const [snapshot, setSnapshot] = useState<AssignmentNoticeSnapshot & { userId: string }>({
    userId: '',
    warehouseIds: [],
    readIds: [],
  });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const refreshing = useRef(false);
  const eligible =
    user?.actorScope === 'PLATFORM' &&
    user.tenantId === null &&
    user.roles.some((role) =>
      ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'OPS_DISPATCHER'].includes(role),
    );

  useEffect(() => {
    const [owner, ids] = JSON.parse(key) as [string, string[]];
    let stored: unknown;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
    } catch {
      stored = null;
    }
    const next = reconcileAssignmentNotices(ids, stored);
    if (owner) saveSnapshot(owner, next);
    setSnapshot({ userId: owner, ...next });
    setRefreshFailed(false);
  }, [key]);

  const refresh = useCallback(async () => {
    if (!eligible || refreshing.current || document.visibilityState === 'hidden') return;
    refreshing.current = true;
    try {
      await apiClient.currentUser();
      if (useAuthStore.getState().user?.userId === userId) setRefreshFailed(false);
    } catch {
      if (useAuthStore.getState().user?.userId === userId) setRefreshFailed(true);
    } finally {
      refreshing.current = false;
    }
  }, [eligible, userId]);

  useEffect(() => {
    if (!eligible) return;
    const update = () => void refresh();
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [eligible, refresh]);

  const readIds = snapshot.userId === userId ? snapshot.readIds : [];
  const unreadCount = warehouseIds.filter((id) => !readIds.includes(id)).length;
  const markAllRead = () => {
    if (!userId || useAuthStore.getState().user !== user) return;
    const next = { warehouseIds, readIds: warehouseIds };
    saveSnapshot(userId, next);
    setSnapshot({ userId, ...next });
  };
  return { assignedCount: warehouseIds.length, unreadCount, markAllRead, refreshFailed, refresh };
}
