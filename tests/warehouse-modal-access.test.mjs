import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, Modal, access, messages;
before(async () => {
  messages = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8'));
  server = await createServer({
    configFile: false,
    envFile: false,
    plugins: [
      react(),
      {
        name: 'warehouse-modal-boundaries',
        enforce: 'pre',
        resolveId(id) {
          if (id.endsWith('/hooks/useAccess')) return '\0test-warehouse-access';
          if (id.endsWith('/Common/Modal/Modal')) return '\0test-modal-portal';
        },
        load(id) {
          if (id === '\0test-warehouse-access')
            return `
            import { can } from '/src/lib/accessPolicy.ts';
            let roles = [];
            export const setRoles = (value) => { roles = value; };
            export const useAccess = () => ({ can: (capability) => can(roles, capability) });
          `;
          if (id === '\0test-modal-portal')
            return `
            import { createElement } from 'react';
            export default function Modal({isOpen, title, children}) {
              return isOpen ? createElement('section', {'aria-label': title}, children) : null;
            }
          `;
        },
      },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ AddWarehouseModal: Modal } = await server.ssrLoadModule(
    '/src/features/catalog/components/AddWarehouseModal.tsx',
  ));
  access = await server.ssrLoadModule('\0test-warehouse-access');
});
after(async () => {
  await server?.close();
});

function render(roles, warehouse) {
  access.setRoles(roles);
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'en', timeZone: 'Asia/Ho_Chi_Minh', messages },
      createElement(Modal, { isOpen: true, warehouse, onClose() {}, onSuccess() {} }),
    ),
  );
}

test('Manager can open the edit form while warehouse creation stays denied', () => {
  const markup = render(['WAREHOUSE_MANAGER'], { id: '00000000-0000-4000-8000-000000000001' });
  assert.match(markup, /Edit warehouse/);
  assert.match(markup, /Save changes/);
  assert.match(markup, /id="warehouse-code"[^>]*readOnly/);
  assert.equal(render(['WAREHOUSE_MANAGER'], null), '');
});

test('Admin can create warehouses while Manager metadata editing stays denied', () => {
  assert.match(render(['ORCA_ADMIN'], null), /Create warehouse/);
  assert.equal(render(['ORCA_ADMIN'], { id: '00000000-0000-4000-8000-000000000001' }), '');
});

test('seller and warehouse staff cannot open either warehouse mutation form', () => {
  for (const role of ['SELLER_OWNER', 'SELLER_STAFF', 'WAREHOUSE_STAFF']) {
    assert.equal(render([role], null), '');
    assert.equal(render([role], { id: '00000000-0000-4000-8000-000000000001' }), '');
  }
});
