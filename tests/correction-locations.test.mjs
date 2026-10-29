import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(
  new URL('../src/features/orders/components/OrderLifecycleActions.tsx', import.meta.url),
  'utf8',
);
const tree = ts.createSourceFile(
  'OrderLifecycleActions.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const node = tree.statements.find(
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'CorrectionFields',
);
assert.ok(node);
const code = ts.transpileModule(node.getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const locations = [
  { type: 'PROVINCE', code: '01', name: 'Hà Nội' },
  { type: 'PROVINCE', code: '79', name: 'TP.HCM' },
  { type: 'WARD', code: '001', name: 'Ward Hanoi', parentCode: '01' },
  { type: 'WARD', code: '791', name: 'Ward HCM', parentCode: '79' },
];
function render({
  province = '01',
  ward = '001',
  loading = false,
  error = false,
  busy = false,
  items = locations,
} = {}) {
  const effects = [];
  const props = {
    busy,
    correction: {
      watch: (name) => (name === 'toProvinceCode' ? province : ward),
      register: (name, options) => ({ name, onChange: options?.onChange }),
      setValue: (...args) => effects.push(args),
      formState: { errors: {} },
    },
  };
  const bindings = {
    React: {
      Fragment: 'fragment',
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity).filter(Boolean),
      }),
    },
    useTranslations: () => (key) => key,
    useAuthStore: () => 'scope',
    orderScope: () => 'scope',
    useOrderLocations: () => ({
      locations: items,
      loading,
      error,
      retry: () => effects.push('retry'),
    }),
    Input: 'Input',
    Select: 'Select',
    Button: 'Button',
    Alert: 'Alert',
  };
  const view = new Function(...Object.keys(bindings), code + ';return CorrectionFields;')(
    ...Object.values(bindings),
  )(props);
  const all = [];
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    all.push(item);
    for (const child of item.children ?? []) walk(child);
  }
  walk(view);
  return {
    all,
    effects,
    save: all.find((v) => v.type === 'Button' && v.props.type === 'submit'),
    select: (name) => all.find((v) => v.type === 'Select' && v.props.name === name),
  };
}
test('correction shows location names and only wards in the selected province', () => {
  const r = render();
  assert.deepEqual(r.select('toProvinceCode').props.options, [
    { value: '01', label: 'Hà Nội' },
    { value: '79', label: 'TP.HCM' },
  ]);
  assert.deepEqual(r.select('toWardCode').props.options, [{ value: '001', label: 'Ward Hanoi' }]);
  assert.equal(r.save.props.disabled, false);
});
test('changing province clears the old ward before another correction can be saved', () => {
  const r = render();
  r.select('toProvinceCode').props.onChange();
  assert.deepEqual(r.effects, [['toWardCode', '']]);
  assert.equal(render({ province: '79', ward: '001' }).save.props.disabled, true);
  assert.equal(render({ province: '79', ward: '791' }).save.props.disabled, false);
});
for (const state of [{ loading: true }, { error: true }, { items: [] }, { busy: true }])
  test('correction blocks save for ' + JSON.stringify(state), () => {
    const r = render(state);
    assert.equal(r.save.props.disabled, true);
    if (state.error || state.items) {
      const retry = r.all.find((v) => v.type === 'Button' && v.props.type === 'button');
      assert.ok(retry);
      retry.props.onClick();
      assert.deepEqual(r.effects, ['retry']);
    }
  });
