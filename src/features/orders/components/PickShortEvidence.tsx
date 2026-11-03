import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';

import { downloadPickEvidence, uploadPickEvidence } from '../api/pickEvidenceApi';

export function PickShortEvidence({
  warehouseId,
  lineId,
  disabled,
  evidenceKey,
  onVerified,
  onBusyChange,
}: {
  warehouseId: string;
  lineId: string;
  disabled: boolean;
  evidenceKey?: string;
  onVerified?: (key: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations('Picking');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [verified, setVerified] = useState(false),
    [preview, setPreview] = useState('');
  const abort = useRef(new AbortController()),
    sequence = useRef(0),
    running = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => {
      controller.abort();
    };
  }, []);
  async function upload(file: File) {
    if (running.current || disabled) return;
    running.current = true;
    const current = ++sequence.current;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setVerified(false);
    onVerified?.('');
    try {
      const key = await uploadPickEvidence(warehouseId, lineId, file, abort.current.signal);
      if (current !== sequence.current || abort.current.signal.aborted) return;
      onVerified?.(key);
      setVerified(true);
    } catch {
      if (!abort.current.signal.aborted) setError(t('evidenceUploadError'));
    } finally {
      if (current === sequence.current && !abort.current.signal.aborted) {
        running.current = false;
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  async function view() {
    if (!evidenceKey || running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const url = await downloadPickEvidence(
        warehouseId,
        lineId,
        evidenceKey,
        abort.current.signal,
      );
      if (!abort.current.signal.aborted) setPreview(url);
    } catch {
      if (!abort.current.signal.aborted) setError(t('evidenceReadError'));
    } finally {
      if (!abort.current.signal.aborted) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="space-y-2 sm:col-span-2">
      {onVerified ? (
        <>
          <Input
            type="file"
            label={t('evidenceImage')}
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('evidenceHelp')}</p>
          {busy && <p role="status">{t('evidenceUploading')}</p>}
          {(verified || evidenceKey) && <p role="status">{t('evidenceVerified')}</p>}
        </>
      ) : (
        <Button variant="outline" disabled={disabled || busy} onClick={() => void view()}>
          {t('evidenceView')}
        </Button>
      )}
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}
      {preview && (
        <a href={preview} target="_blank" rel="noreferrer">
          {t('evidenceOpen')}
        </a>
      )}
    </div>
  );
}
