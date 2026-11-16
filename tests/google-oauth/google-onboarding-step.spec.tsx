import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { NextIntlClientProvider } from 'next-intl';

import {
  C09_COMPONENTS,
  C09_HOOKS,
  GoogleOnboardingStep,
  buildGoogleOnboardingDefaults,
  useGoogleOnboarding,
} from '@/features/google-oauth/features/google-onboarding-step';
import {
  FakeGoogleOAuthApiClient,
  googleOnboardingRegisterSchema,
  makeCanonicalGoogleOnboardingProfile,
} from '@/features/google-oauth/shared';
import viMessages from '../../messages/vi.json';

const messages = {
  ...viMessages,
  Auth: {
    ...viMessages.Auth,
    google_onboarding_badge: 'Đã xác thực qua Google ({email})',
    google_onboarding_heading: 'Hoàn tất thông tin doanh nghiệp',
    google_onboarding_subheading: 'Chỉ cần thêm thông tin cửa hàng để bắt đầu bán hàng.',
    google_onboarding_submit: 'Tạo tài khoản doanh nghiệp',
    google_onboarding_submitting: 'Đang tạo tài khoản…',
    google_onboarding_no_password:
      'Tài khoản Google đã xác thực email nên bạn không cần tạo mật khẩu.',
    google_error_generic: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  },
};

const ONBOARDING_TOKEN = 'onboarding.canonical-token-value';

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      {children}
    </NextIntlClientProvider>
  );
}

describe('google-onboarding-step exports', () => {
  test('publishes the C09 component and hook arrays', () => {
    assert.deepEqual([...C09_COMPONENTS], [GoogleOnboardingStep]);
    assert.deepEqual([...C09_HOOKS], [useGoogleOnboarding]);
  });
});

describe('buildGoogleOnboardingDefaults', () => {
  test('prefills and trims the Google-verified identity fields', () => {
    const profile = makeCanonicalGoogleOnboardingProfile({
      fullName: '  Lê Thị Chủ Shop Mới  ',
      email: '  new.seller@gmail.com  ',
    });

    assert.deepEqual(buildGoogleOnboardingDefaults(profile), {
      fullName: 'Lê Thị Chủ Shop Mới',
      email: 'new.seller@gmail.com',
    });
  });

  test('fills a payload accepted by the frozen onboarding schema', () => {
    const profile = makeCanonicalGoogleOnboardingProfile();
    const defaults = buildGoogleOnboardingDefaults(profile);

    const parsed = googleOnboardingRegisterSchema.safeParse({
      onboardingToken: ONBOARDING_TOKEN,
      ...defaults,
      phone: '0901234567',
      taxId: '0312345678',
      companyName: 'Công ty TNHH Thời Trang ORCA',
      agreeToTerms: true,
    });
    assert.equal(parsed.success, true);

    const withoutTerms = googleOnboardingRegisterSchema.safeParse({
      onboardingToken: ONBOARDING_TOKEN,
      ...defaults,
      phone: '0901234567',
      companyName: 'Công ty TNHH Thời Trang ORCA',
      agreeToTerms: false,
    });
    assert.equal(withoutTerms.success, false);
  });
});

describe('GoogleOnboardingStep', () => {
  function renderStep(): {
    html: string;
    profile: ReturnType<typeof makeCanonicalGoogleOnboardingProfile>;
  } {
    const profile = makeCanonicalGoogleOnboardingProfile();
    const html = renderToStaticMarkup(
      withIntl(
        createElement(
          MemoryRouter,
          { initialEntries: ['/register'] },
          createElement(GoogleOnboardingStep, {
            api: new FakeGoogleOAuthApiClient(),
            onboardingToken: ONBOARDING_TOKEN,
            googleProfile: profile,
          }),
        ),
      ),
    );
    return { html, profile };
  }

  test('shows the Google verification badge and the business fields', () => {
    const { html, profile } = renderStep();

    assert.match(html, /Hoàn tất thông tin doanh nghiệp/);
    assert.match(html, /Tài khoản Google đã xác thực email/);
    assert.ok(html.includes(profile.email));
    assert.ok(
      html.includes(messages.Auth.google_onboarding_badge.replace('{email}', profile.email)),
    );
    assert.ok(html.includes(messages.Auth.phone_label));
    assert.ok(html.includes(messages.Auth.tax_id_label));
    assert.ok(html.includes(messages.Auth.company_name_label));
    assert.ok(html.includes(messages.Auth.agree_to_terms_label));
    assert.match(html, /name="onboardingToken"/);
    assert.match(html, /name="email"/);
    assert.match(html, /name="fullName"/);
  });

  test('never renders password or confirmation inputs', () => {
    const { html } = renderStep();

    assert.doesNotMatch(html, /type="password"/i);
    assert.doesNotMatch(html, /name="(?:password|confirmPassword)"/i);
    assert.doesNotMatch(html, /autocomplete="(?:current|new)-password"/i);
    assert.doesNotMatch(html, /name="password[A-Za-z]*"/i);
  });
});
