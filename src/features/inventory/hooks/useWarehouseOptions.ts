import { useEffect, useState } from 'react';

import {
  listInventoryWarehouses,
  type InventoryWarehouseOption,
} from '../api/inventoryWarehouseApi';

/** Chặn vòng lặp nếu API trả cursor lỗi: 20 trang × 50 kho là đủ cho một tenant. */
const MAX_WAREHOUSE_PAGES = 20;

async function fetchAllWarehouses(): Promise<InventoryWarehouseOption[]> {
  const warehouses: InventoryWarehouseOption[] = [];
  let cursor: string | undefined;
  for (let pageCount = 0; pageCount < MAX_WAREHOUSE_PAGES; pageCount += 1) {
    const page = await listInventoryWarehouses(cursor);
    warehouses.push(...page.items);
    if (!page.pagination.nextCursor) break;
    cursor = page.pagination.nextCursor;
  }
  return warehouses;
}

export function useWarehouseOptions() {
  const [warehouses, setWarehouses] = useState<InventoryWarehouseOption[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchAllWarehouses()
      .then((result) => {
        if (!isCancelled) setWarehouses(result);
      })
      .catch((failure: unknown) => {
        if (!isCancelled) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  return { warehouses, error };
}
