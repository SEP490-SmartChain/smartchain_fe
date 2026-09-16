/**
 * Public API của feature `catalog`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { GlobalCarrierCatalog } from './components/GlobalCarrierCatalog';
export { useCarrierCatalog } from './hooks/useCarrierCatalog';
export type {
  CarrierSummary,
  CarrierDetail,
  CarrierEndpoint,
  CarrierService,
  CarrierListQuery,
  CarrierListPage,
} from './types/carrierCatalog.types';
