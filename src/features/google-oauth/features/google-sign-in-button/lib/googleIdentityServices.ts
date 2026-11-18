import type { GoogleIdentityServices } from '../types/googleIdentityServices.types';

export const GOOGLE_IDENTITY_SERVICES_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_IDENTITY_SERVICES_SCRIPT_ID = 'google-identity-services';

export type GoogleIdentityServicesError = 'script_load_failed' | 'sdk_unavailable';

let scriptPromise: Promise<void> | null = null;
let credentialHandler: ((idToken: string) => void) | null = null;

/** Registers the callback that receives the ID token produced by a GIS prompt. */
export function setGoogleCredentialHandler(handler: (idToken: string) => void): void {
  credentialHandler = handler;
}

/** Delivers a GIS credential to the currently registered handler, if any. */
export function deliverGoogleCredential(idToken: string): void {
  credentialHandler?.(idToken);
}

/** Reads the GIS global without touching `window` during SSR. */
export function getGoogleIdentityServices(): GoogleIdentityServices | null {
  if (typeof window === 'undefined') return null;
  return window.google ?? null;
}

/** Opens the GIS prompt when the SDK is available; a no-op during SSR. */
export function requestGooglePrompt(): void {
  getGoogleIdentityServices()?.accounts?.id?.prompt();
}

/** The official button starts the account chooser independently of One Tap eligibility. */
export function renderGoogleSignInButton(parent: HTMLElement, locale: string): void {
  const id = getGoogleIdentityServices()?.accounts?.id;
  if (!id) return;
  parent.replaceChildren();
  id.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: Math.min(400, Math.max(200, Math.floor(parent.getBoundingClientRect().width))),
    locale,
  });
}

/**
 * Loads `https://accounts.google.com/gsi/client` at most once per page. The
 * returned promise resolves when the SDK global is available.
 */
export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (getGoogleIdentityServices()?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SERVICES_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          scriptPromise = null;
          reject(new Error('Google Identity Services failed to load'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SERVICES_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SERVICES_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        scriptPromise = null;
        script.remove();
        reject(new Error('Google Identity Services failed to load'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return scriptPromise;
}
