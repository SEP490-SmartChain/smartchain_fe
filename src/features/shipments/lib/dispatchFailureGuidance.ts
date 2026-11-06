export type DispatchFailureGuidanceKey =
  | 'verifyBooking'
  | 'retryLabel'
  | 'checkAddress'
  | 'checkMeasurements'
  | 'checkCarrierSetup'
  | 'checkTariff'
  | 'review';

const GUIDANCE_BY_FAILURE: Readonly<Record<string, DispatchFailureGuidanceKey>> = {
  'DISPATCH.CARRIER_OUTCOME_UNCERTAIN': 'verifyBooking',
  'DISPATCH.CARRIER_REFERENCE_EXISTS': 'verifyBooking',
  'DISPATCH.LOOKUP_UNRESOLVED': 'verifyBooking',
  'DISPATCH.LABEL_UNAVAILABLE': 'retryLabel',
  'DISPATCH.DEPENDENCY_FAILURE': 'retryLabel',
  'DISPATCH.INVALID_ADDRESS_MAPPING': 'checkAddress',
  'DISPATCH.ADDRESS_MAPPING_REQUIRED': 'checkAddress',
  'DISPATCH.INVALID_PACKED_MEASUREMENTS': 'checkMeasurements',
  'DISPATCH.SERVICE_MAPPING_REQUIRED': 'checkCarrierSetup',
  'DISPATCH.INVALID_SERVICE_MAPPING': 'checkCarrierSetup',
  'DISPATCH.NO_EFFECTIVE_FREIGHT': 'checkTariff',
  'DISPATCH.DEFAULT_CARRIER_REQUIRED': 'checkTariff',
};

export function getDispatchFailureGuidance(code: string | null): DispatchFailureGuidanceKey | null {
  if (!code) return null;
  return GUIDANCE_BY_FAILURE[code] ?? 'review';
}
