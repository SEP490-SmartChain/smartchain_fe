import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, signedStorageUrl;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ signedStorageUrl } = await server.ssrLoadModule('/src/lib/signedStorageUrl.ts'));
});
after(async () => server?.close());

test('LAN development upload uses same-origin proxy while preserving the signed path and query', () => {
  const input =
    'http://localhost:9000/private/receipt/a%20b.png?X-Amz-Signature=synthetic&X-Amz-SignedHeaders=host';
  assert.equal(
    signedStorageUrl(input, true, 'http://192.168.2.69:2324'),
    'http://192.168.2.69:2324/__private-storage/private/receipt/a%20b.png?X-Amz-Signature=synthetic&X-Amz-SignedHeaders=host',
  );
  assert.equal(signedStorageUrl(input, false, 'https://app.example.test'), input);
  assert.equal(
    signedStorageUrl('https://storage.example.test/private.png', true, 'http://localhost:2324'),
    'https://storage.example.test/private.png',
  );
});
test('private storage rejects credentials, arbitrary LAN targets and unsafe schemes', () => {
  for (const url of [
    'http://192.168.2.99:9000/private',
    'https://user:password@storage.example.test/file',
    'file:///private/file',
    'data:text/plain,invalid',
  ]) {
    assert.throws(() => signedStorageUrl(url, true, 'http://192.168.2.69:2324'));
  }
});
