import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let server, cards, storage, auth, messages;
const worker = '00000000-0000-4000-8000-000000000001';
const otherWorker = '00000000-0000-4000-8000-000000000002';
const task = {
  id: '00000000-0000-4000-8000-000000000003',
  version: 1,
  status: 'OPEN',
  qty: 10,
  confirmedQty: 0,
  assigneeId: null,
  fromBinCode: 'RECV-01',
  toBinCode: 'STORE-01',
  sku: 'TV',
  productName: 'Television',
  lotCode: 'RCV-TEST',
};

before(async () => {
  messages = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8'));
  server = await createServer({
    configFile: false,
    envFile: false,
    plugins: [
      react(),
      {
        name: 'putaway-ui-identity',
        enforce: 'pre',
        resolveId(id) {
          if (id.endsWith('/stores/authStore')) return '\0putaway-ui-auth';
        },
        load(id) {
          if (id === '\0putaway-ui-auth')
            return `
              let user = null;
              export const setUser = (value) => { user = value; };
              export const useAuthStore = Object.assign(
                (selector) => selector({ user }), { getState: () => ({ user }) }
              );
            `;
        },
      },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  cards = await server.ssrLoadModule('/src/features/inbound/components/PutawayWorkCards.tsx');
  ({ WarehouseStorageSetup: storage } = await server.ssrLoadModule(
    '/src/features/catalog/components/WarehouseStorageSetup.tsx',
  ));
  auth = await server.ssrLoadModule('\0putaway-ui-auth');
});
after(async () => server?.close());

function render(component, props, roles, actorScope = 'PLATFORM') {
  auth.setUser({ userId: worker, roles, actorScope });
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        NextIntlClientProvider,
        { locale: 'en', timeZone: 'Asia/Ho_Chi_Minh', messages },
        createElement(component, props),
      ),
    ),
  );
}
const waiting = (roles, reason = 'CAPACITY_REQUIRED', disabled = false, scope) =>
  render(cards.PutawayWaitingActions, { reason, disabled, onPrepare() {} }, roles, scope);
const work = (roles, change = {}, disabled = false, scope) =>
  render(
    cards.PutawayTaskCard,
    {
      task: { ...task, ...change },
      staff: roles.includes('WAREHOUSE_MANAGER')
        ? [{ id: otherWorker, fullName: 'Warehouse worker' }]
        : [],
      selected: false,
      disabled,
      onOpen() {},
    },
    roles,
    scope,
  );

test('capacity blocker lets Manager arrange storage in place while Staff waits', () => {
  const manager = waiting(['WAREHOUSE_MANAGER']);
  assert.match(manager, /QC approved\. Arrange storage first/);
  assert.match(manager, /<button(?![^>]*disabled="")[^>]*>Arrange putaway<\/button>/);
  assert.doesNotMatch(manager, /Assign Staff<\/button>|Claim this task<\/button>/);
  const staff = waiting(['WAREHOUSE_STAFF']);
  assert.match(staff, /<button[^>]*disabled=""[^>]*>Claim this task<\/button>/);
  assert.match(staff, /Waiting for a manager/);
  assert.doesNotMatch(staff, /Arrange putaway|Assign Staff/);
});

test('unplanned quantities never enable a physical task command', () => {
  for (const role of ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF']) {
    for (const reason of [
      'STOCK_REQUIRED',
      'PLANNING',
      'QUARANTINED',
      'INELIGIBLE',
      'SOURCE_UNAVAILABLE',
    ]) {
      const markup = waiting([role], reason);
      assert.match(markup, /<button[^>]*disabled=""/);
      assert.match(markup, /No task created yet/);
      assert.doesNotMatch(markup, /Manage bins/);
    }
  }
});

test('Manager can assign or reassign with a worker name and cannot physically confirm', () => {
  const open = work(['WAREHOUSE_MANAGER']);
  assert.match(open, />Assign Staff<\/button>/);
  assert.doesNotMatch(open, />Open task<\/button>|>Put away<\/button>/);
  const assigned = work(['WAREHOUSE_MANAGER'], { status: 'ASSIGNED', assigneeId: otherWorker });
  assert.match(assigned, /Worker: Warehouse worker/);
  assert.match(assigned, />Reassign<\/button>/);
  assert.doesNotMatch(assigned, />Put away<\/button>/);
});

test('Staff can claim open work or put away own assignment, never another worker assignment', () => {
  assert.match(work(['WAREHOUSE_STAFF']), />Claim this task<\/button>/);
  const own = work(['WAREHOUSE_STAFF'], { status: 'ASSIGNED', assigneeId: worker });
  assert.match(own, /Worker: You/);
  assert.match(own, />Put away<\/button>/);
  const other = work(['WAREHOUSE_STAFF'], { status: 'ASSIGNED', assigneeId: otherWorker });
  assert.match(other, /Another worker has claimed this task/);
  assert.doesNotMatch(other, /<button|Warehouse worker|00000000-0000-4000-8000-000000000002/);
  for (const status of ['COMPLETED', 'CANCELLED'])
    assert.doesNotMatch(work(['WAREHOUSE_STAFF'], { status }), /<button/);
});

test('unrelated, legacy and mixed actor scopes receive no assignment or storage setup controls', () => {
  for (const roles of [
    ['ORCA_ADMIN'],
    ['OPS_DISPATCHER'],
    ['ORCA_ACCOUNTANT'],
    ['SELLER_OWNER'],
    ['SELLER_STAFF'],
    ['warehouse_staff'],
    [],
    ['WAREHOUSE_STAFF', 'SELLER_OWNER'],
  ]) {
    const scope = roles[0]?.startsWith('SELLER') ? 'TENANT' : 'PLATFORM';
    assert.equal(waiting(roles, 'CAPACITY_REQUIRED', false, scope), '');
    assert.doesNotMatch(work(roles, {}, false, scope), /<button/);
  }
});

test('pending work disables task replacement and warehouse navigation', () => {
  assert.match(work(['WAREHOUSE_MANAGER'], {}, true), /<button[^>]*disabled=""/);
  assert.match(
    waiting(['WAREHOUSE_MANAGER'], 'CAPACITY_REQUIRED', true),
    /<button[^>]*disabled=""[^>]*>Arrange putaway<\/button>/,
  );
});

test('public storage setup denies every non-Manager actor before rendering layout controls', () => {
  const props = {
    warehouseId: task.id,
    warehouseCode: 'WH-TEST',
    onEditingChange() {},
    onSaved() {},
  };
  for (const role of [
    'WAREHOUSE_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    assert.equal(
      render(storage, props, [role], role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM'),
      '',
    );
  }
  const markup = render(storage, props, ['WAREHOUSE_MANAGER']);
  assert.match(markup, /role="status"/);
  assert.doesNotMatch(markup, /<button|<form|ACTIVE/);
});
