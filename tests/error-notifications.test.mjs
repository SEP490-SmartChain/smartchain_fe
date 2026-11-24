import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';
import ts from 'typescript';
import { createServer } from 'vite';

let server;
let notifyInvalidForm;
let notifyInlineError;
let useLocaleStore;
let Input;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ notifyInvalidForm, notifyInlineError } = await server.ssrLoadModule(
    '/src/lib/errorNotifications.ts',
  ));
  ({ useLocaleStore } = await server.ssrLoadModule('/src/stores/localeStore.ts'));
  ({ Input } = await server.ssrLoadModule('/src/components/Common/Input/Input.tsx'));
});

after(async () => server?.close());

test('a field-level error renders as an inline alert linked to the invalid input', () => {
  const markup = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'en', timeZone: 'UTC', messages: { Notifications: { dismiss: 'Dismiss' } } },
      createElement(Input, {
        id: 'quantity',
        error: 'Enter a positive quantity',
        'aria-invalid': false,
      }),
    ),
  );

  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /aria-describedby="quantity-error"/);
  assert.match(markup, /role="alert"[^>]+id="quantity-error"/);
  assert.match(markup, /Enter a positive quantity/);
});

test('invalid submissions show a localized alert and reuse one notification', (t) => {
  const showError = t.mock.method(toast, 'error', () => {});
  useLocaleStore.setState({ locale: 'vi' });
  notifyInvalidForm();
  useLocaleStore.setState({ locale: 'en' });
  notifyInvalidForm();

  const [[vi, viOptions], [en, enOptions]] = showError.mock.calls.map((call) => call.arguments);
  assert.equal(vi, 'Thông tin nhập chưa hợp lệ');
  assert.equal(en, 'Check the information entered');
  assert.equal(enOptions.id, viOptions.id);
});

test('an inline error opens an alert after an identical notification is dismissed', (t) => {
  const showError = t.mock.method(toast, 'error', () => {});
  const getToasts = t.mock.method(toast, 'getToasts', () => [
    { id: 42, type: 'error', title: 'Could not save' },
  ]);

  notifyInlineError('Could not save', false);
  assert.equal(showError.mock.callCount(), 0);

  getToasts.mock.mockImplementation(() => []);
  notifyInlineError('Could not save', false);
  assert.deepEqual(showError.mock.calls[0].arguments, ['Could not save']);
});

test('compact field messages do not stack above the form validation summary', (t) => {
  const showError = t.mock.method(toast, 'error', () => {});
  notifyInvalidForm();
  const [, { id }] = showError.mock.calls[0].arguments;
  t.mock.method(toast, 'getToasts', () => [{ id, type: 'error' }]);

  notifyInlineError('Invalid email', true);
  assert.equal(showError.mock.callCount(), 1);
});

test('native validation stores the message for the same control and clears it once corrected', () => {
  const source = readFileSync(
    new URL('../src/hooks/useNativeFieldError.ts', import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  let currentMessage = '';
  const useState = () => [
    currentMessage,
    (next) => {
      currentMessage = next;
    },
  ];
  new Function('require', 'exports', outputText)((name) => {
    assert.equal(name, 'react');
    return { useState };
  }, exports);

  exports
    .useNativeFieldError()
    .handleInvalid({ currentTarget: { validationMessage: 'Enter a number' } });
  assert.equal(exports.useNativeFieldError().nativeError, 'Enter a number');
  exports.useNativeFieldError().handleInput({ currentTarget: { validationMessage: '' } });
  assert.equal(exports.useNativeFieldError().nativeError, '');
});
