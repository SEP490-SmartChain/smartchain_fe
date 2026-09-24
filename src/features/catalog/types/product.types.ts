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
  updatedAt: string;
}

/** Payload `PATCH /v1/catalog/products/:id` — cân nặng gửi theo gram, kích thước theo cm. */
export interface UpdateProductInput {
  name: string;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  declaredValue: number;
  isActive: boolean;
  expectedUpdatedAt: string;
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
