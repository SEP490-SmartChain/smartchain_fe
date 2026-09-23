import { useState } from 'react';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import type { CarrierCredential } from '../types/carrierCredential.types';

interface CarrierDeleteModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly credential: CarrierCredential | null;
  readonly onDelete: (id: string) => Promise<boolean>;
}

export function CarrierDeleteModal({
  isOpen,
  onClose,
  credential,
  onDelete,
}: CarrierDeleteModalProps) {
  const t = useTranslations('CarrierCredentials');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!credential) return null;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(credential.id);
      toast.success(
        t('delete.success', { carrier: credential.carrier.name, name: credential.name }),
      );
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('delete.error');
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('delete.title')} width="500px">
      <div className="space-y-5 p-6">
        {/* Warning callout */}
        <div className="flex items-start gap-3.5 rounded-xl border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] p-4 text-sm text-[var(--sc-error-dark)]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-error-bg)] text-[var(--sc-error)]">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-base text-[var(--sc-text-primary)]">
              {t('delete.heading', { carrier: credential.carrier.name })}
            </p>
            <p className="text-xs text-[var(--sc-text-secondary)] leading-relaxed">
              {t('delete.selectedConfig')}{' '}
              <span className="font-semibold text-[var(--sc-text-primary)]">{credential.name}</span>
            </p>
          </div>
        </div>

        {/* Data safety reassurance */}
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 text-xs">
          <p className="font-semibold text-[var(--sc-text-primary)] flex items-center gap-1.5">
            <span>🛡️</span> {t('delete.safetyTitle')}
          </p>
          <p className="mt-1.5 text-[var(--sc-text-secondary)] leading-relaxed">
            {t.rich('delete.safetyBody', {
              strong: (chunks) => (
                <strong className="text-[var(--sc-text-primary)]">{chunks}</strong>
              ),
            })}
          </p>
        </div>

        {/* Modal actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4"
          >
            {t('delete.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="px-5 shadow-sm"
          >
            {isDeleting ? t('delete.deleting') : t('delete.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
