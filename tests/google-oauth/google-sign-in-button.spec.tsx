import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NextIntlClientProvider } from 'next-intl';

import {
  C07_COMPONENTS,
  C07_HOOKS,
  GoogleSignInButton,
  useGoogleIdentityServices,
} from '@/features/google-oauth/features/google-sign-in-button';
import viMessages from '../../messages/vi.json';
import { renderGoogleSignInButton } from '@/features/google-oauth/features/google-sign-in-button/lib/googleIdentityServices';

const messages = {
  ...viMessages,
  Auth: {
    ...viMessages.Auth,
    google_sign_in: 'Tiếp tục với Google',
    google_sign_in_loading: 'Đang kết nối Google…',
    google_or_divider: 'Hoặc',
  },
};

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      {children}
    </NextIntlClientProvider>
  );
}

function renderButton(props: {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  loading?: boolean;
}): string {
  return renderToStaticMarkup(withIntl(createElement(GoogleSignInButton, props)));
}

function IdentityServicesProbe() {
  const { ready, error } = useGoogleIdentityServices({
    clientId: '1234567890-orca-user.apps.googleusercontent.com',
    enabled: true,
    onCredential: () => {},
  });
  return createElement('span', null, `${ready ? 'ready' : 'idle'}:${error ?? 'none'}`);
}

describe('google-sign-in-button exports', () => {
  test('publishes the C07 component and hook arrays', () => {
    assert.deepEqual([...C07_COMPONENTS], [GoogleSignInButton]);
    assert.deepEqual([...C07_HOOKS], [useGoogleIdentityServices]);
  });
});

describe('GoogleSignInButton', () => {
  test('renders an accessible SDK button host and the "Hoặc" divider', () => {
    const html = renderButton({ onCredential: () => {} });

    assert.match(html, /Tiếp tục với Google/);
    assert.match(html, /Hoặc/);
    assert.match(html, /aria-label="Tiếp tục với Google"/);
    assert.doesNotMatch(html, /<button/);
  });

  test('reflects the disabled and loading states', () => {
    const disabled = renderButton({ onCredential: () => {}, disabled: true });
    assert.match(disabled, /disabled=""/);

    const loading = renderButton({ onCredential: () => {}, loading: true });
    assert.match(loading, /Đang kết nối Google/);
    assert.match(loading, /aria-busy="true"/);
    assert.match(loading, /disabled=""/);
  });
});

test('renders the official account chooser button without invoking One Tap', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let cleared = false;
  let rendered = false;
  const parent = {
    replaceChildren: () => {
      cleared = true;
    },
    getBoundingClientRect: () => ({ width: 520 }),
  } as unknown as HTMLElement;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      google: {
        accounts: {
          id: {
            prompt: () => {
              throw new Error('One Tap must not be used for the sign-in button');
            },
            renderButton: (
              host: HTMLElement,
              options: { width: number; text: string; locale: string },
            ) => {
              assert.equal(host, parent);
              assert.equal(cleared, true);
              assert.equal(options.width, 400);
              assert.equal(options.text, 'continue_with');
              assert.equal(options.locale, 'vi');
              rendered = true;
            },
          },
        },
      },
    },
  });
  try {
    renderGoogleSignInButton(parent, 'vi');
    assert.equal(rendered, true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('useGoogleIdentityServices SSR safety', () => {
  test('renders idle without touching window.google on the server', () => {
    const html = renderToStaticMarkup(withIntl(createElement(IdentityServicesProbe)));

    assert.equal(html, '<span>idle:none</span>');
  });
});
