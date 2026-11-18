export type PickScanField = 'binScan' | 'skuScan' | 'lotScan';

export interface ParsedPickQrPayload {
  bin?: string;
  sku?: string;
  lot?: string;
}

const CONTROL_CHARS_RE = /[\r\n\t\u200B-\u200D\uFEFF]/g;

/** Trims whitespace and removes stray scanner control characters (CR/LF/BOM). */
export function normalizeScannedCode(raw: string): string {
  return raw.replace(CONTROL_CHARS_RE, '').trim();
}

/**
 * Parses an optional combined QR payload (`JSON` or `ORCA-PICK:bin|sku|lot`).
 * Returns `null` for plain single-value barcodes/QRs (bin code, bin UUID, SKU, EAN, lot).
 */
export function parsePickQrPayload(raw: string): ParsedPickQrPayload | null {
  const cleaned = normalizeScannedCode(raw);
  if (!cleaned) return null;

  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const record = parsed as Record<string, unknown>;
      const bin = readOptionalString(record.bin ?? record.binCode ?? record.binScan);
      const sku = readOptionalString(record.sku ?? record.productBarcode ?? record.skuScan);
      const lot = readOptionalString(record.lot ?? record.lotCode ?? record.lotScan);
      if (!bin && !sku && !lot) return null;
      return {
        ...(bin ? { bin } : {}),
        ...(sku ? { sku } : {}),
        ...(lot ? { lot } : {}),
      };
    } catch {
      return null;
    }
  }

  if (cleaned.startsWith('ORCA-PICK:')) {
    const parts = cleaned.slice('ORCA-PICK:'.length).split('|');
    const bin = readOptionalString(parts[0]);
    const sku = readOptionalString(parts[1]);
    const lot = readOptionalString(parts[2]);
    if (!bin && !sku && !lot) return null;
    return {
      ...(bin ? { bin } : {}),
      ...(sku ? { sku } : {}),
      ...(lot ? { lot } : {}),
    };
  }

  return null;
}

/** Advances focus smoothly during camera or handheld USB barcode scanning. */
export function getNextPickScanField(current: PickScanField): 'skuScan' | 'lotScan' | 'qty' {
  if (current === 'binScan') return 'skuScan';
  if (current === 'skuScan') return 'lotScan';
  return 'qty';
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = normalizeScannedCode(value);
  return trimmed.length > 0 ? trimmed : undefined;
}
