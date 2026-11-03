export type SettlementCarrierCode = 'GHN' | 'GHTK' | 'VIETTEL_POST';

export interface SettlementBatch {
  id: string;
  carrierCode: string;
  fileName: string;
  /** PROCESSING until the Accountant completes and locks it (COMPLETED). */
  status: string;
  totalRows: number;
  processedRows: number;
  matchedRows: number;
  exceptionRows: number;
  createdAt: string;
  completedAt: string | null;
}

export interface SettlementRecord {
  rowNumber: number;
  trackingNumber: string;
  matchStatus: string;
  discrepancies: string[];
  /** Exact VND decimal strings; never converted to floating point. */
  expectedFeeVnd: string;
  actualFeeVnd: string;
  expectedCodVnd: string;
  collectedCodVnd: string | null;
  remittedCodVnd: string | null;
}

export interface SettlementPage<T> {
  items: T[];
  pagination: { limit: number; hasNext: boolean; nextCursor: string | null };
}

export interface SettlementCompletion {
  batchId: string;
  postedCount: number;
  skippedAlreadyCredited: number;
  creditedVnd: string;
}
