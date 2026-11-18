import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

function sourceTree(path) {
  return ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

const schemaTree = sourceTree('../src/features/orders/schemas/pickingSchema.ts');
const schemaDeclaration = schemaTree.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.text === 'pickWaveFormSchema',
    ),
);
const schemaExpression = schemaDeclaration.declarationList.declarations[0].initializer;
const schema = new Function('z', `return (${schemaExpression.getText(schemaTree)});`)(z);

function renderWaveForm(values, previewCalls, submissions) {
  const tree = sourceTree('../src/features/orders/components/PickingWorkspace.tsx');
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WaveForm',
  );
  const bindings = {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity),
      }),
    },
    useTranslations: () => Object.assign((key) => key, { has: () => false }),
    useState: (initial) => [initial, () => {}],
    useEffect() {},
    useForm: () => ({
      register: (name) => ({ name }),
      watch: (name) => values[name],
      getValues: () => ({ ...values }),
      trigger: async (names) =>
        schema.pick(Object.fromEntries(names.map((name) => [name, true]))).safeParse(values)
          .success,
      handleSubmit: (submit) => async () => {
        const result = schema.safeParse(values);
        if (result.success) await submit(result.data);
      },
      formState: { errors: {} },
    }),
    zodResolver: () => ({}),
    pickWaveFormSchema: schema,
    currentCutoffInput: () => '2026-11-05T08:00',
    ApiError: class ApiError extends Error {},
    pickingApi: {
      previewWave: async (...args) => {
        previewCalls.push(args);
        return { proposedOrders: 1, proposedParcels: 2, firstParcelTooLarge: false };
      },
    },
    Card: 'Card',
    CardContent: 'CardContent',
    Input: 'Input',
    Select: 'Select',
    Button: 'Button',
    Alert: 'Alert',
  };
  const code = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const WaveForm = new Function(...Object.keys(bindings), `${code}; return WaveForm;`)(
    ...Object.values(bindings),
  );
  return WaveForm({
    warehouseId: 'warehouse-a',
    staff: [],
    disabled: false,
    onSubmit: (data) => submissions.push(data),
  });
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

test('wave preview accepts cutoff and capacity before assignment, while creation still requires assignee', async () => {
  const values = { cutoffAt: '2026-11-05T08:00:00Z', maxParcels: 20, assigneeId: '' };
  const previewCalls = [];
  const submissions = [];
  const ui = renderWaveForm(values, previewCalls, submissions);
  const previewButton = nodes(ui).find(
    (node) => node.type === 'Button' && node.children.includes('previewWave'),
  );
  previewButton.props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(previewCalls, [['warehouse-a', '2026-11-05T08:00:00.000Z', 20]]);

  const form = nodes(ui).find((node) => node.type === 'form');
  await form.props.onSubmit();
  assert.equal(submissions.length, 0, 'creation must reject the missing assignee');
  values.assigneeId = '00000000-0000-4000-8000-000000000001';
  await form.props.onSubmit();
  assert.deepEqual(submissions, [values]);
});

test('wave preview still validates capacity before requesting an estimate', async () => {
  const previewCalls = [];
  const ui = renderWaveForm(
    { cutoffAt: '2026-11-05T08:00:00Z', maxParcels: 51, assigneeId: '' },
    previewCalls,
    [],
  );
  nodes(ui)
    .find((node) => node.type === 'Button' && node.children.includes('previewWave'))
    .props.onClick();
  await new Promise(setImmediate);
  assert.equal(previewCalls.length, 0);
});

test('wave creation does not require a preview first and defaults the cut-off to now', async () => {
  const values = {
    cutoffAt: '2026-11-05T08:00:00Z',
    maxParcels: 20,
    assigneeId: '00000000-0000-4000-8000-000000000001',
  };
  const submissions = [];
  const ui = renderWaveForm(values, [], submissions);
  const create = nodes(ui).find(
    (node) => node.type === 'Button' && node.children.includes('createWave'),
  );

  assert.equal(create.props.disabled, false, 'create is enabled without a preview');
  await nodes(ui)
    .find((node) => node.type === 'form')
    .props.onSubmit();
  assert.deepEqual(submissions, [values]);
});

test('a single operator holding both warehouse roles can claim a wave for themself', () => {
  const source = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes("const manager = can('warehouse.picking.manage');"));
  assert.ok(
    source.includes(
      "manager && can('warehouse.picking.confirm') && staff.some((person) => person.id === actorId)",
    ),
    'claiming requires both the Manager and Staff capability and a live staff assignment',
  );
  assert.ok(source.includes('assigneeId: actorId'));
});

test('the lot scan is optional in the form so the server decides when the bin implies the lot', () => {
  const tree = sourceTree('../src/features/orders/schemas/pickingSchema.ts');
  const declaration = tree.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((d) => d.name.text === 'pickScanSchema'),
  );
  const scanSchema = new Function(
    'z',
    `return (${declaration.declarationList.declarations[0].initializer.getText(tree)});`,
  )(z);
  const scan = { binScan: 'BIN', skuScan: 'SKU', lotScan: '', qty: 1 };

  assert.equal(scanSchema.safeParse(scan).success, true);
  assert.equal(scanSchema.safeParse({ ...scan, binScan: '' }).success, false);
});

function pickingSession(result) {
  const tree = sourceTree('../src/features/orders/components/PickingWorkspace.tsx');
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'PickingScope',
  );
  const line = { id: 'line', remainingQty: 1, orderCode: 'SHARED-CODE', parcelNo: 1 };
  const state = [
    [],
    'warehouse-a',
    [],
    null,
    null,
    'wave',
    { waveCode: 'wave', status: 'IN_PROGRESS', lines: [line], nextCursor: 'another-page' },
    null,
    [],
    null,
    null,
    false,
    '',
    '',
    0,
    null,
    null,
    false,
  ];
  let index = 0;
  const navigations = [];
  const bindings = {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity),
      }),
    },
    useAuthStore: (selector) => selector({ user: { userId: 'staff' } }),
    useLocale: () => 'en',
    useTranslations: () => Object.assign((key) => key, { has: () => false }),
    useAccess: () => ({ can: () => true }),
    useState: () => [state[index++], () => {}],
    useRef: (current) => ({ current }),
    useEffect() {},
    useNavigate: () => (target) => navigations.push(target),
    pickingApi: { execute: async () => result },
    persistFulfillmentPending() {},
    clearFulfillmentPending() {},
    shortWaveReference: (value) => value,
    Card: 'Card',
    CardContent: 'CardContent',
    Select: 'Select',
    Button: 'Button',
    Alert: 'Alert',
    Badge: 'Badge',
    PickLineCard: 'PickLineCard',
    PickLineLabels: 'PickLineLabels',
    WaveForm: 'WaveForm',
  };
  const code = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = new Function(...Object.keys(bindings), `${code}; return PickingScope;`)(
    ...Object.values(bindings),
  );
  return { ui: render(), navigations };
}

test('finishing a visible line never opens packing while the server reports other parcel holds', async () => {
  const { ui, navigations } = pickingSession({
    remainingQty: 0,
    fulfillmentOrderId: 'parcel-a',
    fulfillmentStatus: 'PICKING',
  });
  await nodes(ui)
    .find((node) => node.type === 'PickLineCard')
    .props.execute({ path: 'pick-lines/line/confirm', payload: {} });
  assert.deepEqual(navigations, []);
});

test('a server-confirmed picked parcel opens packing by its unique ID and current warehouse', async () => {
  const { ui, navigations } = pickingSession({
    remainingQty: 0,
    fulfillmentOrderId: 'parcel-a',
    fulfillmentStatus: 'PICKED',
  });
  await nodes(ui)
    .find((node) => node.type === 'PickLineCard')
    .props.execute({ path: 'pick-lines/line/confirm', payload: {} });
  assert.deepEqual(navigations, [
    { pathname: '/warehouse/packing', search: 'warehouse=warehouse-a&fulfillment=parcel-a' },
  ]);
});

test('a legacy scan replay without parcel confirmation does not infer completion from one page', async () => {
  const { ui, navigations } = pickingSession({ remainingQty: 0 });
  await nodes(ui)
    .find((node) => node.type === 'PickLineCard')
    .props.execute({ path: 'pick-lines/line/confirm', payload: {} });
  assert.deepEqual(navigations, []);
});
