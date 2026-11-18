import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function component(name, bindings) {
  const source = readFileSync(
    new URL('../src/features/orders/components/PackingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const tree = ts.createSourceFile(
    'packing.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = tree.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  );
  const code = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), code + '; return ' + name)(
    ...Object.values(bindings),
  );
}
function nodes(root) {
  const result = [];
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    result.push(n);
    for (const child of n.children ?? []) walk(child);
  }
  walk(root);
  return result;
}
function bindings(state) {
  let index = 0;
  return {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity),
      }),
    },
    useState: () => [state[index++], () => {}],
    useEffect() {},
    useRef: (current) => ({ current }),
    useSearchParams: () => [new URLSearchParams(), () => {}],
    useAuthStore: (selector) => selector({ user: { userId: 'test-actor' }, revision: 0 }),
    loadFulfillmentPending: () => null,
    persistFulfillmentPending() {},
    clearFulfillmentPending() {},
    createUuid: () => 'test-operation',
    isRejectedOperation: () => true,
    useTranslations: () =>
      Object.assign((key, values) => (values ? key + JSON.stringify(values) : key), {
        has: () => true,
      }),
    useAccess: () => ({ can: () => true }),
    PageHeader: 'PageHeader',
    Card: 'Card',
    Select: 'Select',
    Button: 'Button',
    Input: 'Input',
    Alert: 'Alert',
    Link: 'Link',
    PackingForm: 'PackingForm',
    pickingApi: {},
    packingApi: {},
    packingFormSchema: {},
    packCommandSchema: {},
    zodResolver: () => ({}),
    QrCodeImage: 'QrCodeImage',
    styles: {},
  };
}
const first = {
  id: 'parcel-a',
  orderCode: 'RH-REAL-A',
  sequenceNo: 1,
  status: 'PICKED',
  version: 1,
};
const second = { ...first, id: 'parcel-b', orderCode: 'RH-REAL-B' };
test('packing queue distinguishes orders sharing parcel sequence and exposes selected state', () => {
  const ui = component(
    'PackingSession',
    bindings([[], 'warehouse', { items: [first, second] }, first, '', false, 0]),
  )();
  const buttons = nodes(ui).filter((n) => n.type === 'Button' && n.props.onClick);
  assert.ok(JSON.stringify(buttons).includes('RH-REAL-A'));
  assert.ok(JSON.stringify(buttons).includes('RH-REAL-B'));
  assert.ok(buttons.some((n) => n.props['aria-pressed'] === true));
});
test('packing gives an explicit instruction before a parcel is selected', () => {
  const ui = component(
    'PackingSession',
    bindings([[], 'warehouse', { items: [first] }, null, '', false, 0]),
  )();
  assert.ok(JSON.stringify(ui).includes('chooseParcel'));
});

test('packing handoff fetches the exact parcel even when another seller shares its order code', async () => {
  const effects = [],
    calls = [],
    updates = [];
  const state = [
    [],
    'warehouse-a',
    { items: [{ ...first, id: 'other-seller', orderCode: 'SAME' }], nextCursor: 'page2' },
    null,
    '',
    false,
    null,
    0,
  ];
  const b = bindings(state);
  let stateIndex = 0;
  b.useState = () => {
    const index = stateIndex++;
    return [state[index], (value) => updates.push({ index, value })];
  };
  const params = new URLSearchParams('warehouse=warehouse-a&fulfillment=target-parcel&tab=keep');
  let nextParams;
  b.useSearchParams = () => [
    params,
    (change) => {
      nextParams = change(params);
    },
  ];
  b.useEffect = (effect) => effects.push(effect);
  b.packingApi = {
    detail: async (...args) => {
      calls.push(args);
      return { ...first, id: 'target-parcel' };
    },
  };
  component('PackingSession', b)();
  const cleanup = effects.at(-1)();
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['warehouse-a', 'target-parcel']);
  assert.ok(updates.some(({ index, value }) => index === 3 && value?.id === 'target-parcel'));
  assert.equal(nextParams.toString(), 'tab=keep');
  cleanup();
});

test('packing handoff selects only an assigned target warehouse and ignores stale responses after leaving it', async () => {
  const effects = [],
    updates = [];
  let resolve;
  const b = bindings([
    [],
    'warehouse-a',
    { items: [], nextCursor: null },
    null,
    '',
    false,
    null,
    0,
  ]);
  let index = 0;
  b.useState = () => {
    const slot = index++;
    return [
      [[], 'warehouse-a', { items: [], nextCursor: null }, null, '', false, null, 0][slot],
      (value) => updates.push({ slot, value }),
    ];
  };
  b.useEffect = (effect) => effects.push(effect);
  b.useSearchParams = () => [
    new URLSearchParams('warehouse=warehouse-a&fulfillment=parcel-a'),
    () => {},
  ];
  b.pickingApi = { warehouses: async () => [{ id: 'warehouse-b' }, { id: 'warehouse-a' }] };
  b.packingApi = {
    detail: () =>
      new Promise((done) => {
        resolve = done;
      }),
  };
  component('PackingSession', b)();
  const cleanupDirectory = effects[0]();
  await new Promise(setImmediate);
  assert.ok(updates.some(({ slot, value }) => slot === 1 && value === 'warehouse-a'));
  const cleanup = effects.at(-1)();
  cleanup();
  resolve({ ...first, id: 'parcel-a' });
  await new Promise(setImmediate);
  assert.ok(!updates.some(({ slot, value }) => slot === 3 && value?.id === 'parcel-a'));
  cleanupDirectory();
});

test('packing refuses to open a handoff under a different selected warehouse', () => {
  const effects = [],
    calls = [];
  const b = bindings([
    [],
    'warehouse-b',
    { items: [], nextCursor: null },
    null,
    '',
    false,
    null,
    0,
  ]);
  b.useEffect = (effect) => effects.push(effect);
  b.useSearchParams = () => [
    new URLSearchParams('warehouse=warehouse-a&fulfillment=parcel-a'),
    () => {},
  ];
  b.packingApi = { detail: (...args) => calls.push(args) };
  component('PackingSession', b)();
  effects.at(-1)();
  assert.deepEqual(calls, []);
});
test('packing count uses exact required quantity and does not show material quantity without material', () => {
  const b = bindings([false, '']);
  b.useForm = () => ({
    register: (name) => ({ name }),
    watch: () => '',
    handleSubmit: (f) => f,
    formState: { errors: {} },
  });
  const detail = {
    ...first,
    orderCode: first.orderCode,
    items: [{ id: 'line', sku: 'SKU-A', name: 'Product A', qty: 2 }],
    shipments: [],
  };
  const ui = component(
    'PackingForm',
    b,
  )({ warehouse: 'warehouse', detail, writable: true, onPacked() {} });
  const inputs = nodes(ui).filter((n) => n.type === 'Input');
  const quantity = inputs.find((n) => n.props.name === 'contents.0.qty');
  assert.equal(quantity.props.max, 2);
  assert.equal(quantity.props.required, true);
  assert.ok(quantity.props.label.includes('Product A'));
  assert.ok(!inputs.some((n) => n.props.name === 'materialQty'));
});

function reviewDetail(status, shipments = []) {
  return {
    ...first,
    status,
    items: [{ id: 'line', sku: 'SKU-A', name: 'Product A', qty: 2 }],
    packing:
      status === 'PICKED'
        ? []
        : [
            {
              id: 'packing-a',
              actualWeightG: 750,
              actualLengthCm: '20',
              actualWidthCm: '15',
              actualHeightCm: '10',
            },
          ],
    shipments,
  };
}

function renderReview(detail, writable) {
  const b = bindings([false, '']);
  b.useForm = () => ({
    register: (name) => ({ name }),
    watch: () => '',
    handleSubmit: (f) => f,
    formState: { errors: {} },
  });
  return component(
    'PackingForm',
    b,
  )({
    actorId: 'test-actor',
    warehouse: 'warehouse',
    detail,
    writable,
    recoveryOnly: false,
    onPacked() {},
  });
}

test('packed and label-waiting queue selections retain their detail without enabling recovery', () => {
  for (const status of ['PACKED', 'PACKED_AWAITING_LABEL', 'LABEL_VERIFYING']) {
    const detail = reviewDetail(status);
    const b = bindings([
      [],
      'warehouse',
      { items: [detail], nextCursor: null },
      detail,
      '',
      false,
      null,
      0,
    ]);
    const ui = component('PackingSession', b)();
    const form = nodes(ui).find((n) => n.type === 'PackingForm');
    assert.ok(form, `${status} should keep the parcel detail visible`);
    assert.equal(form.props.detail, detail);
    assert.equal(form.props.recoveryOnly, false);
  }
});

test('Manager sees picked contents awaiting Staff without a packing form or false completion', () => {
  const ui = renderReview(reviewDetail('PICKED'), false);
  const text = JSON.stringify(ui);
  assert.ok(text.includes('awaitingStaff'));
  assert.ok(text.includes('Product A'));
  assert.ok(text.includes('SKU-A'));
  assert.ok(text.includes('expected'));
  assert.ok(!text.includes('packedHint'));
  assert.ok(!text.includes('confirmPack'));
  assert.ok(!nodes(ui).some((n) => n.type === 'form' || n.type === 'Input'));
});

test('packed details show recorded measures and label guidance without offering another pack', () => {
  for (const status of ['PACKED', 'PACKED_AWAITING_LABEL', 'LABEL_VERIFYING']) {
    const ui = renderReview(reviewDetail(status), true);
    const text = JSON.stringify(ui);
    assert.ok(text.includes('Product A'));
    assert.ok(text.includes('750'));
    assert.ok(text.includes('actualLengthCm'));
    assert.ok(text.includes('awaitingLabel'));
    assert.ok(!nodes(ui).some((n) => n.type === 'form' || n.type === 'Input'));
  }
  const ui = renderReview(
    reviewDetail('PACKED', [{ bookingState: 'CONFIRMED', trackingNumber: 'TRACK-123' }]),
    false,
  );
  const text = JSON.stringify(ui);
  assert.ok(text.includes('TRACK-123'));
  assert.ok(text.includes('printLabel'));
  assert.ok(text.includes('handoverNextStep'));
  assert.ok(nodes(ui).some((n) => n.type === 'Link' && n.props.to === '/warehouse/handover'));
  assert.ok(!text.includes('awaitingLabel'));
});
