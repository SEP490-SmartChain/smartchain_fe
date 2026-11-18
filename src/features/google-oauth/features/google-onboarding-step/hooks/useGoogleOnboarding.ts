import { useCallback, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { getPostLoginPath } from '@/lib/authRedirect';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import type {
  GoogleOAuthApiPort,
  GoogleOnboardingFormData,
  RegisterGoogleBusinessResponseDto,
} from '../../../shared';

export interface UseGoogleOnboardingOptions {
  api: GoogleOAuthApiPort;
  onboardingToken: string;
  rememberSession?: boolean;
  onError?: (message?: string) => void;
}

export interface UseGoogleOnboardingResult {
  submit: (values: GoogleOnboardingFormData) => Promise<RegisterGoogleBusinessResponseDto | null>;
  isSubmitting: boolean;
  hasError: boolean;
}

/**
 * Completes the Google business onboarding: registers the tenant through the
 * API, stores the returned session in memory and redirects to the role landing
 * page. Password fields are intentionally absent from this flow.
 */
export function useGoogleOnboarding({
  api,
  onboardingToken,
  rememberSession,
  onError,
}: UseGoogleOnboardingOptions): UseGoogleOnboardingResult {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const submit = useCallback(
    async (values: GoogleOnboardingFormData) => {
      setIsSubmitting(true);
      setHasError(false);
      try {
        const response = await api.registerWithGoogle({
          onboardingToken,
          fullName: values.fullName,
          phone: values.phone,
          companyName: values.companyName,
          ...(values.taxId ? { taxId: values.taxId } : {}),
          ...(rememberSession === undefined ? {} : { rememberSession }),
        });
        useAuthStore.getState().setSession({
          accessToken: response.accessToken,
          expiresIn: response.expiresIn,
          user: response.user,
        });
        navigate(getPostLoginPath(response.user, null), { replace: true });
        return response;
      } catch (error) {
        setHasError(true);
        onError?.(error instanceof ApiError ? error.message : undefined);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [api, navigate, onboardingToken, rememberSession, onError],
  );

  return { submit, isSubmitting, hasError };
}
