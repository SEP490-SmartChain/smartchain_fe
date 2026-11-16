import type { RefObject } from 'react';

import { UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common';

export interface ClaimPhotoUploadProps {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  fileName: string | null;
  onFile: (file: File) => void;
  onRetry?: () => void;
}

export function ClaimPhotoUpload({
  id,
  inputRef,
  busy,
  fileName,
  onFile,
  onRetry,
}: ClaimPhotoUploadProps) {
  const t = useTranslations('Claims');
  return (
    <div
      role="group"
      aria-label={t('addPhoto')}
      className="space-y-3 rounded-xl border-2 border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)] p-5"
    >
      <div className="flex items-start gap-3">
        <UploadCloud
          size={24}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--sc-primary)]"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('addPhoto')}</p>
          <p id={`${id}-hint`} className="mt-1 text-sm text-[var(--sc-text-secondary)]">
            {t('photoUploadHint')}
          </p>
        </div>
      </div>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          aria-controls={id}
          aria-describedby={`${id}-hint`}
          onClick={() => inputRef.current?.click()}
        >
          {t('choosePhoto')}
        </Button>
        {onRetry && (
          <Button type="button" variant="secondary" disabled={busy} onClick={onRetry}>
            {t('retryPhoto')}
          </Button>
        )}
      </div>
      {fileName && (
        <p className="break-all text-sm text-[var(--sc-text-secondary)]">
          {t('selectedPhoto', { name: fileName })}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('photoProcessing')}
        </p>
      )}
    </div>
  );
}
