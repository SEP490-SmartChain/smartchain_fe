import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { inventoryStockApi } from '../api/inventoryStockApi';

import type { RunningLowItem } from '../types/inventoryStock.types';
export function useRunningLow() {
  const user = useAuthStore((s) => s.user),
    revision = useAuthStore((s) => s.revision),
    token = useAuthStore((s) => s.accessToken);
  const key = JSON.stringify([user, revision, token]);
  const [state, setState] = useState<{
    key: string;
    items: RunningLowItem[];
    error: Error | null;
    loading: boolean;
  }>({ key: '', items: [], error: null, loading: true });
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ key, items: [], error: null, loading: true });
    try {
      const items = await inventoryStockApi.getRunningLow(controller.signal);
      if (!controller.signal.aborted && user === useAuthStore.getState().user) {
        setState({ key, items, error: null, loading: false });
      }
    } catch (failure) {
      if (!controller.signal.aborted && user === useAuthStore.getState().user) {
        setState({
          key,
          items: [],
          error: failure instanceof Error ? failure : new Error(String(failure)),
          loading: false,
        });
      }
    }
  }, [key, user]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  const visible = state.key === key;
  return {
    items: visible ? state.items : [],
    error: visible ? state.error : null,
    isLoading: !visible || state.loading,
    refetch: load,
  };
}
