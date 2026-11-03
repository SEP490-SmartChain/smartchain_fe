import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, Workspace, ReadError, access, policy, ApiError, messages;
before(async () => {
  messages = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8'));
  server = await createServer({
    configFile: false,
    envFile: false,
    plugins: [
      react(),
      {
        name: 'inventory-ui-role-fixture',
        enforce: 'pre',
        resolveId(id) {
          if (id.endsWith('/hooks/useAccess')) return '\0inventory-role-fixture';
        },
        load(id) {
          if (id === '\0inventory-role-fixture')
            return `
          import { can, getEffectiveRoles } from '/src/lib/accessPolicy.ts';
          let roles = [], actorScope = null;
          export function setActor(value, scope) { roles = getEffectiveRoles(value, scope); actorScope = scope; }
          export function useAccess() { return { actorScope, can: (capability) => can(roles, capability) }; }
        `;
        },
      },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ InventoryWorkspace: Workspace } = await server.ssrLoadModule(
    '/src/features/inventory/components/InventoryWorkspace.tsx',
  ));
  ({ InventoryReadError: ReadError } = await server.ssrLoadModule(
    '/src/features/inventory/components/InventoryReadError.tsx',
  ));
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  access = await server.ssrLoadModule('\0inventory-role-fixture');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  await server?.close();
});
function render(component, props) {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'en', messages, timeZone: 'UTC' },
      createElement(component, props),
    ),
  );
}
const expected = {
  SELLER_OWNER: ['stock', 'positions', 'expiry', 'ledger'],
  SELLER_STAFF: ['stock', 'positions'],
  WAREHOUSE_MANAGER: ['positions', 'expiry', 'ledger'],
  OPS_DISPATCHER: ['ledger'],
  ORCA_ADMIN: [],
  WAREHOUSE_STAFF: [],
  ORCA_ACCOUNTANT: [],
};
for (const [role, tabs] of Object.entries(expected)) {
  test(`${role} only sees views supported by the endpoint contract`, () => {
    const scope = role.startsWith('SELLER_') ? 'TENANT' : 'PLATFORM';
    access.setActor([role], scope);
    const html = render(Workspace);
    for (const tab of ['stock', 'positions', 'expiry', 'ledger', 'reservations']) {
      assert.equal(html.includes(`id="inventory-${tab}"`), tabs.includes(tab), tab);
    }
    if (tabs.length)
      assert.match(html, new RegExp(`id="inventory-${tabs[0]}"[^>]*aria-selected="true"`));
    assert.equal(
      policy.can(policy.getEffectiveRoles([role], scope), 'inventory.stocks.view'),
      scope === 'TENANT',
    );
  });
}
for (const [roles, scope] of [
  [['SELLER_OWNER', 'WAREHOUSE_MANAGER'], 'TENANT'],
  [['SELLER_OWNER'], 'PLATFORM'],
  [['SELLER_OWNER'], null],
  [['SUPER_ADMIN'], 'PLATFORM'],
  [['UNKNOWN'], 'TENANT'],
]) {
  test(`invalid actor ${roles.join('+')} / ${scope} has no inventory reads`, () => {
    access.setActor(roles, scope);
    const html = render(Workspace);
    assert.doesNotMatch(html, /role="tab"/);
    assert.equal(
      policy.can(policy.getEffectiveRoles(roles, scope), 'inventory.stocks.view'),
      false,
    );
  });
}
test('403 explains denied access without suggesting retry or logout', () => {
  const html = render(ReadError, {
    error: new ApiError('Forbidden', 403, 'AUTH.FORBIDDEN'),
    title: 'Load error',
    onRetry() {},
  });
  assert.match(html, /You do not have permission to view this inventory/);
  assert.doesNotMatch(html, /<button|Load error/);
});
test('network and server failures remain retryable', () => {
  for (const status of [0, 503]) {
    const html = render(ReadError, {
      error: new ApiError('Failure', status, 'HTTP.ERROR'),
      title: 'Load error',
      onRetry() {},
    });
    assert.match(html, /Load error/);
    assert.match(html, /Retry/);
  }
});
