import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

const messages = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
const securityTitle = messages.Settings.security.replaceAll('&', '&amp;');
const roleCases = [
  ['ORCA_ADMIN', 'PLATFORM'],
  ['OPS_DISPATCHER', 'PLATFORM'],
  ['WAREHOUSE_MANAGER', 'PLATFORM'],
  ['WAREHOUSE_STAFF', 'PLATFORM'],
  ['ORCA_ACCOUNTANT', 'PLATFORM'],
  ['SELLER_OWNER', 'TENANT'],
  ['SELLER_STAFF', 'TENANT'],
];
let server, policy, access, SettingsPage;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    plugins: [
      react(),
      {
        name: 'settings-access-context',
        enforce: 'pre',
        resolveId(id) {
          if (id.endsWith('/hooks/useAccess')) return '\0test-settings-access';
          if (id.endsWith('/features/tenants')) return '\0test-other-settings-tabs';
        },
        load(id) {
          // Other tabs include browser-only PDF rendering; this suite renders the profile tab.
          if (id === '\0test-other-settings-tabs')
            return `
              export const ApiKeyManager = () => null;
              export const WebhookManager = () => null;
              export const SellerContractOnboarding = () => null;
            `;
          if (id === '\0test-settings-access')
            return `
              import { can, getEffectiveRoles } from '/src/lib/accessPolicy.ts';
              let roles = [];
              export function setPrincipal(codes, scope) {
                roles = getEffectiveRoles(codes, scope);
              }
              export const useAccess = () => ({ roles, can: (capability) => can(roles, capability) });
            `;
        },
      },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  access = await server.ssrLoadModule('\0test-settings-access');
  ({ default: SettingsPage } = await server.ssrLoadModule('/src/pages/workspace/SettingsPage.tsx'));
});

after(async () => {
  await server?.close();
});

function renderProfile(roles, scope) {
  access.setPrincipal(roles, scope);
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'vi', timeZone: 'Asia/Ho_Chi_Minh', messages },
      createElement(
        MemoryRouter,
        { initialEntries: ['/settings/profile'] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/settings/:tab', element: createElement(SettingsPage) }),
        ),
      ),
    ),
  );
}

for (const [role, scope] of roleCases) {
  test(`${role} has one profile tab and store details only when authorized`, () => {
    const roles = policy.getEffectiveRoles([role], scope);
    const expectedTabs =
      role === 'SELLER_OWNER' ? ['profile', 'api-keys', 'webhooks', 'contract'] : ['profile'];
    const navigation = policy.getSettingsNavigation(roles, 'profile');
    assert.deepEqual(navigation.tabs, expectedTabs);
    assert.equal(navigation.activeTab, 'profile');
    assert.equal(navigation.redirectTo, null);

    const markup = renderProfile([role], scope);
    assert.equal((markup.match(/role="tab"/g) ?? []).length, expectedTabs.length);
    assert.equal((markup.match(/>Hồ sơ<\/button>/g) ?? []).length, 1);
    assert.equal(markup.includes('Hồ sơ người bán'), false);
    assert.ok(markup.includes(messages.Settings.details));
    assert.ok(markup.includes(securityTitle));
    assert.equal(markup.includes(messages.Settings.generalTitle), role === 'SELLER_OWNER');

    const links = policy.getSearchLinks(roles, false);
    assert.equal(links.filter((link) => link.href === '/settings/profile').length, 1);
    assert.equal(
      links.some((link) => link.href === '/settings/general'),
      false,
    );
  });
}

test('store details sit between personal details and security in the merged profile', () => {
  const markup = renderProfile(['SELLER_OWNER'], 'TENANT');
  assert.ok(
    markup.indexOf(messages.Settings.details) < markup.indexOf(messages.Settings.generalTitle),
  );
  assert.ok(markup.indexOf(messages.Settings.generalTitle) < markup.indexOf(securityTitle));
});

test('legacy seller-profile links resolve to profile while retaining their owner-only guard', () => {
  for (const [role, scope] of roleCases) {
    const roles = policy.getEffectiveRoles([role], scope);
    const navigation = policy.getSettingsNavigation(roles, 'general');
    assert.equal(navigation.activeTab, 'profile');
    assert.equal(navigation.redirectTo, '/settings/profile');
    assert.equal(policy.isRouteAllowed(roles, '/settings/general'), role === 'SELLER_OWNER');
  }
});

test('settings selection falls back for invalid tabs and removed grants', () => {
  for (const requested of ['unknown', 'api-keys', 'webhooks', 'contract']) {
    const navigation = policy.getSettingsNavigation(['SELLER_STAFF'], requested);
    assert.deepEqual(navigation.tabs, ['profile']);
    assert.equal(navigation.activeTab, 'profile');
    assert.equal(navigation.redirectTo, '/settings/profile');
  }
  for (const tab of ['api-keys', 'webhooks', 'contract']) {
    const navigation = policy.getSettingsNavigation(['SELLER_OWNER'], tab);
    assert.equal(navigation.activeTab, tab);
    assert.equal(navigation.redirectTo, null);
  }
  assert.equal(policy.getSettingsNavigation(['SELLER_OWNER']).redirectTo, null);
  assert.equal(
    renderProfile(['SELLER_OWNER'], 'TENANT').includes(messages.Settings.generalTitle),
    true,
  );
  assert.equal(
    renderProfile(['SELLER_STAFF'], 'TENANT').includes(messages.Settings.generalTitle),
    false,
  );
});

test('settings tabs fail closed for missing, legacy, unknown and mixed actor scopes', () => {
  const cases = [
    [[], 'TENANT'],
    [['SELLER_OWNER'], null],
    [['SELLER_OWNER'], 'PLATFORM'],
    [['TENANT_ADMIN'], 'TENANT'],
    [['UNKNOWN'], 'PLATFORM'],
    [['SELLER_OWNER', 'ORCA_ADMIN'], 'TENANT'],
  ];
  for (const [codes, scope] of cases) {
    const roles = policy.getEffectiveRoles(codes, scope);
    assert.deepEqual(policy.getSettingsNavigation(roles).tabs, []);
    assert.equal(policy.can(roles, 'workspace.settings.manage'), false);
  }
  const roles = policy.getEffectiveRoles(['SELLER_OWNER', 'SELLER_STAFF'], 'TENANT');
  assert.deepEqual(policy.getSettingsNavigation(roles).tabs, [
    'profile',
    'api-keys',
    'webhooks',
    'contract',
  ]);
});
