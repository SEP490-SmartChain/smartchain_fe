import { useEffect, useRef, useState } from 'react';

import { ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

export function InboundScanButton({
  label,
  disabled,
  onScan,
}: {
  label: string;
  disabled?: boolean;
  onScan: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <ScanLine size={18} aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <Modal isOpen title={label} onClose={() => setOpen(false)}>
          <ScanCamera
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

function ScanCamera({ onScan }: { onScan: (code: string) => void }) {
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
          video: { facingMode: { ideal: 'environment' } },
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
            cancelled = true;
            activeControls.stop();
            releaseCamera();
            onResult.current(result.getText());
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
            className="max-h-[55vh] w-full rounded-lg"
            autoPlay
            muted
            playsInline
          />
        </>
      )}
    </div>
  );
}
