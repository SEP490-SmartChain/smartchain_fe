import { useState } from 'react';

import { ApiError, apiClient } from '@/services/apiClient';

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
 * Confirms a password reset link (`#token=...`) via
 * POST /v1/auth/password-reset-confirmations. The API returns a single generic
 * `AUTH.PASSWORD_RESET_TOKEN_INVALID` error for any unknown/expired/used/ineligible
 * token, so the UI cannot and must not distinguish those cases either.
 */
export function usePasswordResetConfirm() {
  const [token] = useState<string | null>(() => readTokenFromHash());
  const [tokenInvalid, setTokenInvalid] = useState(token === null);
  const [confirmed, setConfirmed] = useState(false);

  const confirmReset = async (newPassword: string): Promise<boolean> => {
    if (!token) {
      setTokenInvalid(true);
      return false;
    }
    try {
      await apiClient.post<ConfirmPasswordResetResponse>(
        '/v1/auth/password-reset-confirmations',
        { token, newPassword },
        { requiresAuth: false },
      );
      setConfirmed(true);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH.PASSWORD_RESET_TOKEN_INVALID') {
        setTokenInvalid(true);
      }
      // Other errors (rate limit / network / service unavailable) already surfaced via apiClient's toast.
      return false;
    }
  };

  return { tokenInvalid, confirmed, confirmReset };
}
