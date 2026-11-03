import { z } from 'zod';

export const asnScanSchema = z.object({ code: z.string().trim().min(1).max(100) });
/** Submitted Code 128 carton references append -C0001 to the ASN code. */
export function asnCodeFromScan(value: string): string {
  const code = value.trim();
  return code.startsWith('ASN-') ? code.replace(/-C\d{4}$/, '') : code;
}
