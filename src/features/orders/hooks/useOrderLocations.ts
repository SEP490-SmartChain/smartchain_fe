import { useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { ordersApi } from '../api/ordersApi';
import { orderScope } from '../lib/orderScope';

type Location = Awaited<ReturnType<typeof ordersApi.locations>>[number];
export function useOrderLocations(scope: string) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) controller.abort();
    });
    void ordersApi
      .locations(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && orderScope() === scope) setLocations(data);
      })
      .catch(() => {
        if (!controller.signal.aborted && orderScope() === scope) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && orderScope() === scope) setLoading(false);
      });
    return () => {
      unsubscribe();
      controller.abort();
    };
  }, [scope, revision]);
  return { locations, loading, error, retry: () => setRevision((value) => value + 1) };
}
