import { useCallback, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

import { executeGoogleLogin } from '../lib/executeGoogleLogin';

import type { GoogleOAuthApiPort } from '../../../shared';

export interface UseGoogleLoginOptions {
  api: GoogleOAuthApiPort;
  rememberSession?: boolean;
  workspaceSlug?: string;
  onError: (message?: string) => void;
  onWorkspaceRequired: () => void;
}

export interface UseGoogleLoginResult {
  handleCredential: (idToken: string) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Handles a Google ID token end to end. AUTHENTICATED sessions are stored in the
 * in-memory auth store before redirecting to the role landing page; ONBOARDING
 * sessions are forwarded to `/register` with the verified Google profile.
 */
export function useGoogleLogin({
  api,
  rememberSession,
  workspaceSlug,
  onError,
  onWorkspaceRequired,
}: UseGoogleLoginOptions): UseGoogleLoginResult {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCredential = useCallback(
    async (idToken: string) => {
      setIsSubmitting(true);
      try {
        await executeGoogleLogin({
          api,
          idToken,
          navigate,
          setSession: (session) => useAuthStore.getState().setSession(session),
          onError,
          onWorkspaceRequired,
          ...(rememberSession === undefined ? {} : { rememberSession }),
          ...(workspaceSlug ? { workspaceSlug } : {}),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [api, navigate, onError, onWorkspaceRequired, rememberSession, workspaceSlug],
  );

  return { handleCredential, isSubmitting };
}
