import { ApiError } from '@/services/apiClient';

import type { ImportResult } from '../api/ordersApi';

export function importRowFeedback(
  row: ImportResult['items'][number],
  t: (key: string, values?: Record<string, string>) => string,
): string {
  if (row.issues?.length) {
    return row.issues
      .map((issue) => {
        const field = t(`fields.${issue.field}`);
        return t(`import_issues.${issue.reason}`, {
          field,
          amount: issue.amount ? BigInt(issue.amount).toLocaleString('vi-VN') : '',
          maximum: issue.maximum ? BigInt(issue.maximum).toLocaleString('vi-VN') : '',
        });
      })
      .join(' ');
  }
  return t(orderErrorKey(row.code));
}

const KNOWN_ERRORS: Record<string, string> = {
  'ORDERS.INVALID_DECLARED_VALUE': 'invalid_declared_value',
  'ORDERS.SHEET_SETUP_UNAVAILABLE': 'sheet_setup_unavailable',
  'ORDERS.SHEET_SETUP_IN_PROGRESS': 'sheet_setup_in_progress',
  'ORDERS.SHEET_SETUP_NOT_CONFIRMED': 'sheet_setup_not_confirmed',
  'ORDERS.INVALID_PAYMENT_BREAKDOWN': 'invalid_payment_breakdown',
  'ORDERS.INVALID_PRODUCT': 'invalid_product',
  'ORDERS.INVALID_ADDRESS': 'invalid_address',
  'ORDERS.INVALID_WORKBOOK': 'invalid_workbook',
  'ORDERS.EMPTY_WORKBOOK': 'empty_workbook',
  'ORDERS.INVALID_CELL': 'invalid_cell',
  'ORDERS.INVALID_IMPORT_ROW': 'invalid_row',
  'VALIDATION.INVALID_REQUEST': 'invalid_row',
  'ORDERS.IDEMPOTENCY_CONFLICT': 'conflict',
  'ORDERS.DUPLICATE_EXTERNAL_CODE': 'duplicate_code',
  'ORDERS.SELLER_NOT_ACTIVE': 'service_inactive',
  'ORDERS.PAYMENT_REQUIRED': 'payment_required',
  'AUTH.FORBIDDEN': 'forbidden',
  'ORDERS.INVALID_DATE_RANGE': 'date_range',
  'ORDERS.INVALID_CURSOR': 'cursor',
  'VALIDATION.PAYLOAD_TOO_LARGE': 'invalid_workbook',
};
export function orderErrorKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : typeof error === 'string' ? error : '';
  return KNOWN_ERRORS[code] ? `errors.${KNOWN_ERRORS[code]}` : 'response_error';
}
export function orderReasonKey(code: string | null): string {
  return code &&
    [
      'VALIDATION_FAILED',
      'CANCEL_PENDING',
      'ADDRESS_NORMALIZED',
      'RESERVATION_RENEWAL_REQUIRED',
      'ALLOCATION_QUEUE_FAILED',
      'ELIGIBLE_STOCK_RESERVED',
      'CONFIRM_HOLD',
      'HOLD_RISKY_COD',
      'ALL_CHILD_STATUS_ROLLUP',
    ].includes(code)
    ? `reasons.${code}`
    : 'processing_reason';
}

export function orderHistoryReasonKey(code: string | null): string | null {
  const key = orderReasonKey(code);
  return key === 'processing_reason' ? null : key;
}
