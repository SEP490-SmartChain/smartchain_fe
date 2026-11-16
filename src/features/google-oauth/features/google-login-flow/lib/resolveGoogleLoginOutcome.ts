import type { AuthSession } from '@/stores/authStore';

import type { GoogleLoginResponseDto, GoogleOAuthLocationState } from '../../../shared';

export type ResolvedGoogleLoginOutcome =
  | {
      readonly kind: 'authenticated';
      readonly session: AuthSession;
    }
  | {
      readonly kind: 'onboarding';
      readonly path: '/register';
      readonly state: GoogleOAuthLocationState;
    };

/**
 * Pure mapping from the API login outcome to the navigation/session decision.
 * Keeping it free of React and router dependencies makes every branch testable.
 */
export function resolveGoogleLoginOutcome(
  outcome: GoogleLoginResponseDto,
): ResolvedGoogleLoginOutcome {
  if (outcome.status === 'AUTHENTICATED') {
    return {
      kind: 'authenticated',
      session: {
        accessToken: outcome.accessToken,
        expiresIn: outcome.expiresIn,
        user: outcome.user,
      },
    };
  }

  return {
    kind: 'onboarding',
    path: '/register',
    state: {
      googleOnboarding: {
        onboardingToken: outcome.onboardingToken,
        googleProfile: outcome.googleProfile,
      },
    },
  };
}
