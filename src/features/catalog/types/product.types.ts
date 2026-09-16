export interface Product {
  id: string;
  sku: string;
  name: string;
  weightG: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  declaredValue: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProductFilters {
  search: string;
  isActive: '' | 'true' | 'false';
}

export interface ProductPage {
  items: Product[];
  pagination: {
    limit: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
}
