import { useEffect, useRef, useState } from 'react';

import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import {
  GOOGLE_WORKSPACE_REQUIRED_CODE,
  GoogleLoginFlow,
} from '@/features/google-oauth/features/google-login-flow';
import { HttpGoogleOAuthApiClient } from '@/features/google-oauth/runtime';
import type { GooglePublicConfigDto } from '@/features/google-oauth/shared';
import { useAuth } from '@/hooks/useAuth';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { ApiError } from '@/services/apiClient';

import { getLoginSchema, type LoginFormData } from '../schemas/loginSchema';

type LoginMethod = 'password' | 'google';

/** Single Google OAuth transport for the login screen (cookie-based session). */
const googleOAuthApi = new HttpGoogleOAuthApiClient();

export function LoginForm() {
  const t = useTranslations();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [workspaceMethod, setWorkspaceMethod] = useState<LoginMethod | null>(null);
  const [googleConfig, setGoogleConfig] = useState<GooglePublicConfigDto | null>(null);
  const focusWorkspace = useRef(false);
  const loginSchema = getLoginSchema(t);
  const {
    clearErrors,
    control,
    register,
    resetField,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(
      workspaceMethod === 'password'
        ? loginSchema
        : loginSchema.extend({ workspaceSlug: z.string() }),
    ),
    defaultValues: { email: '', password: '', rememberSession: false, workspaceSlug: '' },
  });

  useEffect(() => {
    let cancelled = false;
    googleOAuthApi
      .getConfig()
      .then((config) => {
        if (!cancelled) setGoogleConfig(config);
      })
      .catch(() => {
        if (!cancelled) setGoogleConfig({ enabled: false, clientId: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (focusWorkspace.current && workspaceMethod && !isSubmitting) {
      focusWorkspace.current = false;
      setFocus('workspaceSlug');
    }
  }, [workspaceMethod, isSubmitting, setFocus]);

  const rememberSession = useWatch({ control, name: 'rememberSession' });
  const workspaceSlugInput = useWatch({ control, name: 'workspaceSlug' });
  const googleWorkspace =
    workspaceMethod === 'google'
      ? loginSchema.shape.workspaceSlug.safeParse(workspaceSlugInput)
      : null;
  const googleWorkspaceSlug = googleWorkspace?.success ? googleWorkspace.data : '';

  const requireWorkspace = (method: LoginMethod) => {
    clearErrors('root');
    if (workspaceMethod !== method) {
      focusWorkspace.current = true;
      resetField('workspaceSlug');
    }
    setWorkspaceMethod(method);
  };

  const resetWorkspace = () => {
    clearErrors('root');
    resetField('workspaceSlug');
    setWorkspaceMethod(null);
  };

  const onSubmit = async ({ workspaceSlug, ...input }: LoginFormData) => {
    if (workspaceMethod === 'password' && !workspaceSlug) {
      setError('workspaceSlug', { message: t('Auth.workspaceRequired') }, { shouldFocus: true });
      return;
    }
    try {
      await login({
        ...input,
        ...(workspaceMethod === 'password' ? { workspaceSlug } : {}),
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === GOOGLE_WORKSPACE_REQUIRED_CODE
      ) {
        requireWorkspace('password');
        return;
      }
      setError('root', {
        message: error instanceof ApiError ? error.message : t('Auth.login_error_generic'),
      });
    }
  };

  const workspaceInput = workspaceMethod && (
    <div>
      <Input
        id="login-workspace"
        label={t('Auth.workspaceSlug')}
        autoCapitalize="none"
        aria-describedby="login-workspace-hint"
        isRequired
        disabled={isSubmitting}
        {...register('workspaceSlug')}
        error={
          errors.workspaceSlug?.message ??
          (workspaceSlugInput.trim() ? googleWorkspace?.error?.issues[0]?.message : undefined)
        }
      />
      <p id="login-workspace-hint" className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">
        {t(
          workspaceMethod === 'google' ? 'Auth.workspaceGoogleHint' : 'Auth.workspacePasswordHint',
        )}
      </p>
      {workspaceMethod === 'google' && (
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={resetWorkspace}>
          {t('Auth.workspaceGoogleReset')}
        </Button>
      )}
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => notifyInvalidForm())}
      noValidate
      className="flex flex-col gap-5"
    >
      {googleConfig?.enabled && googleConfig.clientId && (
        <div className="flex flex-col gap-3">
          {workspaceMethod === 'google' && workspaceInput}
          <fieldset
            className="m-0 min-w-0 border-0 p-0"
            disabled={isSubmitting || (workspaceMethod === 'google' && !googleWorkspaceSlug)}
          >
            <GoogleLoginFlow
              api={googleOAuthApi}
              config={googleConfig}
              rememberSession={rememberSession}
              {...(googleWorkspaceSlug ? { workspaceSlug: googleWorkspaceSlug } : {})}
              onWorkspaceRequired={() => requireWorkspace('google')}
              onError={(message) =>
                setError('root', {
                  message: message ?? t('Auth.login_error_generic'),
                })
              }
            />
          </fieldset>
        </div>
      )}
      {errors.root && <Alert variant="error">{errors.root.message}</Alert>}
      <Input
        id="login-email"
        type="email"
        label={t('Auth.email_label')}
        placeholder={t('Auth.email_placeholder')}
        autoComplete="username"
        autoCapitalize="none"
        required
        disabled={isSubmitting}
        {...register('email', {
          onChange: () => {
            if (workspaceMethod === 'password') resetWorkspace();
          },
        })}
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
      {workspaceMethod === 'password' && workspaceInput}
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
