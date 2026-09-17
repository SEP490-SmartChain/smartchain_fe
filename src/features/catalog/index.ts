/**
 * Public API của feature `catalog`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { GlobalCarrierCatalog } from './components/GlobalCarrierCatalog';
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

export { CarrierConnectionsManager } from './components/CarrierConnectionsManager';
export { CarrierCredentialCard } from './components/CarrierCredentialCard';
export { CarrierCredentialModal } from './components/CarrierCredentialModal';
export { CarrierDeleteModal } from './components/CarrierDeleteModal';

export { useCarrierCredentials } from './hooks/useCarrierCredentials';
export { carrierCredentialApi } from './api/carrierCredentialApi';

export type {
  CarrierCredential,
  CarrierCredentialFilters,
  CarrierCredentialStatus,
  CarrierSummary as CarrierCredentialCarrierSummary,
  CreateCarrierCredentialInput,
  DeploymentEnvironment,
  PingTestResult,
  UpdateCarrierCredentialInput,
} from './types/carrierCredential.types';
export { ProductCatalogTable } from './components/ProductCatalogTable';
export { useProducts } from './hooks/useProducts';
export type { Product, ProductFilters, ProductPage } from './types/product.types';
