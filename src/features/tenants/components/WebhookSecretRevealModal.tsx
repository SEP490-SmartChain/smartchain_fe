import { useState } from 'react';

import { AlertTriangle, Check, Copy, Key } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

export interface WebhookSecretRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  secret: string;
  endpointUrl?: string;
}

export function WebhookSecretRevealModal({
  isOpen,
  onClose,
  secret,
  endpointUrl,
}: WebhookSecretRevealModalProps) {
  const t = useTranslations('Webhooks');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success(t('secretCopied'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('secretModalTitle')} width="600px">
      <div className="space-y-5">
        {/* Caution Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] p-4 text-[var(--sc-warning-dark)]">
          <AlertTriangle className="mt-0.5 shrink-0 text-[var(--sc-warning)]" size={20} />
          <div className="text-sm leading-5">
            <p className="font-semibold">{t('secretModalWarningTitle')}</p>
            <p className="mt-1 text-xs leading-4">{t('secretModalWarningDesc')}</p>
          </div>
        </div>

        {endpointUrl && (
          <div>
            <span className="block text-xs font-medium text-[var(--sc-text-secondary)]">
              {t('endpointUrl')}
            </span>
            <p className="mt-1 truncate font-mono text-sm font-medium text-[var(--sc-text-primary)]">
              {endpointUrl}
            </p>
          </div>
        )}

        {/* Secret Key Display Box - Side by Side layout to prevent text overlap */}
        <div>
          <label
            htmlFor="webhook-secret-input"
            className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {t('signingSecretKey')}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center">
              <div className="pointer-events-none absolute left-3 flex items-center text-[var(--sc-text-tertiary)]">
                <Key size={16} />
              </div>
              <input
                id="webhook-secret-input"
                type="text"
                readOnly
                value={secret}
                className="h-11 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] pl-10 pr-3 font-mono text-xs font-semibold tracking-wide text-[var(--sc-text-primary)] outline-none select-all focus:border-[var(--sc-primary)]"
              />
            </div>
            <Button
              type="button"
              size="md"
              variant={copied ? 'secondary' : 'primary'}
              onClick={handleCopy}
              className="h-11 shrink-0 gap-1.5 px-4 text-xs font-medium"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-[var(--sc-success)]" />
                  {t('copied')}
                </>
              ) : (
                <>
                  <Copy size={16} />
                  {t('copySecret')}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-xs text-[var(--sc-text-secondary)]">
          {t('secretStorageAdvice')}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onClose}>
            {t('savedSecretConfirmation')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
