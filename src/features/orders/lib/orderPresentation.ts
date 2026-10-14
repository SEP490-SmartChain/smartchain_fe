export function formatOrderMoney(value: string): string {
  return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
}
export function formatOrderDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
export function orderStatusTone(value: string): 'error' | 'warning' | 'default' {
  if (['FAILED', 'CANCELLED', 'ALLOCATION_FAILED', 'DISPATCH_FAILED'].includes(value)) {
    return 'error';
  }
  if (
    ['ON_HOLD', 'BACKORDER', 'MANUAL_REVIEW', 'LABEL_VERIFYING', 'RETURN_PENDING'].includes(value)
  ) {
    return 'warning';
  }
  return 'default';
}
