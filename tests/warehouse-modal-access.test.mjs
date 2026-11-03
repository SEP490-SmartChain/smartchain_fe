import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, Modal, Details, ZoneForm, access, messages;
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
  ({ WarehouseDetails: Details } = await server.ssrLoadModule(
    '/src/features/catalog/components/WarehouseDetails.tsx',
  ));
  ({ ZoneForm } = await server.ssrLoadModule(
    '/src/features/catalog/components/WarehouseLayoutForms.tsx',
  ));
  access = await server.ssrLoadModule('\0test-warehouse-access');
});
after(async () => {
  await server?.close();
});

test('inbound storage setup cannot create a receiving or quarantine zone by mistake', () => {
  const markup = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'en', timeZone: 'Asia/Ho_Chi_Minh', messages },
      createElement(ZoneForm, {
        zone: null,
        fixedType: 'STORAGE',
        onClose() {},
        async onSave() {},
      }),
    ),
  );
  // RHF attaches the selected value through its client ref; SSR verifies the available choices.
  const types = [...markup.matchAll(/<option[^>]*value="([A-Z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(types, ['STORAGE']);
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
  const markup = render(['WAREHOUSE_MANAGER'], {
    id: '00000000-0000-4000-8000-000000000001',
    region: 'CENTRAL',
  });
  assert.match(markup, /Edit warehouse/);
  assert.match(markup, /Save changes/);
  assert.match(markup, /id="warehouse-code"[^>]*readOnly/);
  assert.equal(render(['WAREHOUSE_MANAGER'], null), '');
});

test('Admin can create warehouses while Manager metadata editing stays denied', () => {
  assert.match(render(['ORCA_ADMIN'], null), /Create warehouse/);
  assert.equal(render(['ORCA_ADMIN'], { id: '00000000-0000-4000-8000-000000000001' }), '');
});

test('warehouse creation has one region selector with all three valid regions', () => {
  const markup = render(['ORCA_ADMIN'], null);
  assert.equal((markup.match(/<select[^>]*name="region"/g) ?? []).length, 1);
  for (const region of ['NORTH', 'CENTRAL', 'SOUTH']) {
    assert.match(markup, new RegExp(`<option[^>]*value="${region}"`));
  }
});

test('seller and warehouse staff cannot open either warehouse mutation form', () => {
  for (const role of ['SELLER_OWNER', 'SELLER_STAFF', 'WAREHOUSE_STAFF']) {
    assert.equal(render([role], null), '');
    assert.equal(render([role], { id: '00000000-0000-4000-8000-000000000001' }), '');
  }
});

test('warehouse detail navigation preserves Manager, Admin and Ops action boundaries', () => {
  const warehouse = {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'WH-DN-01',
    name: 'Da Nang warehouse',
    address: 'Da Nang',
    region: 'CENTRAL',
    latitude: 16,
    longitude: 108,
    dailyCapacity: 100,
    timeZone: 'Asia/Ho_Chi_Minh',
    operatingStartMinute: 480,
    operatingEndMinute: 1440,
    cutoffMinute: 840,
    status: 'ACTIVE',
  };
  for (const role of ['WAREHOUSE_MANAGER', 'ORCA_ADMIN', 'OPS_DISPATCHER']) {
    access.setRoles([role]);
    const markup = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'en', timeZone: 'Asia/Ho_Chi_Minh', messages },
        createElement(Details, {
          id: 'warehouse-details-test',
          warehouse,
          onClose() {},
          onEdit() {},
          onSaved() {},
        }),
      ),
    );
    assert.doesNotMatch(markup, /Warehouse directory|aria-label="Back/);
    assert.match(markup, /Warehouse details · WH-DN-01/);
    assert.match(markup, /Collapse details for warehouse WH-DN-01/);
    assert.match(
      markup,
      /<section[^>]*id="warehouse-details-test"[^>]*aria-labelledby="warehouse-details-test-title"/,
    );
    assert.match(markup, /Business calendar/);
    assert.match(markup, /Downtime schedule/);
    assert.equal(markup.includes('Edit warehouse'), role === 'WAREHOUSE_MANAGER');
    assert.equal(markup.includes('Storage areas'), role !== 'OPS_DISPATCHER');
    assert.match(markup, /role="tablist"/);
    assert.match(markup, /role="tab"[^>]*id="[^"]+-overview"[^>]*aria-selected="true"/);
    assert.match(markup, /role="tab"[^>]*id="[^"]+-calendar"[^>]*aria-selected="false"/);
    assert.match(markup, /role="tabpanel"[^>]*aria-labelledby="[^"]+-overview"[^>]*tabindex="0">/);
    assert.match(markup, /24:00/);
    assert.doesNotMatch(markup, /NaN|Invalid Date/);
  }
});
