import { useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/apiClient';

import { getLoginSchema, type LoginFormData } from '../schemas/loginSchema';

export function LoginForm() {
  const t = useTranslations();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(getLoginSchema(t)),
    defaultValues: { email: '', password: '', rememberSession: false, workspaceSlug: '' },
  });

  const onSubmit = async ({ workspaceSlug, ...input }: LoginFormData) => {
    try {
      await login({ ...input, ...(workspaceSlug ? { workspaceSlug } : {}) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setNeedsWorkspace(true);
      setError('root', {
        message: error instanceof ApiError ? error.message : t('Auth.login_error_generic'),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {errors.root && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] px-4 py-3 text-sm text-[var(--sc-error-dark)]"
        >
          {errors.root.message}
        </p>
      )}
      <Input
        id="login-email"
        type="email"
        label={t('Auth.email_label')}
        placeholder={t('Auth.email_placeholder')}
        autoComplete="username"
        autoCapitalize="none"
        required
        disabled={isSubmitting}
        {...register('email')}
        error={errors.email?.message}
        aria-invalid={!!errors.email}
      />
      <div>
        <Input
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          label={t('Auth.password_label')}
          placeholder={t('Auth.loginPasswordPlaceholder')}
          autoComplete="current-password"
          required
          disabled={isSubmitting}
          {...register('password')}
          error={errors.password?.message}
          aria-invalid={!!errors.password}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={t(showPassword ? 'Auth.hidePassword' : 'Auth.showPassword')}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        <div className="mt-2 flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs text-[var(--sc-text-secondary)] hover:text-[var(--sc-primary-dark)] hover:underline"
          >
            {t('Auth.forgot_password')}
          </Link>
        </div>
      </div>
      <details open={needsWorkspace || undefined}>
        <summary className="cursor-pointer text-sm text-[var(--sc-primary-dark)]">
          {t('Auth.workspaceOptional')}
        </summary>
        <div className="mt-3">
          <Input
            id="login-workspace"
            label={t('Auth.workspaceSlug')}
            placeholder="my-company"
            autoCapitalize="none"
            disabled={isSubmitting}
            {...register('workspaceSlug')}
            error={errors.workspaceSlug?.message}
            aria-invalid={!!errors.workspaceSlug}
            helperText={t('Auth.workspaceHint')}
          />
        </div>
      </details>
      <label className="flex items-center gap-2.5 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--sc-primary)]"
          disabled={isSubmitting}
          {...register('rememberSession')}
        />
        {t('Auth.remember_me')}
      </label>
      <Button type="submit" isLoading={isSubmitting} className="min-w-[120px] self-start">
        {t(isSubmitting ? 'Auth.logging_in' : 'Auth.login_heading')}
      </Button>
    </form>
  );
}
