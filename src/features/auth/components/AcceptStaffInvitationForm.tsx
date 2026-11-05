import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { ApiError } from '@/services/apiClient';

import { acceptStaffInvitation, readInvitationToken } from '../api/staffInvitationApi';
import {
  getResetPasswordSchema,
  type ResetPasswordFormData,
} from '../schemas/resetPassword.schema';

export function AcceptStaffInvitationForm() {
  const t = useTranslations();
  const [token] = useState(() => readInvitationToken(window.location.search));
  const [invalid, setInvalid] = useState(!token);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(getResetPasswordSchema(t)),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  useEffect(() => {
    // Keep the email's one-time token in memory, out of subsequent URLs/referrers.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    return () => controller.current?.abort();
  }, []);
  const submit = handleSubmit(async (values) => {
    if (!token || running.current) return;
    running.current = true;
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await acceptStaffInvitation(token, values.newPassword, abort.signal);
      if (!abort.signal.aborted) {
        reset();
        setConfirmed(true);
      }
    } catch (failure) {
      if (abort.signal.aborted) return;
      if (failure instanceof ApiError && failure.code === 'IAM.INVITATION_INVALID') {
        setInvalid(true);
      } else setError(failure instanceof Error ? failure.message : t('Auth.inviteFailed'));
    } finally {
      running.current = false;
    }
  });
  if (invalid || confirmed) {
    return (
      <div className="space-y-5">
        <Alert variant={confirmed ? 'success' : 'error'}>
          {t(confirmed ? 'Auth.inviteSuccess' : 'Auth.inviteInvalid')}
        </Alert>
        <Link to="/login" className="text-sm font-medium text-[var(--sc-primary)] hover:underline">
          {t('Auth.back_to_login')}
        </Link>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}
      <Input
        label={t('Auth.new_password_label')}
        type="password"
        autoComplete="new-password"
        isRequired
        disabled={isSubmitting}
        {...register('newPassword')}
        error={errors.newPassword?.message}
        helperText={t('Auth.invitePasswordHint')}
      />
      <Input
        label={t('Auth.confirm_password_label')}
        type="password"
        autoComplete="new-password"
        isRequired
        disabled={isSubmitting}
        {...register('confirmPassword')}
        error={errors.confirmPassword?.message}
      />
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {t('Auth.inviteSubmit')}
      </Button>
    </form>
  );
}
