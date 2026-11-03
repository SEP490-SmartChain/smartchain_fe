import { useTranslations } from 'next-intl';

import { SecretRevealModal } from '@/components/Common';

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

  return (
    <SecretRevealModal
      isOpen={isOpen}
      onClose={onClose}
      secret={secret}
      inputId="webhook-secret-input"
      labels={{
        title: t('secretModalTitle'),
        warningTitle: t('secretModalWarningTitle'),
        warningDescription: t('secretModalWarningDesc'),
        secretLabel: t('signingSecretKey'),
        copy: t('copySecret'),
        copied: t('copied'),
        copySucceeded: t('secretCopied'),
        copyFailed: t('copyFailed'),
        storageAdvice: t('secretStorageAdvice'),
        confirm: t('savedSecretConfirmation'),
      }}
      details={
        endpointUrl && (
          <div>
            <span className="block text-xs font-medium text-[var(--sc-text-secondary)]">
              {t('endpointUrl')}
            </span>
            <p className="mt-1 truncate font-mono text-sm font-medium text-[var(--sc-text-primary)]">
              {endpointUrl}
            </p>
          </div>
        )
      }
    />
  );
}
