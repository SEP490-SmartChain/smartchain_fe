import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/orders/components/OrderLifecycleActions.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

function mount({ dirty = true, fail = false } = {}) {
  const states = [],
    refs = [],
    calls = [];
  let cursor = 0,
    refCursor = 0;
  const values = {
    recipientName: 'Edited recipient',
    recipientPhone: '0900000000',
    recipientAddress: 'Edited address',
    toProvinceCode: '01',
    toWardCode: '001',
  };
  const form = {
    formState: { isDirty: dirty },
    handleSubmit: (fn) => () => fn(values),
    reset: (next) => {
      calls.push(['reset', next]);
      form.formState.isDirty = false;
    },
  };
  const exports = {};
  const react = {
    useEffect: () => {},
    useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
    useState: (initial) => {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (next) => {
          states[i] = typeof next === 'function' ? next(states[i]) : next;
        },
      ];
    },
  };
  const bindings = {
    react,
    'react-hook-form': { useForm: () => form },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Common': { Alert: 'Alert', Button: 'Button', Input: 'Input', Select: 'Select' },
    '@/stores/authStore': { useAuthStore: () => null },
    '@/hooks/useAccess': { useAccess: () => ({ can: () => true }) },
    '../api/orderLifecycleApi': {
      orderLifecycleApi: {
        transition: async () => calls.push('redispatch'),
        correct: async () => {
          calls.push('save');
          if (fail) throw new Error('offline');
        },
      },
    },
    '../schemas/orderLifecycleSchema': { orderCorrectionSchema: {} },
    '../hooks/useOrderLocations': { useOrderLocations: () => ({}) },
    '../lib/orderScope': { orderScope: () => '' },
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
    const view = exports.OrderLifecycleActions({
      order: { id: 'order', version: 4, status: 'FAILED', holdReason: 'VALIDATION_FAILED' },
      onChanged: () => calls.push('reload'),
    });
    const nodes = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      node.children?.forEach(walk);
    };
    walk(view);
    return {
      nodes,
      button: (key) => nodes.find((node) => node.type === 'Button' && node.children.includes(key)),
      form: nodes.find((node) => node.type === 'form'),
    };
  }
  return { render, calls, values };
}

test('dirty recipient edits cannot redispatch the previously saved address, even through the handler', async () => {
  const r = mount();
  const view = r.render();
  assert.equal(view.button('revalidate').props.disabled, true);
  assert.ok(view.nodes.some((node) => node.children.includes('saveBeforeRevalidate')));
  view.button('revalidate').props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(r.calls, []);
});

test('successful correction resets the saved draft and explains the separate revalidation step', async () => {
  const r = mount();
  r.render().button('correct').props.onClick();
  await r.render().form.props.onSubmit();
  assert.deepEqual(r.calls, ['save', ['reset', r.values], 'reload']);
  const view = r.render();
  assert.equal(view.button('revalidate').props.disabled, false);
  assert.ok(view.nodes.some((node) => node.children.includes('correctionSaved')));
});

test('failed correction keeps the draft open and blocks revalidation until saved', async () => {
  const r = mount({ fail: true });
  r.render().button('correct').props.onClick();
  await r.render().form.props.onSubmit();
  const view = r.render();
  assert.ok(view.form);
  assert.equal(view.button('revalidate'), undefined);
  assert.ok(view.nodes.some((node) => node.children.includes('writeError')));
  assert.deepEqual(r.calls, ['save']);
});

test('edit mode focuses the correction workflow and returning keeps an unsaved draft', () => {
  const r = mount();
  r.render().button('correct').props.onClick();
  const edit = r.render();
  assert.ok(edit.form);
  assert.equal(edit.button('revalidate'), undefined);
  assert.equal(edit.button('correct'), undefined);
  assert.equal(edit.button('reload'), undefined);
  const fields = edit.nodes.find((node) => node.type?.name === 'CorrectionFields');
  fields.props.onClose();
  const overview = r.render();
  assert.equal(overview.form, undefined);
  assert.equal(overview.button('revalidate').props.disabled, true);
  assert.deepEqual(r.calls, []);
  overview.button('correct').props.onClick();
  assert.ok(r.render().form);
});
