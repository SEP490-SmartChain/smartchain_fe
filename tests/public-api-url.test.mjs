import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let buildPublicApiUrl;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ buildPublicApiUrl } = await server.ssrLoadModule('/src/lib/publicApiUrl.ts'));
});

after(async () => {
  await server?.close();
});

test('joins the configured public API base URL and an endpoint path', () => {
  assert.equal(
    buildPublicApiUrl('/v1/ingest/products', 'https://api.smartchain.vn/api'),
    'https://api.smartchain.vn/api/v1/ingest/products',
  );
});

test('ignores trailing and leading slashes around the join', () => {
  assert.equal(
    buildPublicApiUrl('v1/ingest/products', 'https://api.smartchain.vn/api/'),
    'https://api.smartchain.vn/api/v1/ingest/products',
  );
});

test('keeps an explicit port of a public API', () => {
  assert.equal(
    buildPublicApiUrl('/v1/ingest/products', 'https://api.smartchain.vn:8443/api'),
    'https://api.smartchain.vn:8443/api/v1/ingest/products',
  );
});

for (const [label, baseUrl] of [
  ['missing', undefined],
  ['empty', ''],
  ['blank', '   '],
  ['a relative path an ERP cannot call', '/api'],
  ['plain HTTP, which would expose the key', 'http://api.smartchain.vn/api'],
  ['localhost', 'https://localhost:3000/api'],
  ['a .localhost subdomain', 'https://app.localhost/api'],
  ['an IPv4 loopback address', 'https://127.0.0.1/api'],
  ['an IPv6 loopback address', 'https://[::1]/api'],
  ['the unspecified address', 'https://0.0.0.0/api'],
  ['a 10.x private address', 'https://10.0.0.5/api'],
  ['a 192.168.x private address', 'https://192.168.1.10/api'],
  ['a 172.16-31.x private address', 'https://172.20.4.2/api'],
  ['a non-HTTP scheme', 'ftp://api.smartchain.vn/api'],
  ['a script URL', 'javascript:alert(1)'],
  ['not a URL', 'api.smartchain.vn'],
]) {
  test(`returns null when the base URL is ${label}`, () => {
    assert.equal(buildPublicApiUrl('/v1/ingest/products', baseUrl), null);
  });
}
