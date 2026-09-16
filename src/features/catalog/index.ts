/**
 * Public API của feature `catalog`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
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
  CarrierSummary,
  CreateCarrierCredentialInput,
  DeploymentEnvironment,
  PingTestResult,
  UpdateCarrierCredentialInput,
} from './types/carrierCredential.types';
export { ProductCatalogTable } from './components/ProductCatalogTable';
export { useProducts } from './hooks/useProducts';
export type { Product, ProductFilters, ProductPage } from './types/product.types';
