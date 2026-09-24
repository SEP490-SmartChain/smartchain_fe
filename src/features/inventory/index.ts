/**
 * Public API của feature `inventory`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { StockLevelsPanel } from './components/StockLevelsPanel';
export { ActiveReservationsPanel } from './components/ActiveReservationsPanel';
export type {
  ActiveReservation,
  ReleaseReservationsResult,
  ReservationSummary,
} from './types/inventoryReservation.types';
export type {
  InventoryStockFilters,
  InventoryStockLevel,
  InventoryStockSummary,
} from './types/inventoryStock.types';
