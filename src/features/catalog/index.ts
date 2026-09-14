/**
 * Public API của feature `catalog`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { ProductCatalogTable } from './components/ProductCatalogTable';
export { useProducts } from './hooks/useProducts';
export type { Product, ProductFilters, ProductPage } from './types/product.types';
