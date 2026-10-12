export interface Product {
  barcode?: string | null;
  declaredCostVnd?: string | null;
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
  trackLot?: boolean;
  trackExpiry?: boolean;
  shelfLifeDays?: number | null;
  minInboundShelfLifePct?: string;
  minOutboundDays?: number;
  nearExpiryDays?: number;
}

/** Payload `PATCH /v1/catalog/products/:id` — cân nặng gửi theo gram, kích thước theo cm. */
export interface UpdateProductInput {
  barcode?: string | null;
  declaredCostVnd?: string | null;
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

export type CreateProductInput = Omit<UpdateProductInput, 'expectedUpdatedAt'> & { sku: string };
export interface ProductConfigurationInput {
  trackLot: boolean;
  trackExpiry: boolean;
  shelfLifeDays: number | null;
  minInboundShelfLifePct: number;
  minOutboundDays: number;
  nearExpiryDays: number;
  expectedUpdatedAt: string;
}
