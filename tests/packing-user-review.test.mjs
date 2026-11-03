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
    zodResolver: () => ({}),
    encodeLabelBarcode: () => null,
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
