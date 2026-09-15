import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Input } from '@/components/Common';

import { usePasswordResetRequest } from '../hooks/usePasswordResetRequest';
import {
  getForgotPasswordSchema,
  type ForgotPasswordFormData,
} from '../schemas/forgotPassword.schema';

const BackToLoginLink = () => {
  const t = useTranslations('Auth');
  return (
    <Link
      to="/login"
      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--sc-text-secondary)] hover:text-[var(--sc-primary)]"
    >
      <ArrowLeft size={16} />
      {t('back_to_login')}
    </Link>
  );
};

export function ForgotPasswordForm() {
  const t = useTranslations();
  const { sent, submittedEmail, requestReset, reset } = usePasswordResetRequest();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(getForgotPasswordSchema(t)),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    await requestReset(data.email);
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-3 py-2.5 text-sm text-[var(--sc-success-dark)]">
          <MailCheck size={16} className="mt-0.5 shrink-0 text-[var(--sc-success)]" />
          <span>{t('Auth.forgot_sent_hint', { email: submittedEmail })}</span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="self-start text-sm font-medium text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] hover:underline"
        >
          {t('Auth.forgot_try_again')}
        </button>
        <BackToLoginLink />
      </div>
    );
  }

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          id="forgot-email"
          type="email"
          label={t('Auth.email_label')}
          placeholder={t('Auth.email_placeholder')}
          autoComplete="email"
          autoCapitalize="none"
          leftIcon={<Mail size={17} />}
          required
          disabled={isSubmitting}
          {...register('email')}
          error={errors.email?.message}
          aria-invalid={!!errors.email}
        />
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {t(isSubmitting ? 'Auth.forgot_sending' : 'Auth.forgot_send')}
        </Button>
      </form>

      <div className="mt-6">
        <BackToLoginLink />
      </div>
    </>
  );
}
