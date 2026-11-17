import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { staffAccountApi } from '../api/staffAccountApi';
import {
  createStaffInvitationSchema,
  type StaffInvitationValues,
} from '../schemas/staffInvitationSchema';

export interface AddStaffAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddStaffAccountModal({ isOpen, onClose, onSuccess }: AddStaffAccountModalProps) {
  const t = useTranslations('StaffAccounts');
  const revision = useAuthStore((state) => state.revision);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StaffInvitationValues>({
    resolver: zodResolver(
      createStaffInvitationSchema({
        nameLength: t('inviteNameLength'),
        emailInvalid: t('inviteEmailInvalid'),
      }),
    ),
    defaultValues: { fullName: '', email: '' },
  });

  useEffect(() => () => controller.current?.abort(), []);

  const close = () => {
    if (!running.current) onClose();
  };
  const submit = handleSubmit(async (values) => {
    if (running.current) return;
    running.current = true;
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    const isCurrent = () => !abort.signal.aborted && revision === useAuthStore.getState().revision;
    try {
      await staffAccountApi.create(values, abort.signal);
      if (!isCurrent()) return;
      toast.success(t('inviteCreated'));
      onSuccess?.();
      onClose();
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : t('inviteFailed'));
    } finally {
      running.current = false;
    }
  });

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('inviteTitle')} width="480px">
      <form noValidate onSubmit={submit} className="space-y-5">
        <p className="m-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
          {t('inviteDescription')}
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset disabled={isSubmitting} className="m-0 space-y-4 border-0 p-0">
          <Input
            label={t('fullName')}
            {...register('fullName')}
            autoComplete="name"
            autoFocus
            isRequired
            maxLength={100}
            leftIcon={<UserRound size={17} aria-hidden="true" />}
            error={errors.fullName?.message}
          />
          <Input
            label={t('workEmail')}
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            isRequired
            leftIcon={<Mail size={17} aria-hidden="true" />}
            error={errors.email?.message}
          />
        </fieldset>
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('assignedRole')}</span>
            <Badge status="neutral" label={t('roleSellerStaff')} />
          </div>
          <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">
            {t('inviteRoleHint')}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('inviteSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
