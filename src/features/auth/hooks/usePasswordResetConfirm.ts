import { useEffect, useState } from 'react';

import { ApiError, apiClient } from '@/services/apiClient';

interface VerifyResetTokenResponse {
  success: boolean;
  data: { valid: boolean };
}

interface ConfirmPasswordResetResponse {
  success: boolean;
  data: { messageKey: string };
}

function readTokenFromHash(): string | null {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(raw).get('token');
  return token && token.length > 0 ? token : null;
}

/**
 * Confirms a password reset link (`#token=...`) via GET /v1/auth/verify-reset-token
 * (pre-flight check on mount) and POST /v1/auth/reset-password. The API returns a
 * single generic `AUTH.PASSWORD_RESET_TOKEN_INVALID` error for any unknown/expired/
 * used/ineligible token, so the UI cannot and must not distinguish those cases either.
 */
export function usePasswordResetConfirm() {
  const [token] = useState<string | null>(() => readTokenFromHash());
  const [checking, setChecking] = useState(token !== null);
  const [tokenInvalid, setTokenInvalid] = useState(token === null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    apiClient
      .get<VerifyResetTokenResponse>('/v1/auth/verify-reset-token', {
        params: { token },
        requiresAuth: false,
        silent: true,
      })
      .then(({ data }) => {
        if (!cancelled && !data.valid) {
          setTokenInvalid(true);
        }
      })
      .catch(() => {
        // Network/rate-limit errors here don't prove the token is invalid; let the
        // user try submitting the form, where the same check runs again.
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirmReset = async (
    newPassword: string,
    confirmNewPassword: string,
  ): Promise<boolean> => {
    if (!token) {
      setTokenInvalid(true);
      return false;
    }
    try {
      await apiClient.post<ConfirmPasswordResetResponse>(
        '/v1/auth/reset-password',
        { token, newPassword, confirmNewPassword },
        { requiresAuth: false },
      );
      setConfirmed(true);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH.PASSWORD_RESET_TOKEN_INVALID') {
        setTokenInvalid(true);
      }
      // Other errors (same-as-current, rate limit, network) already surfaced via
      // apiClient's toast; the form stays on the input step so the user can retry.
      return false;
    }
  };

  return { checking, tokenInvalid, confirmed, confirmReset };
}
