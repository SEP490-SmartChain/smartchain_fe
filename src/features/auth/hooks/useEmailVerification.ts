import { useState } from 'react';

import { apiClient } from '@/services/apiClient';

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

  const sendOtp = async (email: string): Promise<boolean> => {
    try {
      setOtpStatus('sending');
      await apiClient.post<SendVerificationResponse>(
        '/v1/auth/send-verification',
        { email },
        { requiresAuth: false },
      );
      setOtpStatus('sent');
      setSentAt(Date.now());
      return true;
    } catch {
      setOtpStatus('idle');
      return false;
    }
  };

  const verifyOtp = async (email: string, otp: string): Promise<boolean> => {
    try {
      setOtpStatus('verifying');
      await apiClient.post<VerifyEmailResponse>(
        '/v1/auth/verify-email',
        { email, otp },
        { requiresAuth: false },
      );
      setOtpStatus('verified');
      return true;
    } catch {
      setOtpStatus('sent');
      return false;
    }
  };

  const resetOtpStatus = () => {
    setOtpStatus('idle');
    setSentAt(null);
  };

  return { otpStatus, sentAt, sendOtp, verifyOtp, resetOtpStatus };
}
