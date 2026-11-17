/** Shape returned by `apiClient.lookupBusinessTaxId` (VietQR). */
export interface BusinessTaxLookupResult {
  readonly name: string;
  readonly address: string | null;
}

/**
 * Normalizes the VietQR lookup into the Google onboarding contract
 * (`address` is always a string; empty when the registry omits it).
 */
export function normalizeBusinessTaxLookup(
  result: BusinessTaxLookupResult | null,
): { readonly name: string; readonly address: string } | null {
  if (!result || result.name.trim().length === 0) return null;
  return {
    name: result.name.trim(),
    address: result.address?.trim() ?? '',
  };
}
