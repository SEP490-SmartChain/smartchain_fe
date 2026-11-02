/** A document reference is navigation only, never authority or a business command. */
export function notificationTarget(
  search: string,
  key: 'invoiceId' | 'statementId' | 'orderId',
): string | null {
  if (search.length > 2048) return null;
  const params = new URLSearchParams(search);
  const values = params.getAll(key);
  return values.length === 1 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values[0])
    ? values[0]
    : null;
}
