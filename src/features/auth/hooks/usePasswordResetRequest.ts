import { useState } from 'react';

import { ApiError, apiClient } from '@/services/apiClient';

interface PasswordResetRequestResponse {
  success: boolean;
  data: { messageKey: string };
}

/**
 * SS-346: POST /v1/auth/password-reset-requests.
 *
 * The API always returns a generic 200 whether or not the email belongs to an
 * eligible account (anti-enumeration) — `sent` therefore only means "the request
 * was accepted", never "this account exists". Do not brand this text as a
 * confirmation of account existence.
 */
export function usePasswordResetRequest() {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [requestError, setRequestError] = useState<{ message?: string }>();

  const requestReset = async (email: string): Promise<boolean> => {
    setRequestError(undefined);
    try {
      await apiClient.post<PasswordResetRequestResponse>(
        '/v1/auth/password-reset-requests',
        { email },
        { requiresAuth: false, silent: true },
      );
      setSubmittedEmail(email);
      setSent(true);
      return true;
    } catch (error) {
      setRequestError(error instanceof ApiError ? { message: error.message } : {});
      return false;
    }
  };

  const reset = () => {
    setSent(false);
    setSubmittedEmail('');
    setRequestError(undefined);
  };

  return { sent, submittedEmail, requestReset, reset, requestError };
}
