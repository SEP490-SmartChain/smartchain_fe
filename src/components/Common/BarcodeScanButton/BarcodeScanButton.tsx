import { useEffect, useRef, useState } from 'react';

import { ScanLine } from 'lucide-react';
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
        <ScanLine size={18} aria-hidden="true" />
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
          <p>{t('scanCameraHelp')}</p>
          <video
            ref={preview}
            className="max-h-[55vh] w-full rounded-lg bg-black object-cover"
            autoPlay
            muted
            playsInline
          />
        </>
      )}
    </div>
  );
}
