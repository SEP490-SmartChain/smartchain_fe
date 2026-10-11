export type AsnStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ARRIVED'
  | 'RECEIVING'
  | 'DISCREPANCY'
  | 'READY_FOR_PUTAWAY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface AsnLine {
  id: string;
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  declaredQty: number;
  receivedQty: number;
  acceptedQty: number;
  quarantinedQty: number;
  rejectedQty: number;
  declaredLotCode: string | null;
  declaredExpiryOn: string | null;
}

export interface Asn {
  id: string;
  tenantId: string;
  warehouseId: string;
  asnCode: string;
  externalReference: string | null;
  status: AsnStatus;
  expectedArrivalAt: string | null;
  arrivedAt: string | null;
  submittedAt: string | null;
  cartonLabelRefs: string[];
  cartonCount: number;
  cancellationReason: string | null;
  cancelledAt: string | null;
  receiptIds: string[];
  discrepancyIds: string[];
  createdByUserId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lines: AsnLine[];
}

export interface AsnPage {
  items: Asn[];
  pagination: { limit: number; hasNext: boolean; nextCursor: string | null };
}

export interface CreateAsnInput {
  operationKey: string;
  cartonCount: number;
  warehouseId: string;
  externalReference?: string;
  expectedArrivalAt?: string;
  lines: Array<{
    productId: string;
    declaredQty: number;
    declaredLotCode?: string;
    declaredExpiryOn?: string;
  }>;
}

export type UpdateAsnInput = Omit<
  Partial<CreateAsnInput>,
  'warehouseId' | 'operationKey' | 'expectedArrivalAt'
> & { version: number; expectedArrivalAt?: string | null };

export interface AsnSkuOption {
  id: string;
  sku: string;
  name: string;
  trackLot: boolean;
  trackExpiry: boolean;
}
