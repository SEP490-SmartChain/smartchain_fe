import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { NextIntlClientProvider } from 'next-intl';

import { getPostLoginPath } from '@/lib/authRedirect';
import { ApiError } from '@/services/apiClient';
import type { AuthSession } from '@/stores/authStore';
import {
  C08_COMPONENTS,
  C08_HOOKS,
  GoogleLoginFlow,
  executeGoogleLogin,
  resolveGoogleLoginOutcome,
  useGoogleLogin,
  type GoogleLoginNavigator,
} from '@/features/google-oauth/features/google-login-flow';
import {
  FakeGoogleOAuthApiClient,
  makeCanonicalAuthUser,
  makeCanonicalGoogleOnboardingProfile,
  type GoogleLoginResponseDto,
  type GoogleOAuthApiPort,
} from '@/features/google-oauth/shared';
import viMessages from '../../messages/vi.json';

const messages = {
  ...viMessages,
  Auth: {
    ...viMessages.Auth,
    google_sign_in: 'Tiếp tục với Google',
    google_sign_in_loading: 'Đang kết nối Google…',
    google_or_divider: 'Hoặc',
    google_error_generic: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  },
};

const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.canonical-id-token';

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      {children}
    </NextIntlClientProvider>
  );
}

interface NavigationCall {
  path: string;
  options?: { readonly replace?: boolean; readonly state?: unknown };
}

function makeNavigator() {
  const calls: NavigationCall[] = [];
  const navigate: GoogleLoginNavigator = (path, options) => {
    calls.push({ path, ...(options ? { options } : {}) });
  };
  return { calls, navigate };
}

function makeWorkspaceRequiredApi(): GoogleOAuthApiPort {
  return {
    getConfig: async () => ({ enabled: true, clientId: 'client-id' }),
    loginWithGoogle: async () => {
      throw new ApiError('Workspace is required', 409, 'AUTH.WORKSPACE_REQUIRED');
    },
    registerWithGoogle: async () => {
      throw new Error('not used');
    },
    linkGoogleAccount: async () => {
      throw new Error('not used');
    },
    lookupBusinessTaxId: async () => null,
  };
}

function makeTokenRejectedApi(): GoogleOAuthApiPort {
  return {
    ...makeWorkspaceRequiredApi(),
    loginWithGoogle: async () => {
      throw new ApiError('Google token is invalid', 401, 'AUTH.GOOGLE_TOKEN_INVALID');
    },
  };
}

describe('google-login-flow exports', () => {
  test('publishes the C08 component and hook arrays', () => {
    assert.deepEqual([...C08_COMPONENTS], [GoogleLoginFlow]);
    assert.deepEqual([...C08_HOOKS], [useGoogleLogin]);
  });
});

describe('resolveGoogleLoginOutcome', () => {
  test('maps AUTHENTICATED to an in-memory session', () => {
    const outcome: GoogleLoginResponseDto = {
      status: 'AUTHENTICATED',
      accessToken: 'jwt-access-token-canonical',
      expiresIn: 900,
      user: makeCanonicalAuthUser(),
    };

    assert.deepEqual(resolveGoogleLoginOutcome(outcome), {
      kind: 'authenticated',
      session: {
        accessToken: 'jwt-access-token-canonical',
        expiresIn: 900,
        user: makeCanonicalAuthUser(),
      },
    });
  });

  test('maps ONBOARDING_REQUIRED to /register with the verified profile', () => {
    const googleProfile = makeCanonicalGoogleOnboardingProfile();
    const outcome: GoogleLoginResponseDto = {
      status: 'ONBOARDING_REQUIRED',
      onboardingToken: 'onboarding.canonical-token',
      expiresIn: 900,
      googleProfile,
    };

    assert.deepEqual(resolveGoogleLoginOutcome(outcome), {
      kind: 'onboarding',
      path: '/register',
      state: {
        googleOnboarding: {
          onboardingToken: 'onboarding.canonical-token',
          googleProfile,
        },
      },
    });
  });
});

describe('executeGoogleLogin', () => {
  test('stores the session and navigates to the role landing page', async () => {
    const api = new FakeGoogleOAuthApiClient();
    const { calls, navigate } = makeNavigator();
    const sessions: AuthSession[] = [];
    const errors: Array<string | undefined> = [];
    let workspaceRequired = 0;

    await executeGoogleLogin({
      api,
      idToken: ID_TOKEN,
      navigate,
      setSession: (session) => sessions.push(session),
      onWorkspaceRequired: () => {
        workspaceRequired += 1;
      },
      onError: (message) => errors.push(message),
      rememberSession: true,
    });

    assert.equal(api.lastLoginInput?.idToken, ID_TOKEN);
    assert.equal(api.lastLoginInput?.rememberSession, true);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.accessToken, 'jwt-access-token-canonical');
    assert.equal(calls[0]?.path, getPostLoginPath(makeCanonicalAuthUser(), null));
    assert.equal(calls[0]?.options?.replace, true);
    assert.equal(errors.length, 0);
    assert.equal(workspaceRequired, 0);
  });

  test('forwards ONBOARDING_REQUIRED to /register without creating a session', async () => {
    const api = new FakeGoogleOAuthApiClient();
    api.nextLoginOutcome = {
      status: 'ONBOARDING_REQUIRED',
      onboardingToken: 'onboarding.canonical-token',
      expiresIn: 900,
      googleProfile: makeCanonicalGoogleOnboardingProfile(),
    };
    const { calls, navigate } = makeNavigator();
    const sessions: AuthSession[] = [];

    await executeGoogleLogin({
      api,
      idToken: ID_TOKEN,
      navigate,
      setSession: (session) => sessions.push(session),
      onWorkspaceRequired: () => {},
      onError: () => {},
      workspaceSlug: 'orca-fashion',
    });

    assert.equal(api.lastLoginInput?.workspaceSlug, 'orca-fashion');
    assert.equal(sessions.length, 0);
    assert.equal(calls[0]?.path, '/register');
    assert.deepEqual(calls[0]?.options?.state, {
      googleOnboarding: {
        onboardingToken: 'onboarding.canonical-token',
        googleProfile: makeCanonicalGoogleOnboardingProfile(),
      },
    });
  });

  test('treats 409 AUTH.WORKSPACE_REQUIRED as a recoverable branch', async () => {
    const { calls, navigate } = makeNavigator();
    const sessions: AuthSession[] = [];
    const errors: Array<string | undefined> = [];
    let workspaceRequired = 0;

    await executeGoogleLogin({
      api: makeWorkspaceRequiredApi(),
      idToken: ID_TOKEN,
      navigate,
      setSession: (session) => sessions.push(session),
      onWorkspaceRequired: () => {
        workspaceRequired += 1;
      },
      onError: (message) => errors.push(message),
    });

    assert.equal(workspaceRequired, 1);
    assert.equal(errors.length, 0);
    assert.equal(sessions.length, 0);
    assert.equal(calls.length, 0);
  });

  test('reports other API errors through onError', async () => {
    const { calls, navigate } = makeNavigator();
    const errors: Array<string | undefined> = [];

    await executeGoogleLogin({
      api: makeTokenRejectedApi(),
      idToken: ID_TOKEN,
      navigate,
      setSession: () => {},
      onWorkspaceRequired: () => {},
      onError: (message) => errors.push(message),
    });

    assert.deepEqual(errors, ['Google token is invalid']);
    assert.equal(calls.length, 0);
  });
});

describe('GoogleLoginFlow', () => {
  test('renders null while the feature is disabled or missing a client id', () => {
    for (const config of [
      { enabled: false, clientId: 'client-id' },
      { enabled: true, clientId: null },
    ]) {
      const html = renderToStaticMarkup(
        withIntl(
          createElement(GoogleLoginFlow, {
            api: new FakeGoogleOAuthApiClient(),
            config,
            onWorkspaceRequired: () => {},
            onError: () => {},
          }),
        ),
      );
      assert.equal(html, '');
    }
  });

  test('renders the Google control when the public config is enabled', () => {
    const html = renderToStaticMarkup(
      withIntl(
        createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          createElement(GoogleLoginFlow, {
            api: new FakeGoogleOAuthApiClient(),
            config: { enabled: true, clientId: 'client-id' },
            onWorkspaceRequired: () => {},
            onError: () => {},
          }),
        ),
      ),
    );

    assert.match(html, /Tiếp tục với Google/);
    assert.match(html, /Hoặc/);
  });
});
