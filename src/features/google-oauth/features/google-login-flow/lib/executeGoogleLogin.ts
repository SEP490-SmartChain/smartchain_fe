import { getPostLoginPath } from '@/lib/authRedirect';
import { ApiError } from '@/services/apiClient';
import type { AuthSession } from '@/stores/authStore';

import { resolveGoogleLoginOutcome } from './resolveGoogleLoginOutcome';

import type { GoogleOAuthApiPort } from '../../../shared';

export const GOOGLE_WORKSPACE_REQUIRED_CODE = 'AUTH.WORKSPACE_REQUIRED';

export interface GoogleLoginNavigator {
  (path: string, options?: { readonly replace?: boolean; readonly state?: unknown }): void;
}

export interface ExecuteGoogleLoginInput {
  readonly api: GoogleOAuthApiPort;
  readonly idToken: string;
  readonly navigate: GoogleLoginNavigator;
  readonly setSession: (session: AuthSession) => void;
  readonly onWorkspaceRequired: () => void;
  readonly onError: (message?: string) => void;
  readonly rememberSession?: boolean;
  readonly workspaceSlug?: string;
}

/**
 * Router-independent Google login orchestration: calls the API, persists the
 * session for AUTHENTICATED outcomes, forwards ONBOARDING outcomes to
 * `/register`, and treats `AUTH.WORKSPACE_REQUIRED` as a recoverable branch.
 */
export async function executeGoogleLogin(input: ExecuteGoogleLoginInput): Promise<void> {
  const {
    api,
    idToken,
    navigate,
    setSession,
    onWorkspaceRequired,
    onError,
    rememberSession,
    workspaceSlug,
  } = input;

  try {
    const outcome = await api.loginWithGoogle({
      idToken,
      ...(workspaceSlug ? { workspaceSlug } : {}),
      ...(rememberSession === undefined ? {} : { rememberSession }),
    });
    const resolved = resolveGoogleLoginOutcome(outcome);

    if (resolved.kind === 'authenticated') {
      setSession(resolved.session);
      navigate(getPostLoginPath(resolved.session.user, null), { replace: true });
      return;
    }

    navigate(resolved.path, { state: resolved.state });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === GOOGLE_WORKSPACE_REQUIRED_CODE
    ) {
      onWorkspaceRequired();
      return;
    }

    onError(error instanceof ApiError ? error.message : undefined);
  }
}
