import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  HttpGoogleOAuthApiClient,
  unwrapEnvelope,
  type GoogleOAuthHttpTransport,
  type GoogleOAuthTransportOptions,
} from '@/features/google-oauth/runtime/http-google-oauth.client';
import { normalizeBusinessTaxLookup } from '@/features/google-oauth/runtime/tax-lookup.mapping';
import {
  makeCanonicalAuthUser,
  makeCanonicalGoogleOnboardingProfile,
} from '@/features/google-oauth/shared';

interface RecordedCall {
  readonly kind: 'get' | 'post';
  readonly endpoint: string;
  readonly body?: unknown;
  readonly options?: GoogleOAuthTransportOptions;
}

function recordingTransport(payload: unknown): {
  transport: GoogleOAuthHttpTransport;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const transport: GoogleOAuthHttpTransport = {
    async get<T>(endpoint: string, options?: GoogleOAuthTransportOptions) {
      calls.push({ kind: 'get', endpoint, ...(options ? { options } : {}) });
      return payload as T | { data?: T };
    },
    async post<T>(endpoint: string, body: unknown, options?: GoogleOAuthTransportOptions) {
      calls.push({
        kind: 'post',
        endpoint,
        body,
        ...(options ? { options } : {}),
      });
      return payload as T | { data?: T };
    },
    async lookupBusinessTaxId() {
      return null;
    },
  };
  return { transport, calls };
}

describe('HttpGoogleOAuthApiClient envelope handling', () => {
  test('unwraps ApiResponse<T>.data from the real transport envelope', async () => {
    const { transport, calls } = recordingTransport({
      success: true,
      data: { enabled: true, clientId: 'client-123' },
      meta: { timestamp: '2026-11-15T14:00:00.000Z', path: '', requestId: '' },
    });

    const client = new HttpGoogleOAuthApiClient(transport);
    const config = await client.getConfig();

    assert.deepEqual(config, { enabled: true, clientId: 'client-123' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.endpoint, '/v1/auth/google/config');
    assert.deepEqual(calls[0]?.options, {
      requiresAuth: false,
      silent: true,
    });
  });

  test('passes public flags and unwraps login outcomes', async () => {
    const { transport, calls } = recordingTransport({
      success: true,
      data: {
        status: 'AUTHENTICATED',
        accessToken: 'jwt-access-token',
        expiresIn: 900,
        user: makeCanonicalAuthUser(),
      },
    });

    const client = new HttpGoogleOAuthApiClient(transport);
    const outcome = await client.loginWithGoogle({ idToken: 'google-id-token' });

    assert.equal(outcome.status, 'AUTHENTICATED');
    if (outcome.status === 'AUTHENTICATED') {
      assert.equal(outcome.accessToken, 'jwt-access-token');
    }
    assert.deepEqual(calls[0]?.options, {
      requiresAuth: false,
      silent: true,
    });
    assert.deepEqual(calls[0]?.body, { idToken: 'google-id-token' });
  });

  test('unwraps the onboarding branch and uses public register flags', async () => {
    const { transport, calls } = recordingTransport({
      success: true,
      data: {
        status: 'AUTHENTICATED',
        tenantId: '00000100-0000-4000-8000-000000000109',
        tenantSlug: 'cong-ty-moi-orca',
        accessToken: 'jwt-access-token',
        expiresIn: 900,
        user: makeCanonicalAuthUser(),
      },
    });

    const client = new HttpGoogleOAuthApiClient(transport);
    const outcome = await client.registerWithGoogle({
      onboardingToken: 'onboarding.token',
      fullName: 'Lê Thị Chủ Shop Mới',
      phone: '0901234567',
      companyName: 'Công ty TNHH Thời Trang ORCA',
    });

    assert.equal(outcome.tenantSlug, 'cong-ty-moi-orca');
    assert.equal(calls[0]?.endpoint, '/v1/auth/google/register');
    assert.deepEqual(calls[0]?.options, {
      requiresAuth: false,
      silent: true,
    });
  });

  test('keeps the authenticated flag for the Google link route', async () => {
    const { transport, calls } = recordingTransport({
      success: true,
      data: {
        userId: '00000200-0000-4000-8000-000000000101',
        tenantId: '00000100-0000-4000-8000-000000000101',
        email: 'owner@orcafashion.vn',
        googleSubLinked: true,
        linkedAt: '2026-11-15T14:00:00.000Z',
        version: 2,
      },
    });

    const client = new HttpGoogleOAuthApiClient(transport);
    const result = await client.linkGoogleAccount({ idToken: 'google-id-token' });

    assert.equal(result.googleSubLinked, true);
    assert.equal(result.version, 2);
    assert.deepEqual(calls[0]?.options, {
      requiresAuth: true,
      silent: true,
    });
  });

  test('accepts a bare DTO from mock transports (no envelope)', async () => {
    const { transport } = recordingTransport({
      enabled: false,
      clientId: null,
    });
    const client = new HttpGoogleOAuthApiClient(transport);
    assert.deepEqual(await client.getConfig(), {
      enabled: false,
      clientId: null,
    });
  });

  test('unwrapEnvelope leaves non-envelope payloads untouched', () => {
    assert.deepEqual(unwrapEnvelope({ enabled: true, clientId: 'x' }), {
      enabled: true,
      clientId: 'x',
    });
    assert.deepEqual(unwrapEnvelope({ success: true, data: { a: 1 } }), {
      a: 1,
    });
    assert.equal(unwrapEnvelope<number>(0), 0);
  });
});

describe('Google OAuth runtime mappings', () => {
  test('maps a tax lookup with an address', () => {
    assert.deepEqual(
      normalizeBusinessTaxLookup({
        name: '  CÔNG TY TNHH ORCA  ',
        address: ' Quận 1, TP.HCM ',
      }),
      { name: 'CÔNG TY TNHH ORCA', address: 'Quận 1, TP.HCM' },
    );
  });

  test('falls back to an empty address when the registry omits it', () => {
    assert.deepEqual(normalizeBusinessTaxLookup({ name: 'ORCA', address: null }), {
      name: 'ORCA',
      address: '',
    });
  });

  test('returns null for a missing or blank lookup', () => {
    assert.equal(normalizeBusinessTaxLookup(null), null);
    assert.equal(normalizeBusinessTaxLookup({ name: '   ', address: null }), null);
  });

  test('onboarding profile keeps the verified Google email', () => {
    const profile = makeCanonicalGoogleOnboardingProfile();
    assert.equal(profile.email, 'new.seller@gmail.com');
  });
});
