import { useEffect, useRef, useState } from 'react';

import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button, type ButtonProps } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';

export interface BarcodeScanButtonProps {
  label: string;
  disabled?: boolean;
  onScan: (code: string) => void;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  iconOnly?: boolean;
  className?: string;
}

export function BarcodeScanButton({
  label,
  disabled,
  onScan,
  size = 'md',
  variant = 'outline',
  iconOnly = false,
  className,
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={className}
        onClick={() => setOpen(true)}
      >
        <QrCode size={18} aria-hidden="true" />
        {!iconOnly && label}
      </Button>
      {open && (
        <Modal isOpen title={label} onClose={() => setOpen(false)}>
          <BarcodeScanCamera
            onScan={(code) => {
              setOpen(false);
              onScan(code);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function BarcodeScanCamera({ onScan }: { onScan: (code: string) => void }) {
  const t = useTranslations('Receiving');
  const preview = useRef<HTMLVideoElement>(null);
  const onResult = useRef(onScan);
  const [error, setError] = useState(false);
  useEffect(() => {
    onResult.current = onScan;
  }, [onScan]);
  useEffect(() => {
    const video = preview.current;
    if (!video) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    let stream: MediaStream | undefined;
    function releaseCamera() {
      stop?.();
      stream?.getTracks().forEach((track) => track.stop());
    }
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          releaseCamera();
          return;
        }
        const controls = await new BrowserMultiFormatReader().decodeFromStream(
          stream,
          video ?? undefined,
          (result, _error, activeControls) => {
            if (!result || cancelled) return;
            const decoded = result.getText().trim();
            if (!decoded) return;
            cancelled = true;
            activeControls.stop();
            releaseCamera();
            onResult.current(decoded);
          },
        );
        stop = () => controls.stop();
        if (cancelled) releaseCamera();
      } catch {
        releaseCamera();
        if (!cancelled) setError(true);
      }
    }
    void start();
    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, []);
  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="warning">{t('scanCameraUnavailable')}</Alert>
      ) : (
        <>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('scanCameraHelp')}</p>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={preview}
              className="aspect-square max-h-[55vh] w-full object-cover"
              autoPlay
              muted
              playsInline
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="relative aspect-square w-3/5 max-w-[240px] rounded-2xl border border-white/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-2xl border-l-4 border-t-4 border-[var(--sc-primary-light)]" />
                <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-2xl border-r-4 border-t-4 border-[var(--sc-primary-light)]" />
                <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-[var(--sc-primary-light)]" />
                <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-2xl border-b-4 border-r-4 border-[var(--sc-primary-light)]" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
