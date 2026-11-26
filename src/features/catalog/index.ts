/**
 * Public API của feature `catalog`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { GlobalCarrierCatalog } from './components/GlobalCarrierCatalog';
export { CarrierAccountManager } from './components/CarrierAccountManager';
export { CarrierWebhookManager } from './components/CarrierWebhookManager';
export { CarrierPriceBoard } from './components/CarrierPriceBoard';
export { CarrierAutoSelection } from './components/CarrierAutoSelection';
export { RateProposalPanel } from './components/RateProposalPanel';
export { useProvinceNames } from './hooks/useProvinceNames';
export { useCarrierCatalog } from './hooks/useCarrierCatalog';
export type {
  CarrierSummary as GlobalCarrierSummary,
  CarrierSummary,
  CarrierDetail,
  CarrierEndpoint,
  CarrierService,
  CarrierListQuery,
  CarrierListPage,
} from './types/carrierCatalog.types';

export { ProductCatalogTable } from './components/ProductCatalogTable';
export { useProducts } from './hooks/useProducts';
export type { Product, ProductFilters, ProductPage } from './types/product.types';
export { warehouseApi } from './api/warehouseApi';
export { adminDivisionApi, type AdminDivision } from './api/adminDivisionApi';
export type { Warehouse, WarehouseFilters } from './types/warehouse';

export { WarehouseDirectory } from './components/WarehouseDirectory';
export { WarehouseStorageSetup } from './components/WarehouseStorageSetup';
export { binBarcode as encodeCode128 } from './lib/binBarcode';
export { binBarcode as encodeLabelBarcode } from './lib/binBarcode';
