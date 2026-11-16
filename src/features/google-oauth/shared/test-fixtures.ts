import type { AuthUser } from '@/stores/authStore';

import type {
  GoogleLinkRequestDto,
  GoogleLinkResponseDto,
  GoogleLoginRequestDto,
  GoogleLoginResponseDto,
  GoogleOAuthApiPort,
  GoogleOnboardingProfileDto,
  GooglePublicConfigDto,
  RegisterGoogleBusinessRequestDto,
  RegisterGoogleBusinessResponseDto,
} from './contracts';

export function makeCanonicalAuthUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    userId: '00000200-0000-4000-8000-000000000101',
    tenantId: '00000100-0000-4000-8000-000000000101',
    actorScope: 'TENANT',
    serviceStatus: 'ACTIVE',
    email: 'owner@orcafashion.vn',
    fullName: 'Nguyễn Văn Chủ Shop',
    phone: '0901234567',
    avatarUrl: 'https://lh3.googleusercontent.com/a/orca-owner-avatar',
    roles: ['SELLER_OWNER'],
    permissions: ['orders.read', 'orders.create'],
    warehouseIds: [],
    ...overrides,
  };
}

export function makeCanonicalGoogleOnboardingProfile(
  overrides?: Partial<GoogleOnboardingProfileDto>,
): GoogleOnboardingProfileDto {
  return {
    email: 'new.seller@gmail.com',
    fullName: 'Lê Thị Chủ Shop Mới',
    avatarUrl: 'https://lh3.googleusercontent.com/a/new-seller-avatar',
    ...overrides,
  };
}

export class FakeGoogleOAuthApiClient implements GoogleOAuthApiPort {
  public config: GooglePublicConfigDto = {
    enabled: true,
    clientId: '1234567890-orca-user.apps.googleusercontent.com',
  };

  public nextLoginOutcome: GoogleLoginResponseDto = {
    status: 'AUTHENTICATED',
    accessToken: 'jwt-access-token-canonical',
    expiresIn: 900,
    user: makeCanonicalAuthUser(),
  };

  public nextRegisterOutcome: RegisterGoogleBusinessResponseDto = {
    status: 'AUTHENTICATED',
    tenantId: '00000100-0000-4000-8000-000000000109',
    tenantSlug: 'cong-ty-moi-orca',
    accessToken: 'jwt-access-token-new-tenant',
    expiresIn: 900,
    user: makeCanonicalAuthUser({
      tenantId: '00000100-0000-4000-8000-000000000109',
      email: 'new.seller@gmail.com',
      fullName: 'Lê Thị Chủ Shop Mới',
      serviceStatus: 'PENDING_ACTIVATION',
    }),
  };

  public lastLoginInput: GoogleLoginRequestDto | null = null;

  public lastRegisterInput: RegisterGoogleBusinessRequestDto | null = null;

  public lastLinkInput: GoogleLinkRequestDto | null = null;

  async getConfig(): Promise<GooglePublicConfigDto> {
    return this.config;
  }

  async loginWithGoogle(input: GoogleLoginRequestDto): Promise<GoogleLoginResponseDto> {
    this.lastLoginInput = input;
    return this.nextLoginOutcome;
  }

  async registerWithGoogle(
    input: RegisterGoogleBusinessRequestDto,
  ): Promise<RegisterGoogleBusinessResponseDto> {
    this.lastRegisterInput = input;
    return this.nextRegisterOutcome;
  }

  async linkGoogleAccount(input: GoogleLinkRequestDto): Promise<GoogleLinkResponseDto> {
    this.lastLinkInput = input;
    return {
      userId: '00000200-0000-4000-8000-000000000101',
      tenantId: '00000100-0000-4000-8000-000000000101',
      email: 'owner@orcafashion.vn',
      googleSubLinked: true,
      linkedAt: '2026-11-15T14:00:00.000Z',
      version: (input.expectedUserVersion ?? 1) + 1,
    };
  }

  async lookupBusinessTaxId(
    taxId: string,
  ): Promise<{ readonly name: string; readonly address: string } | null> {
    if (taxId === '0312345678') {
      return {
        name: 'CÔNG TY TNHH LOGISTICS ORCA VIỆT NAM',
        address: 'Quận 1, TP. Hồ Chí Minh',
      };
    }
    return null;
  }
}
