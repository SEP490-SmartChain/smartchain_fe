import type { AuthUser } from '@/stores/authStore';

export interface GooglePublicConfigDto {
  readonly enabled: boolean;
  readonly clientId: string | null;
}

export interface GoogleLoginRequestDto {
  readonly idToken: string;
  readonly workspaceSlug?: string;
  readonly rememberSession?: boolean;
}

export interface GoogleOnboardingProfileDto {
  readonly email: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
}

export type GoogleLoginResponseDto =
  | {
      readonly status: 'AUTHENTICATED';
      readonly accessToken: string;
      readonly expiresIn: number;
      readonly user: AuthUser;
    }
  | {
      readonly status: 'ONBOARDING_REQUIRED';
      readonly onboardingToken: string;
      readonly expiresIn: number;
      readonly googleProfile: GoogleOnboardingProfileDto;
    };

export interface RegisterGoogleBusinessRequestDto {
  readonly onboardingToken: string;
  readonly fullName: string;
  readonly phone: string;
  readonly companyName: string;
  readonly taxId?: string;
  readonly rememberSession?: boolean;
  readonly operationKey?: string;
}

export interface RegisterGoogleBusinessResponseDto {
  readonly status: 'AUTHENTICATED';
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly user: AuthUser;
}

export interface GoogleLinkRequestDto {
  readonly idToken: string;
  readonly expectedUserVersion?: number;
}

export interface GoogleLinkResponseDto {
  readonly userId: string;
  readonly tenantId: string;
  readonly email: string;
  readonly googleSubLinked: true;
  readonly linkedAt: string;
  readonly version: number;
}

export interface GoogleOAuthLocationState {
  readonly googleOnboarding?: {
    readonly onboardingToken: string;
    readonly googleProfile: GoogleOnboardingProfileDto;
  };
}

export interface GoogleOAuthApiPort {
  getConfig(): Promise<GooglePublicConfigDto>;
  loginWithGoogle(input: GoogleLoginRequestDto): Promise<GoogleLoginResponseDto>;
  registerWithGoogle(
    input: RegisterGoogleBusinessRequestDto,
  ): Promise<RegisterGoogleBusinessResponseDto>;
  linkGoogleAccount(input: GoogleLinkRequestDto): Promise<GoogleLinkResponseDto>;
  lookupBusinessTaxId(
    taxId: string,
  ): Promise<{ readonly name: string; readonly address: string } | null>;
}
