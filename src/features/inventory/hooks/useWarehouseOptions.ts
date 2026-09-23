import { useEffect, useState } from 'react';

import { warehouseApi, type Warehouse } from '@/features/catalog';

/** Chặn vòng lặp nếu API trả cursor lỗi: 20 trang × 50 kho là đủ cho một tenant. */
const MAX_WAREHOUSE_PAGES = 20;

async function fetchAllWarehouses(): Promise<Warehouse[]> {
  const warehouses: Warehouse[] = [];
  let cursor: string | undefined;
  for (let pageCount = 0; pageCount < MAX_WAREHOUSE_PAGES; pageCount += 1) {
    const page = await warehouseApi.list({ search: '', status: '' }, cursor);
    warehouses.push(...page.items);
    if (!page.pagination.nextCursor) break;
    cursor = page.pagination.nextCursor;
  }
  return warehouses;
}

export function useWarehouseOptions() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
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
