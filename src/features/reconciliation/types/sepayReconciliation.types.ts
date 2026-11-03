export interface UnmatchedSepayTransfer {
  id: string;
  environment: string;
  externalRef: string;
  /** Exact VND decimal string; never converted to floating point. */
  amountVnd: string;
  content: string | null;
  code: string | null;
  gateway: string | null;
  transactionDate: string | null;
  receivedAt: string;
}

export interface UnmatchedSepayPage {
  items: UnmatchedSepayTransfer[];
  pagination: { limit: number; hasNext: boolean; nextCursor: string | null };
}

export interface SepayManualMatchResult {
  receiptId: string;
  tenantId: string;
  invoiceId: string;
  amountVnd: string;
  unallocatedVnd: string;
}
