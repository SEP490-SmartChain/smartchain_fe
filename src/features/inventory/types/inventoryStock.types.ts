import type { ApiPaginationMeta } from '@/services/apiClient';

/** Một dòng `GET /v1/inventory/stocks` — tồn của một SKU tại một kho. */
export interface InventoryStockLevel {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  /** Tổng tồn vật lý = khả dụng + đang giữ. */
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  lastSyncedAt: string;
}

export interface InventoryStockFilters {
  search: string;
  /** Chuỗi rỗng = tất cả kho. */
  warehouseId: string;
}

export interface InventoryStockPage {
  items: InventoryStockLevel[];
  pagination: ApiPaginationMeta;
}

export interface InventoryStockSummary {
  totalSkus: number;
  availableUnits: number;
}
