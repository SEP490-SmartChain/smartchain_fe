import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NextIntlClientProvider } from 'next-intl';

import { ApiError } from '@/services/apiClient';
import {
  C10_COMPONENTS,
  C10_HOOKS,
  GoogleProfileLinkCard,
  executeGoogleProfileLink,
  useGoogleProfileLink,
} from '@/features/google-oauth/features/google-profile-link';
import { FakeGoogleOAuthApiClient, type GoogleOAuthApiPort } from '@/features/google-oauth/shared';
import viMessages from '../../messages/vi.json';

const messages = {
  ...viMessages,
  Auth: {
    ...viMessages.Auth,
    google_link_heading: 'Liên kết Google',
    google_link_description: 'Liên kết tài khoản Google để đăng nhập nhanh hơn.',
    google_link_button: 'Liên kết Google',
    google_link_linking: 'Đang liên kết…',
    google_link_linked: 'Đã liên kết',
    google_link_success: 'Tài khoản Google đã được liên kết.',
    google_link_error: 'Không thể liên kết Google. Vui lòng thử lại.',
    google_link_conflict: 'Tài khoản Google này đã được liên kết ở nơi khác.',
    google_link_unlinked: 'Chưa liên kết',
  },
};

const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.canonical-id-token';

function makeBaseApi(): GoogleOAuthApiPort {
  return {
    getConfig: async () => ({ enabled: true, clientId: 'client-id' }),
    loginWithGoogle: async () => {
      throw new Error('not used');
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

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      {children}
    </NextIntlClientProvider>
  );
}

function renderCard(linked: boolean): string {
  return renderToStaticMarkup(
    withIntl(
      createElement(GoogleProfileLinkCard, {
        api: new FakeGoogleOAuthApiClient(),
        linked,
      }),
    ),
  );
}

describe('google-profile-link exports', () => {
  test('publishes the C10 component and hook arrays', () => {
    assert.deepEqual([...C10_COMPONENTS], [GoogleProfileLinkCard]);
    assert.deepEqual([...C10_HOOKS], [useGoogleProfileLink]);
  });
});

describe('executeGoogleProfileLink', () => {
  test('sends the expected user version and reports the linked identity', async () => {
    const api = new FakeGoogleOAuthApiClient();
    const outcome = await executeGoogleProfileLink({
      api,
      idToken: ID_TOKEN,
      expectedUserVersion: 7,
    });

    assert.equal(api.lastLinkInput?.idToken, ID_TOKEN);
    assert.equal(api.lastLinkInput?.expectedUserVersion, 7);
    assert.equal(outcome.kind, 'linked');
    if (outcome.kind === 'linked') {
      assert.equal(outcome.response.googleSubLinked, true);
      assert.equal(outcome.response.version, 8);
      assert.equal(outcome.response.linkedAt, '2026-11-15T14:00:00.000Z');
    }
  });

  test('maps AUTH.GOOGLE_IDENTITY_CONFLICT to a conflict outcome', async () => {
    const api: GoogleOAuthApiPort = {
      ...makeBaseApi(),
      linkGoogleAccount: async () => {
        throw new ApiError('Google identity conflict', 409, 'AUTH.GOOGLE_IDENTITY_CONFLICT');
      },
    };

    const outcome = await executeGoogleProfileLink({ api, idToken: ID_TOKEN });
    assert.deepEqual(outcome, { kind: 'conflict' });
  });

  test('maps other API failures to a failed outcome with the server message', async () => {
    const api: GoogleOAuthApiPort = {
      ...makeBaseApi(),
      linkGoogleAccount: async () => {
        throw new ApiError('Version is stale', 409, 'AUTH.VERSION_CONFLICT');
      },
    };

    assert.deepEqual(await executeGoogleProfileLink({ api, idToken: ID_TOKEN }), {
      kind: 'conflict',
    });

    const failing: GoogleOAuthApiPort = {
      ...makeBaseApi(),
      linkGoogleAccount: async () => {
        throw new ApiError('Internal failure', 500, 'COMMON.INTERNAL');
      },
    };
    assert.deepEqual(await executeGoogleProfileLink({ api: failing, idToken: ID_TOKEN }), {
      kind: 'failed',
      message: 'Internal failure',
    });
  });
});

describe('GoogleProfileLinkCard', () => {
  test('renders the unlinked state with an enabled-able link control', () => {
    const html = renderCard(false);

    assert.match(html, /Liên kết Google/);
    assert.match(html, /Chưa liên kết/);
    assert.match(html, /<button/);
    assert.match(html, /type="button"/);
    assert.doesNotMatch(html, /Tài khoản Google đã được liên kết/);
  });

  test('renders the linked state with the success message and no link button', () => {
    const html = renderCard(true);

    assert.match(html, /Đã liên kết/);
    assert.match(html, /Tài khoản Google đã được liên kết/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /Chưa liên kết/);
  });
});
