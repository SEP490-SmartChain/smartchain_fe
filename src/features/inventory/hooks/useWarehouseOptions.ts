import { useCallback, useEffect, useState } from 'react';

import {
  listInventoryWarehouses,
  type InventoryWarehouseOption,
} from '../api/inventoryWarehouseApi';

/** Chặn vòng lặp nếu API trả cursor lỗi: 20 trang × 50 kho là đủ cho một tenant. */
const MAX_WAREHOUSE_PAGES = 20;

async function fetchAllWarehouses(signal: AbortSignal): Promise<InventoryWarehouseOption[]> {
  const warehouses: InventoryWarehouseOption[] = [];
  let cursor: string | undefined;
  for (let pageCount = 0; pageCount < MAX_WAREHOUSE_PAGES; pageCount += 1) {
    const page = await listInventoryWarehouses(cursor, signal);
    warehouses.push(...page.items);
    if (!page.pagination.nextCursor) break;
    cursor = page.pagination.nextCursor;
  }
  return warehouses;
}

export function useWarehouseOptions(enabled = true) {
  const [warehouses, setWarehouses] = useState<InventoryWarehouseOption[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const refetch = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let isCancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setWarehouses([]);
    fetchAllWarehouses(controller.signal)
      .then((result) => {
        if (!isCancelled) setWarehouses(result);
      })
      .catch((failure: unknown) => {
        if (!isCancelled) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [attempt, enabled]);

  return { warehouses, error, isLoading, refetch };
}
