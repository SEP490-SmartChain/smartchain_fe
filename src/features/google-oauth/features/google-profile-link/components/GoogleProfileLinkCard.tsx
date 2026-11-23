import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';

import { useGoogleIdentityServices } from '../../google-sign-in-button/index';
import { useGoogleProfileLink } from '../hooks/useGoogleProfileLink';

import type {
  GoogleLinkResponseDto,
  GoogleOAuthApiPort,
  GooglePublicConfigDto,
} from '../../../shared';

export interface GoogleProfileLinkCardProps {
  api: GoogleOAuthApiPort;
  linked: boolean;
  expectedUserVersion?: number;
  onLinked?: (response: GoogleLinkResponseDto) => void;
}

/**
 * Settings card that links a Google identity to the current ORCA account. The
 * current link state is server-owned; `linked` is only the initial snapshot.
 */
export function GoogleProfileLinkCard({
  api,
  linked,
  expectedUserVersion,
  onLinked,
}: GoogleProfileLinkCardProps) {
  const t = useTranslations('Auth');
  const [config, setConfig] = useState<GooglePublicConfigDto | null>(null);
  const { link, isLinking, error, linkedAt } = useGoogleProfileLink({
    api,
    ...(expectedUserVersion === undefined ? {} : { expectedUserVersion }),
    ...(onLinked ? { onLinked } : {}),
  });

  useEffect(() => {
    let cancelled = false;
    api
      .getConfig()
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch(() => {
        if (!cancelled) setConfig({ enabled: false, clientId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const { ready, prompt } = useGoogleIdentityServices({
    clientId: config?.clientId ?? '',
    enabled: config?.enabled === true && config.clientId !== null,
    onCredential: (idToken: string) => {
      void link(idToken);
    },
  });

  const isLinked = linked || linkedAt !== null;
  if (config !== null && (!config.enabled || !config.clientId) && !isLinked) {
    return null;
  }
  const errorMessage =
    error === 'conflict'
      ? t('google_link_conflict')
      : error === 'failed'
        ? t('google_link_error')
        : null;

  return (
    <Card>
      <CardHeader title={t('google_link_heading')} description={t('google_link_description')} />
      <div className="flex flex-col gap-4">
        <div>
          <Badge
            status={isLinked ? 'success' : 'default'}
            label={t(isLinked ? 'google_link_linked' : 'google_link_unlinked')}
          />
        </div>

        {isLinked ? (
          <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
            {t('google_link_success')}
          </p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={prompt}
            isLoading={isLinking}
            disabled={!ready || isLinking}
            className="self-start"
          >
            {t(isLinking ? 'google_link_linking' : 'google_link_button')}
          </Button>
        )}

        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
      </div>
    </Card>
  );
}
