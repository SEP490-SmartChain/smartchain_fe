import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deliverGoogleCredential,
  loadGoogleIdentityServices,
  requestGooglePrompt,
  setGoogleCredentialHandler,
  type GoogleIdentityServicesError,
} from '../lib/googleIdentityServices';

export interface UseGoogleIdentityServicesOptions {
  clientId: string;
  enabled: boolean;
  onCredential: (idToken: string) => void;
}

export interface UseGoogleIdentityServicesResult {
  ready: boolean;
  error: GoogleIdentityServicesError | null;
  prompt: () => void;
}

/**
 * Initializes Google Identity Services for the supplied public client id. The
 * hook is SSR-safe: it never reads `window` during render and does nothing when
 * the SDK is unavailable.
 */
export function useGoogleIdentityServices({
  clientId,
  enabled,
  onCredential,
}: UseGoogleIdentityServicesOptions): UseGoogleIdentityServicesResult {
  const onCredentialRef = useRef(onCredential);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<GoogleIdentityServicesError | null>(null);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!enabled || clientId.length === 0 || typeof window === 'undefined') {
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);
    setError(null);

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled) return;
        const google = window.google;
        if (!google?.accounts?.id) {
          setError('sdk_unavailable');
          return;
        }
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) deliverGoogleCredential(response.credential);
          },
        });
        setGoogleCredentialHandler((idToken) => onCredentialRef.current(idToken));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('script_load_failed');
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled]);

  const prompt = useCallback(() => {
    setGoogleCredentialHandler((idToken) => onCredentialRef.current(idToken));
    requestGooglePrompt();
  }, []);

  return { ready, error, prompt };
}
