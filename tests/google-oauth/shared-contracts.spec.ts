import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FakeGoogleOAuthApiClient,
  googleLoginRequestSchema,
  googleOnboardingRegisterSchema,
  makeCanonicalAuthUser,
  makeCanonicalGoogleOnboardingProfile,
  type GoogleLoginResponseDto,
  type GoogleOnboardingFormData,
} from '@/features/google-oauth/shared';

const validOnboarding: GoogleOnboardingFormData = {
  onboardingToken: 'onboarding.canonical-token-value',
  email: 'new.seller@gmail.com',
  fullName: 'Lê Thị Chủ Shop Mới',
  phone: '0901234567',
  taxId: '0312345678',
  companyName: 'Công ty TNHH Thời Trang ORCA',
  agreeToTerms: true,
};

describe('googleLoginRequestSchema', () => {
  test('accepts a canonical Google login payload', () => {
    const result = googleLoginRequestSchema.safeParse({
      idToken: 'eyJhbGciOiJSUzI1NiJ9.canonical-id-token',
      rememberSession: true,
    });
    assert.equal(result.success, true);
  });

  test('rejects an empty or truncated id token', () => {
    assert.equal(googleLoginRequestSchema.safeParse({ idToken: 'short' }).success, false);
    assert.equal(googleLoginRequestSchema.safeParse({ idToken: '' }).success, false);
  });
});

describe('googleOnboardingRegisterSchema', () => {
  test('accepts the canonical Vietnamese business payload', () => {
    assert.equal(googleOnboardingRegisterSchema.safeParse(validOnboarding).success, true);
  });

  test('accepts an optional 13-digit tax id with branch suffix', () => {
    const result = googleOnboardingRegisterSchema.safeParse({
      ...validOnboarding,
      taxId: '0312345678-001',
    });
    assert.equal(result.success, true);
  });

  test('allows omitting the tax id', () => {
    const { taxId: _taxId, ...withoutTaxId } = validOnboarding;
    assert.equal(googleOnboardingRegisterSchema.safeParse(withoutTaxId).success, true);
  });

  test('rejects invalid Vietnamese phone numbers', () => {
    for (const phone of ['0123456789', '090123456', '84901234567', '09012345678']) {
      const result = googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        phone,
      });
      assert.equal(result.success, false, `expected ${phone} to be rejected`);
    }
  });

  test('rejects malformed tax ids', () => {
    for (const taxId of ['123', '03123456789', '0312345678-01', 'abc1234567']) {
      const result = googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        taxId,
      });
      assert.equal(result.success, false, `expected ${taxId} to be rejected`);
    }
  });

  test('enforces company and full name length bounds', () => {
    assert.equal(
      googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        companyName: 'A',
      }).success,
      false,
    );
    assert.equal(
      googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        companyName: 'x'.repeat(151),
      }).success,
      false,
    );
    assert.equal(
      googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        fullName: 'A',
      }).success,
      false,
    );
    assert.equal(
      googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        fullName: 'x'.repeat(101),
      }).success,
      false,
    );
  });

  test('requires explicit terms acceptance', () => {
    assert.equal(
      googleOnboardingRegisterSchema.safeParse({
        ...validOnboarding,
        agreeToTerms: false,
      }).success,
      false,
    );
  });
});

describe('canonical Google OAuth fixtures', () => {
  test('builds a tenant-scoped AuthUser with additive overrides', () => {
    const user = makeCanonicalAuthUser();
    assert.equal(user.actorScope, 'TENANT');
    assert.deepEqual(user.roles, ['SELLER_OWNER']);
    assert.equal(user.email, 'owner@orcafashion.vn');

    const overridden = makeCanonicalAuthUser({ email: 'other@orcafashion.vn' });
    assert.equal(overridden.email, 'other@orcafashion.vn');
    assert.equal(user.email, 'owner@orcafashion.vn');
  });

  test('builds the onboarding profile shown in step 3', () => {
    const profile = makeCanonicalGoogleOnboardingProfile();
    assert.equal(profile.email, 'new.seller@gmail.com');
    assert.match(profile.avatarUrl ?? '', /^https:\/\//);
  });

  test('fake API client returns discriminated login outcomes', async () => {
    const api = new FakeGoogleOAuthApiClient();
    const config = await api.getConfig();
    assert.equal(config.enabled, true);

    const authenticated: GoogleLoginResponseDto = await api.loginWithGoogle({
      idToken: 'eyJhbGciOiJSUzI1NiJ9.canonical-id-token',
      rememberSession: true,
    });
    assert.equal(authenticated.status, 'AUTHENTICATED');
    assert.equal(api.lastLoginInput?.rememberSession, true);

    api.nextLoginOutcome = {
      status: 'ONBOARDING_REQUIRED',
      onboardingToken: 'onboarding.token',
      expiresIn: 900,
      googleProfile: makeCanonicalGoogleOnboardingProfile(),
    };
    const onboarding = await api.loginWithGoogle({ idToken: 'eyJhbGciOiJSUzI1NiJ9.other' });
    assert.equal(onboarding.status, 'ONBOARDING_REQUIRED');
    if (onboarding.status === 'ONBOARDING_REQUIRED') {
      assert.equal(onboarding.expiresIn, 900);
      assert.equal(onboarding.googleProfile.email, 'new.seller@gmail.com');
    }
  });

  test('fake API client looks up a canonical tax id', async () => {
    const api = new FakeGoogleOAuthApiClient();
    const found = await api.lookupBusinessTaxId('0312345678');
    assert.equal(found?.name, 'CÔNG TY TNHH LOGISTICS ORCA VIỆT NAM');
    assert.equal(await api.lookupBusinessTaxId('0000000000'), null);
  });

  test('fake API client registers a business and auto-logs in', async () => {
    const api = new FakeGoogleOAuthApiClient();
    const outcome = await api.registerWithGoogle({
      onboardingToken: validOnboarding.onboardingToken,
      fullName: validOnboarding.fullName,
      phone: validOnboarding.phone,
      companyName: validOnboarding.companyName,
      taxId: validOnboarding.taxId,
    });
    assert.equal(outcome.status, 'AUTHENTICATED');
    assert.equal(outcome.tenantSlug, 'cong-ty-moi-orca');
    assert.deepEqual(api.lastRegisterInput?.taxId, '0312345678');
  });
});
