import { useEffect, useRef } from 'react';

import { LoaderCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';

import {
  renderGoogleSignInButton,
  setGoogleCredentialHandler,
} from '../lib/googleIdentityServices';

export interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Google-branded sign-in control used by the ORCA auth screens. The credential
 * is produced by Google Identity Services, which is initialized by
 * `useGoogleIdentityServices`; this component only renders the affordance.
 */
export function GoogleSignInButton({
  onCredential,
  disabled = false,
  loading = false,
}: GoogleSignInButtonProps) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const isDisabled = disabled || loading;
  const label = t(loading ? 'google_sign_in_loading' : 'google_sign_in');

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    const parent = container.current;
    if (isDisabled || !parent) return;
    setGoogleCredentialHandler((token) => onCredentialRef.current(token));
    renderGoogleSignInButton(parent, locale);
    return () => {
      parent.replaceChildren();
    };
  }, [isDisabled, locale]);

  return (
    <div className="w-full">
      {!isDisabled && (
        <div
          ref={container}
          aria-label={label}
          className="flex min-h-[42px] w-full justify-center"
        />
      )}
      {isDisabled && (
        <Button
          type="button"
          variant="secondary"
          disabled={isDisabled}
          aria-label={label}
          aria-busy={loading ? true : undefined}
          className="h-[42px] w-full gap-2.5 font-medium focus-visible:border-[var(--sc-primary)] focus-visible:shadow-[var(--sc-shadow-focus)] focus-visible:outline-none"
        >
          {loading ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <GoogleLogo />
          )}
          <span>{label}</span>
        </Button>
      )}

      <div className="my-4 flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--sc-border-default)]" />
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--sc-text-tertiary)]">
          {t('google_or_divider')}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--sc-border-default)]" />
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.638-.0573-1.2518-.1637-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.796 2.7164v2.2582h2.9082c1.702-1.5673 2.6842-3.8741 2.6842-6.6151Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8059 5.9563-2.1805l-2.9082-2.2582c-.8059.54-1.8368.8591-3.0481.8591-2.3441 0-4.3286-1.5832-5.036-3.7105H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.4138 5.4138 0 0 1 3.682 9c0-.5927.1018-1.1686.282-1.71V4.9582H.9573A8.9957 8.9957 0 0 0 0 9c0 1.4523.3477 2.8273.9573 4.0418L3.964 10.71Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6714 5.1627 6.6559 3.5795 9 3.5795Z"
      />
    </svg>
  );
}
