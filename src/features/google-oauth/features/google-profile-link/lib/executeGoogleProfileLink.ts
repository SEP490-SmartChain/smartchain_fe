import { ApiError } from '@/services/apiClient';

import type { GoogleLinkResponseDto, GoogleOAuthApiPort } from '../../../shared';

export const GOOGLE_IDENTITY_CONFLICT_CODE = 'AUTH.GOOGLE_IDENTITY_CONFLICT';
export const GOOGLE_VERSION_CONFLICT_CODE = 'AUTH.VERSION_CONFLICT';

export type GoogleProfileLinkOutcome =
  | { readonly kind: 'linked'; readonly response: GoogleLinkResponseDto }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message?: string };

export interface ExecuteGoogleProfileLinkInput {
  readonly api: GoogleOAuthApiPort;
  readonly idToken: string;
  readonly expectedUserVersion?: number;
}

/**
 * Router-independent link call. A stale user version or an identity already
 * linked elsewhere is reported as a conflict so the card can explain it.
 */
export async function executeGoogleProfileLink(
  input: ExecuteGoogleProfileLinkInput,
): Promise<GoogleProfileLinkOutcome> {
  try {
    const response = await input.api.linkGoogleAccount({
      idToken: input.idToken,
      ...(input.expectedUserVersion === undefined
        ? {}
        : { expectedUserVersion: input.expectedUserVersion }),
    });
    return { kind: 'linked', response };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      (error.code === GOOGLE_IDENTITY_CONFLICT_CODE || error.code === GOOGLE_VERSION_CONFLICT_CODE)
    ) {
      return { kind: 'conflict' };
    }

    return {
      kind: 'failed',
      ...(error instanceof ApiError ? { message: error.message } : {}),
    };
  }
}
