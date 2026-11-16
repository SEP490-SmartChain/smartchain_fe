import type { ClaimSource } from '../api/claimsApi';

export function soleClaimSource(
  items: readonly ClaimSource[],
  nextCursor: string | null,
): ClaimSource | undefined {
  if (nextCursor) return undefined;
  const eligible = items.filter((item) => item.remainingQty > 0);
  return eligible.length === 1 ? eligible[0] : undefined;
}
