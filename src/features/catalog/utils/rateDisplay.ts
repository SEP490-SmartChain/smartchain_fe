const KNOWN_ZONES = [
  'NORTH',
  'CENTRAL',
  'SOUTH',
  'CUNG_MIEN',
  'KHAC_MIEN',
  'OTHER',
  'LOCAL',
  'NOI_TINH',
  'LIEN_MIEN_GAN',
  'LIEN_MIEN_XA',
  'DAC_BIET',
] as const;
type KnownZone = (typeof KNOWN_ZONES)[number];

export type JobErrorKey =
  | 'WORKER_FAILED'
  | 'NO_SAMPLE_POINTS'
  | 'CIRCUIT_OPEN'
  | 'PROVIDER_ERROR'
  | 'QUOTE_REJECTED'
  | 'CREDENTIAL_INVALID'
  | 'ADDRESS_INCOMPLETE'
  | 'NO_DELIVERABLE_QUOTES'
  | 'UNKNOWN';

export function formatVnd(value: string | number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value));
}

export function formatDelta(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** Delivery estimates are fractional days from when the quote was collected. */
export function formatDays(days: number): string {
  return days.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

export function formatWeight(grams: number): string {
  return grams >= 1000
    ? `${(grams / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`
    : `${grams} g`;
}

/** The i18n key suffix of a known region code, or null when the code should be shown as-is. */
export function zoneKey(code: string): KnownZone | null {
  return (KNOWN_ZONES as readonly string[]).includes(code) ? (code as KnownZone) : null;
}

/** Collapses the collection error codes to the few messages a business user can act on. */
export function jobErrorKey(code: string | null): JobErrorKey {
  const reason = (code ?? '').split('.').pop() ?? '';
  if (reason === 'WORKER_FAILED' || reason === 'NO_SAMPLE_POINTS' || reason === 'CIRCUIT_OPEN') {
    return reason;
  }
  if (reason === 'PROVIDER_ERROR') return 'PROVIDER_ERROR';
  if (reason.endsWith('_QUOTE_REJECTED') || reason.endsWith('_QUOTE_INVALID_RESPONSE')) {
    return 'QUOTE_REJECTED';
  }
  if (reason.endsWith('_MAPPING_OR_CREDENTIAL_INVALID') || reason === 'SANDBOX_ACCOUNT_REQUIRED') {
    return 'CREDENTIAL_INVALID';
  }
  if (
    reason === 'WARD_DIVISION_REQUIRED' ||
    reason === 'SCENARIO_REFERENCE_INVALID' ||
    reason.endsWith('_WARD_NOT_FOUND')
  ) {
    return 'ADDRESS_INCOMPLETE';
  }
  if (reason === 'NO_DELIVERABLE_QUOTES') {
    return reason;
  }
  return 'UNKNOWN';
}
