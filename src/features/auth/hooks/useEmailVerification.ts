import { useState } from 'react';

import { ApiError, apiClient } from '@/services/apiClient';

interface SendVerificationResponse {
  success: boolean;
  data: { messageKey: string };
}

interface VerifyEmailResponse {
  success: boolean;
  data: { messageKey: string };
}

export type OtpStatus = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export function useEmailVerification() {
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle');
  /** Unix ms timestamp of last OTP send — used to render the 60s resend cooldown */
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [error, setError] = useState<{ action: 'send' | 'verify'; message?: string }>();
  const clearError = () => setError(undefined);

  const sendOtp = async (email: string): Promise<boolean> => {
    clearError();
    try {
      setOtpStatus('sending');
      await apiClient.post<SendVerificationResponse>(
        '/v1/auth/send-verification',
        { email },
        { requiresAuth: false, silent: true },
      );
      setOtpStatus('sent');
      setSentAt(Date.now());
      return true;
    } catch (failure) {
      setError({
        action: 'send',
        message: failure instanceof ApiError ? failure.message : undefined,
      });
      setOtpStatus('idle');
      return false;
    }
  };

  const verifyOtp = async (email: string, otp: string): Promise<boolean> => {
    clearError();
    try {
      setOtpStatus('verifying');
      await apiClient.post<VerifyEmailResponse>(
        '/v1/auth/verify-email',
        { email, otp },
        { requiresAuth: false, silent: true },
      );
      setOtpStatus('verified');
      return true;
    } catch (failure) {
      setError({
        action: 'verify',
        message: failure instanceof ApiError ? failure.message : undefined,
      });
      setOtpStatus('sent');
      return false;
    }
  };

  const resetOtpStatus = () => {
    setOtpStatus('idle');
    setSentAt(null);
    clearError();
  };

  return { otpStatus, sentAt, sendOtp, verifyOtp, resetOtpStatus, error, clearError };
}
