import type { RelocationInput, RelocationPosition } from '../api/relocationApi';

export type RelocationBin = { id: string; code: string };
type Confirmation = Pick<RelocationInput, 'fromBinScan' | 'toBinScan' | 'skuScan' | 'lotScan'>;

/** Manual mode requires an explicit physical check; knowing a stock row is not confirmation. */
export function manualRelocationConfirmation(
  source: RelocationPosition,
  destination: RelocationBin | null,
  confirmed: boolean,
): Confirmation {
  if (!confirmed || !destination || destination.id === source.fromBinId) {
    return { fromBinScan: '', toBinScan: '', skuScan: '', lotScan: '' };
  }
  return {
    fromBinScan: source.fromBinCode,
    toBinScan: destination.code,
    skuScan: source.sku,
    lotScan: source.lotCode,
  };
}
