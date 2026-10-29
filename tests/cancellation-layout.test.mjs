import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

const code = ts.transpileModule(
  readFileSync(
    new URL(
      '../src/features/orders/components/OperationsCancellationWorkspace.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  },
).outputText;

async function workspace(reject = false) {
  const exports = {},
    values = [],
    effects = [];
  let index = 0,
    initialized = false;
  const bindings = {
    react: {
      useState(initial) {
        const key = index++;
        if (!(key in values)) values[key] = typeof initial === 'function' ? initial() : initial;
        return [
          values[key],
          (next) => {
            values[key] = typeof next === 'function' ? next(values[key]) : next;
          },
        ];
      },
      useEffect(effect) {
        if (!initialized) effects.push(effect);
      },
    },
    'react-hook-form': {
      useForm: () => ({
        register: () => ({}),
        handleSubmit: (fn) => fn,
        formState: { errors: {} },
      }),
    },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    zod: { z },
    '@/components/Common': {
      Alert: 'Alert',
      Button: 'Button',
      Card: 'Card',
      Input: 'Input',
      PageHeader: 'PageHeader',
    },
    '@/components/Common/DataTable/DataTable': { default: 'DataTable' },
    '@/components/Common/Modal/Modal': { default: 'Modal' },
    '@/hooks/useAccess': { useAccess: () => ({ can: () => true }) },
    '@/stores/authStore': { useAuthStore: (selector) => selector() },
    '../lib/orderScope': { orderScope: () => 'synthetic-ops-scope' },
    './OrderCancellationActions': { OrderCancellationActions: 'OrderCancellationActions' },
    '../api/operationsCancellationApi': {
      operationsCancellationApi: {
        list: async () => {
          if (reject) throw new TypeError('Network unavailable');
          return { items: [], nextCursor: null };
        },
      },
    },
  };
  new Function('require', 'exports', 'React', code)(
    (name) => {
      assert.ok(name in bindings, name);
      return bindings[name];
    },
    exports,
    {
      createElement(type, props, ...children) {
        return typeof type === 'function'
          ? type({ ...props, children })
          : { type, props, children: children.flat(Infinity) };
      },
    },
  );
  function render() {
    index = 0;
    return exports.OperationsCancellationWorkspace();
  }
  render();
  initialized = true;
  const cleanups = effects.map((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  }
  walk(render());
  cleanups.forEach((cleanup) => cleanup?.());
  return nodes;
}

test('failed cancellation candidate load shows recovery without claiming the result is empty', async () => {
  const nodes = await workspace(true);
  assert.equal(
    nodes.some((node) => node.type === 'Alert' && node.props.variant === 'error'),
    true,
  );
  assert.equal(
    nodes.some((node) => node.type === 'DataTable'),
    false,
  );
  assert.equal(
    nodes.some((node) => node.type === 'Button' && node.children.includes('reload')),
    true,
  );
});

test('candidate search and its results share one workspace surface', async () => {
  const nodes = await workspace();
  assert.equal(nodes.filter((node) => node.type === 'Card').length, 1);
  assert.equal(
    nodes.some((node) => node.type === 'DataTable' && node.props.emptyMessage === 'opsEmpty'),
    true,
  );
});
