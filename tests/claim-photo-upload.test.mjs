import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server, Upload;
const messages = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ClaimPhotoUpload: Upload } = await server.ssrLoadModule(
    '/src/features/claims/components/ClaimPhotoUpload.tsx',
  ));
});
after(async () => server?.close());
function render(props = {}) {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'vi', messages },
      createElement(Upload, {
        id: 'test-photo',
        inputRef: createRef(),
        busy: false,
        fileName: null,
        onFile() {},
        ...props,
      }),
    ),
  );
}
test('claim photos expose a visible named choose action, bounded image guidance and grouped upload area', () => {
  const html = render();
  assert.match(html, /role="group"/);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /Chọn ảnh/);
  assert.match(html, /JPEG, PNG hoặc WebP/);
  assert.match(html, /5 MB/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
});
test('pending photo preserves its filename and retry while processing disables selection', () => {
  const html = render({ busy: true, fileName: 'qa-demo.png', onRetry() {} });
  assert.match(html, /qa-demo\.png/);
  assert.match(html, /Tải lại ảnh đã chọn/);
  assert.match(html, /role="status"/);
  assert.match(html, /<button[^>]*disabled/);
});
test('storage failures have actionable messages in both UI languages', () => {
  for (const locale of ['vi', 'en']) {
    const catalog = JSON.parse(
      readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
    );
    assert.ok(catalog.Claims.errors.STORAGE_UNAVAILABLE?.length > 40);
    assert.notEqual(catalog.Claims.errors.STORAGE_UNAVAILABLE, catalog.Claims.errors.generic);
  }
});
