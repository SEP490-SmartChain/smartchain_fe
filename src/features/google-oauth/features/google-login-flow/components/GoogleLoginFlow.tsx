import { useTranslations } from 'next-intl';

import { GoogleSignInButton, useGoogleIdentityServices } from '../../google-sign-in-button/index';
import { useGoogleLogin } from '../hooks/useGoogleLogin';

import type { GoogleOAuthApiPort, GooglePublicConfigDto } from '../../../shared';

export interface GoogleLoginFlowProps {
  api: GoogleOAuthApiPort;
  config: GooglePublicConfigDto;
  rememberSession?: boolean;
  onWorkspaceRequired: () => void;
  onError: (message?: string) => void;
  workspaceSlug?: string;
}

/**
 * Complete Google login entry point: renders nothing while the feature is
 * disabled, otherwise renders the Google control and routes every API outcome.
 */
export function GoogleLoginFlow(props: GoogleLoginFlowProps) {
  if (!props.config.enabled || !props.config.clientId) return null;
  return <GoogleLoginFlowContent {...props} clientId={props.config.clientId} />;
}

type GoogleLoginFlowContentProps = GoogleLoginFlowProps & {
  readonly clientId: string;
};

function GoogleLoginFlowContent({
  api,
  clientId,
  rememberSession,
  onWorkspaceRequired,
  onError,
  workspaceSlug,
}: GoogleLoginFlowContentProps) {
  const t = useTranslations('Auth');
  const { handleCredential, isSubmitting } = useGoogleLogin({
    api,
    onError,
    onWorkspaceRequired,
    ...(rememberSession === undefined ? {} : { rememberSession }),
    ...(workspaceSlug ? { workspaceSlug } : {}),
  });
  const { ready, error } = useGoogleIdentityServices({
    clientId,
    enabled: true,
    onCredential: handleCredential,
  });

  return (
    <div className="flex w-full flex-col">
      <GoogleSignInButton
        onCredential={handleCredential}
        loading={isSubmitting}
        disabled={!ready || isSubmitting}
      />
      {error && (
        <p role="alert" className="m-0 text-xs text-[var(--sc-error-dark)]">
          {t('google_error_generic')}
        </p>
      )}
    </div>
  );
}
