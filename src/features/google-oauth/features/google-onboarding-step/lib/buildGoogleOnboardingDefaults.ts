import type { GoogleOnboardingProfileDto } from '../../../shared';

export interface GoogleOnboardingDefaults {
  readonly fullName: string;
  readonly email: string;
}

/** Prefills the two identity fields that Google already verified. */
export function buildGoogleOnboardingDefaults(
  profile: GoogleOnboardingProfileDto,
): GoogleOnboardingDefaults {
  return {
    fullName: profile.fullName.trim(),
    email: profile.email.trim(),
  };
}
