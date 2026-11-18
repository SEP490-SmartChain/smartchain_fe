import { BarcodeScanButton } from '@/components/Common';

export function InboundScanButton({
  label,
  disabled,
  onScan,
}: {
  label: string;
  disabled?: boolean;
  onScan: (code: string) => void;
}) {
  return <BarcodeScanButton label={label} disabled={disabled} onScan={onScan} />;
}
