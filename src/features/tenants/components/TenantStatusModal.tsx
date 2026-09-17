import { useState } from 'react';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';

import type {
  SuspensionReason,
  TenantDetail,
  TenantSummary,
  UpdateTenantStatusPayload,
} from '../types/tenant.types';

interface TenantStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantSummary | TenantDetail | null;
  onConfirm: (id: string, payload: UpdateTenantStatusPayload) => Promise<unknown>;
  isSubmitting: boolean;
}

export function TenantStatusModal({
  isOpen,
  onClose,
  tenant,
  onConfirm,
  isSubmitting,
}: TenantStatusModalProps) {
  const t = useTranslations('AdminTenants');
  const isSuspending = tenant?.status === 'ACTIVE';

  const [suspensionReason, setSuspensionReason] =
    useState<SuspensionReason>('PAYMENT_DEFAULT');
  const [activationReason, setActivationReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!tenant) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSuspending) {
      try {
        await onConfirm(tenant.id, {
          status: 'SUSPENDED',
          reason: suspensionReason,
          internalNote: internalNote.trim() || undefined,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
      }
    } else {
      if (activationReason.trim().length < 10) {
        setError(t('activation_reason_min_length'));
        return;
      }
      try {
        await onConfirm(tenant.id, {
          status: 'ACTIVE',
          reason: activationReason.trim(),
          internalNote: internalNote.trim() || undefined,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
      }
    }
  };

  const reasonOptions = [
    { value: 'PAYMENT_DEFAULT', label: t('reason_payment_default') },
    { value: 'CONTRACT_VIOLATION', label: t('reason_contract_violation') },
    { value: 'ADMIN_REQUEST', label: t('reason_admin_request') },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSuspending ? t('suspend_title') : t('activate_title')}
      width="480px"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-sm">
          {isSuspending ? (
            <AlertTriangle className="mt-0.5 shrink-0 text-[var(--sc-warning-dark)]" size={18} />
          ) : (
            <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--sc-success-dark)]" size={18} />
          )}
          <div>
            <div className="font-medium text-[var(--sc-text-primary)]">
              {tenant.name} ({tenant.slug})
            </div>
            <div className="mt-1 text-xs text-[var(--sc-text-secondary)]">
              {isSuspending ? t('suspend_warning_desc') : t('activate_info_desc')}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] p-3 text-xs text-[var(--sc-error-dark)]">
            {error}
          </div>
        )}

        {isSuspending ? (
          <div>
            <label
              htmlFor="suspension-reason-select"
              className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]"
            >
              {t('suspension_reason_label')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Select
              id="suspension-reason-select"
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value as SuspensionReason)}
              options={reasonOptions}
            />
          </div>
        ) : (
          <div>
            <Input
              id="activation-reason-input"
              label={`${t('activation_reason_label')} *`}
              placeholder={t('activation_reason_placeholder')}
              value={activationReason}
              onChange={(e) => setActivationReason(e.target.value)}
              helperText={t('activation_reason_helper')}
              required
            />
          </div>
        )}

        <div>
          <label
            htmlFor="internal-note-textarea"
            className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]"
          >
            {t('internal_note_label')} ({t('optional')})
          </label>
          <textarea
            id="internal-note-textarea"
            rows={3}
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder={t('internal_note_placeholder')}
            className="w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-2.5 text-sm text-[var(--sc-text-primary)] transition-colors focus:border-[var(--sc-primary)] focus:outline-none"
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant={isSuspending ? 'danger' : 'primary'}
            isLoading={isSubmitting}
          >
            {isSuspending ? t('confirm_suspend') : t('confirm_activate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
