/** The system seller freight tariff: freight is the carrier API price when the waybill is created. */
export const CARRIER_API_TARIFF_CODE = 'CARRIER_API';

export function isCarrierApiTariff(code: string): boolean {
  return code === CARRIER_API_TARIFF_CODE;
}

/**
 * Option text for a published freight tariff version. The carrier API tariff has no rate card,
 * so it is described in words instead of by code and version.
 */
export function freightTariffLabel(
  tariff: { code: string; versionNo: number },
  carrierApiLabel: string,
): string {
  return isCarrierApiTariff(tariff.code)
    ? carrierApiLabel
    : `${tariff.code} · v${tariff.versionNo}`;
}
