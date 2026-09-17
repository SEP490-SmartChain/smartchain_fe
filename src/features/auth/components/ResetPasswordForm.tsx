import { useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, MailCheck, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Input } from '@/components/Common';

import { usePasswordResetConfirm } from '../hooks/usePasswordResetConfirm';
import {
  getResetPasswordSchema,
  type ResetPasswordFormData,
} from '../schemas/resetPassword.schema';

export function ResetPasswordForm() {
  const t = useTranslations();
  const { checking, tokenInvalid, confirmed, confirmReset } = usePasswordResetConfirm();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(getResetPasswordSchema(t)),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    await confirmReset(data.newPassword, data.confirmPassword);
  };

  if (checking) {
    return (
      <div className="animate-pulse text-sm text-[var(--sc-text-secondary)]">
        {t('Auth.reset_checking')}
      </div>
    );
  }

  if (tokenInvalid) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 rounded-lg border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] px-3 py-2.5 text-sm text-[var(--sc-error-dark)]">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[var(--sc-error)]" />
          <span>{t('Auth.reset_invalid_hint')}</span>
        </div>
        <Link
          to="/forgot-password"
          className="self-start text-sm font-medium text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] hover:underline"
        >
          {t('Auth.reset_request_new_link')}
        </Link>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-3 py-2.5 text-sm text-[var(--sc-success-dark)]">
          <MailCheck size={16} className="mt-0.5 shrink-0 text-[var(--sc-success)]" />
          <span>{t('Auth.reset_success_hint')}</span>
        </div>
        <Link
          to="/login"
          className="self-start text-sm font-medium text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] hover:underline"
        >
          {t('Auth.back_to_login')}
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="reset-new-password"
        type={showNewPassword ? 'text' : 'password'}
        label={t('Auth.new_password_label')}
        placeholder={t('Auth.new_password_placeholder')}
        autoComplete="new-password"
        leftIcon={<Lock size={17} />}
        rightIcon={
          <button
            type="button"
            aria-label={t(showNewPassword ? 'Auth.hidePassword' : 'Auth.showPassword')}
            onClick={() => setShowNewPassword((prev) => !prev)}
          >
            {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
        required
        disabled={isSubmitting}
        {...register('newPassword')}
        error={errors.newPassword?.message}
        aria-invalid={!!errors.newPassword}
      />
      <Input
        id="reset-confirm-password"
        type={showConfirmPassword ? 'text' : 'password'}
        label={t('Auth.confirm_password_label')}
        placeholder={t('Auth.confirm_password_placeholder')}
        autoComplete="new-password"
        leftIcon={<Lock size={17} />}
        rightIcon={
          <button
            type="button"
            aria-label={t(showConfirmPassword ? 'Auth.hidePassword' : 'Auth.showPassword')}
            onClick={() => setShowConfirmPassword((prev) => !prev)}
          >
            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
        required
        disabled={isSubmitting}
        {...register('confirmPassword')}
        error={errors.confirmPassword?.message}
        aria-invalid={!!errors.confirmPassword}
      />
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {t(isSubmitting ? 'Auth.reset_submitting' : 'Auth.reset_submit')}
      </Button>
    </form>
  );
}
