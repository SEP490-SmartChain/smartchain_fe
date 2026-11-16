import { apiClient } from '@/services/apiClient';

import { normalizeBusinessTaxLookup } from './tax-lookup.mapping';

import type {
  GoogleLinkRequestDto,
  GoogleLinkResponseDto,
  GoogleLoginRequestDto,
  GoogleLoginResponseDto,
  GoogleOAuthApiPort,
  GooglePublicConfigDto,
  RegisterGoogleBusinessRequestDto,
  RegisterGoogleBusinessResponseDto,
} from '../shared';

/** Flags forwarded to `apiClient` for public/cookie-authenticated calls. */
export interface GoogleOAuthTransportOptions {
  readonly requiresAuth?: boolean;
  readonly silent?: boolean;
}

/** Response envelope produced by the API's `TransformInterceptor`. */
export interface GoogleOAuthEnvelope<T> {
  readonly success?: boolean;
  readonly data?: T;
}

/**
 * Transport surface the client needs. Kept structural so unit tests can inject
 * a fake without touching the real browser/fetch stack.
 */
export interface GoogleOAuthHttpTransport {
  get<T>(
    endpoint: string,
    options?: GoogleOAuthTransportOptions,
  ): Promise<T | GoogleOAuthEnvelope<T>>;
  post<T>(
    endpoint: string,
    body: unknown,
    options?: GoogleOAuthTransportOptions,
  ): Promise<T | GoogleOAuthEnvelope<T>>;
  lookupBusinessTaxId(taxId: string): Promise<{ name: string; address: string | null } | null>;
}

/**
 * `apiClient` resolves the full `{ success, data, meta }` envelope while the
 * Google feature contracts describe `data` only. Accept both shapes so mock
 * transports (unit tests) and the real client stay interchangeable.
 */
export function unwrapEnvelope<T>(payload: T | GoogleOAuthEnvelope<T>): T {
  if (typeof payload === 'object' && payload !== null) {
    const candidate = payload as GoogleOAuthEnvelope<T>;
    if (candidate.success === true && 'data' in payload) {
      return candidate.data as T;
    }
  }
  return payload as T;
}

/**
 * C11 — frontend client for `/api/v1/auth/google/*`.
 *
 * The config/login/register routes are public: they must be called with
 * `requiresAuth: false` so `apiClient` never attempts a refresh on `/login`
 * or `/register`. They still unwrap `ApiResponse<T>.data`. The link route is
 * authenticated and keeps the default refresh behaviour. Errors stay silent
 * because each screen renders its own message. Refresh tokens are never read
 * here: the browser only receives the HttpOnly `orca_refresh` cookie.
 */
export class HttpGoogleOAuthApiClient implements GoogleOAuthApiPort {
  constructor(private readonly transport: GoogleOAuthHttpTransport = apiClient) {}

  async getConfig(): Promise<GooglePublicConfigDto> {
    return unwrapEnvelope(
      await this.transport.get<GooglePublicConfigDto>('/v1/auth/google/config', {
        requiresAuth: false,
        silent: true,
      }),
    );
  }

  async loginWithGoogle(input: GoogleLoginRequestDto): Promise<GoogleLoginResponseDto> {
    return unwrapEnvelope(
      await this.transport.post<GoogleLoginResponseDto>('/v1/auth/google/login', input, {
        requiresAuth: false,
        silent: true,
      }),
    );
  }

  async registerWithGoogle(
    input: RegisterGoogleBusinessRequestDto,
  ): Promise<RegisterGoogleBusinessResponseDto> {
    return unwrapEnvelope(
      await this.transport.post<RegisterGoogleBusinessResponseDto>(
        '/v1/auth/google/register',
        input,
        { requiresAuth: false, silent: true },
      ),
    );
  }

  async linkGoogleAccount(input: GoogleLinkRequestDto): Promise<GoogleLinkResponseDto> {
    return unwrapEnvelope(
      await this.transport.post<GoogleLinkResponseDto>('/v1/auth/google/link', input, {
        requiresAuth: true,
        silent: true,
      }),
    );
  }

  async lookupBusinessTaxId(
    taxId: string,
  ): Promise<{ readonly name: string; readonly address: string } | null> {
    const result = await this.transport.lookupBusinessTaxId(taxId.trim());
    return normalizeBusinessTaxLookup(result);
  }
}
