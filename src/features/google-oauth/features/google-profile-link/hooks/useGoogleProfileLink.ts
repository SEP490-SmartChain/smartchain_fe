import { useCallback, useState } from 'react';

import {
  executeGoogleProfileLink,
  type GoogleProfileLinkOutcome,
} from '../lib/executeGoogleProfileLink';

import type { GoogleLinkResponseDto, GoogleOAuthApiPort } from '../../../shared';

export type GoogleProfileLinkError = 'conflict' | 'failed' | null;

export interface UseGoogleProfileLinkOptions {
  api: GoogleOAuthApiPort;
  expectedUserVersion?: number;
  onLinked?: (response: GoogleLinkResponseDto) => void;
}

export interface UseGoogleProfileLinkResult {
  link: (idToken: string) => Promise<GoogleProfileLinkOutcome>;
  isLinking: boolean;
  error: GoogleProfileLinkError;
  linkedAt: string | null;
}

/** Links the signed-in Google identity to the current ORCA account. */
export function useGoogleProfileLink({
  api,
  expectedUserVersion,
  onLinked,
}: UseGoogleProfileLinkOptions): UseGoogleProfileLinkResult {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<GoogleProfileLinkError>(null);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);

  const link = useCallback(
    async (idToken: string) => {
      setIsLinking(true);
      setError(null);
      const outcome = await executeGoogleProfileLink({
        api,
        idToken,
        ...(expectedUserVersion === undefined ? {} : { expectedUserVersion }),
      });

      if (outcome.kind === 'linked') {
        setLinkedAt(outcome.response.linkedAt);
        onLinked?.(outcome.response);
      } else {
        setError(outcome.kind);
      }

      setIsLinking(false);
      return outcome;
    },
    [api, expectedUserVersion, onLinked],
  );

  return { link, isLinking, error, linkedAt };
}
