import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/orders/components/OrderPolicySettings.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(
  source.replace('function OrderPolicySession()', 'export function OrderPolicySession()'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } },
).outputText;

function mount({ dirty = true, enabled = true, fail = false } = {}) {
  const states = [],
    refs = [],
    calls = [],
    effects = [];
  let cursor = 0,
    refCursor = 0;
  const persisted = { holdRiskyCod: enabled, holdCodMinAmount: '1200000', version: 6 };
  const values = { holdRiskyCod: enabled, holdCodMinAmount: '1500000' };
  const form = {
    formState: { isDirty: dirty, dirtyFields: {}, errors: {} },
    register: (name) => ({ name }),
    handleSubmit: (fn) => () => fn(values),
    reset: (next, options) => {
      calls.push(['reset', next, options]);
      if (!options?.keepDirtyValues) form.formState.isDirty = false;
    },
  };
  const exports = {};
  const bindings = {
    react: {
      useId: () => 'policy-description',
      useEffect: (effect) => effects.push(effect),
      useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
      useState: (initial) => {
        const i = cursor++;
        if (!(i in states)) states[i] = i === 0 ? persisted : initial;
        return [
          states[i],
          (next) => {
            states[i] = typeof next === 'function' ? next(states[i]) : next;
          },
        ];
      },
    },
    'react-hook-form': { useForm: () => form },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Common': { Alert: 'Alert', Button: 'Button', Card: 'Card', Input: 'Input' },
    '@/stores/authStore': { useAuthStore: () => null },
    '@/hooks/useAccess': { useAccess: () => ({ can: () => true }) },
    '../api/orderPolicyApi': {
      orderPolicyApi: {
        policy: async () => persisted,
        savePolicy: async (input) => {
          calls.push(['save', input]);
          if (fail) throw new Error('offline');
          return { ...persisted, holdCodMinAmount: '1600000', version: 7 };
        },
      },
    },
    '../schemas/orderPolicySchema': { orderPolicyFormSchema: {} },
  };
  new Function('require', 'exports', 'React', code)(
    (name) => {
      assert.ok(name in bindings, name);
      return bindings[name];
    },
    exports,
    {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity).filter(Boolean),
      }),
    },
  );
  function render() {
    cursor = refCursor = 0;
    const view = exports.OrderPolicySession();
    const nodes = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      node.children?.forEach(walk);
    };
    walk(view);
    return {
      nodes,
      form: nodes.find((node) => node.type === 'form'),
      button: (key) => nodes.find((node) => node.type === 'Button' && node.children.includes(key)),
    };
  }
  return {
    render,
    calls,
    effects,
    edit: () => {
      form.formState.isDirty = true;
    },
  };
}

test('unchanged policy is not submitted even through the form handler', async () => {
  const r = mount({ dirty: false });
  const view = r.render();
  assert.equal(view.button('save').props.disabled, true);
  await view.form.props.onSubmit();
  assert.deepEqual(r.calls, []);
});

for (const enabled of [true, false])
  test(
    'successful policy save reports authoritative ' +
      (enabled ? 'enabled' : 'disabled') +
      ' state and clears on edits',
    async () => {
      const r = mount({ enabled });
      await r.render().form.props.onSubmit();
      assert.deepEqual(r.calls[1], [
        'reset',
        { holdRiskyCod: enabled, holdCodMinAmount: '1600000' },
        undefined,
      ]);
      let view = r.render();
      assert.ok(
        view.nodes.some((node) =>
          node.children.includes(enabled ? 'savedEnabled' : 'savedDisabled'),
        ),
      );
      assert.equal(view.button('save').props.disabled, true);
      r.edit();
      view.form.props.onChange();
      view = r.render();
      assert.equal(
        view.nodes.some(
          (node) =>
            node.children.includes('savedEnabled') || node.children.includes('savedDisabled'),
        ),
        false,
      );
    },
  );

test('policy failure explains policy recovery and reload preserves dirty fields', async () => {
  const r = mount({ fail: true });
  await r.render().form.props.onSubmit();
  const view = r.render();
  assert.ok(view.nodes.some((node) => node.children.includes('policyWriteError')));
  assert.ok(view.button('reloadPolicy'));
  assert.equal(
    r.calls.some((call) => call[0] === 'reset'),
    false,
  );
  r.effects[0]();
  await new Promise(setImmediate);
  assert.deepEqual(r.calls.at(-1), [
    'reset',
    { holdRiskyCod: true, holdCodMinAmount: '1200000' },
    { keepDirtyValues: true },
  ]);
});

test('policy enable control has its rule explanation associated with it', () => {
  const view = mount().render();
  const control = view.nodes.find(
    (node) => node.type === 'input' && node.props.type === 'checkbox',
  );
  assert.ok(control.props['aria-describedby']);
  const description = view.nodes.find(
    (node) => node.props.id === control.props['aria-describedby'],
  );
  assert.ok(description.children.includes('policyHint'));
});
