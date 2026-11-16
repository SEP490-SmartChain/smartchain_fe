import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(
    new URL('../src/features/orders/components/OperationsExceptionQueue.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } },
).outputText;
async function workspace({
  reject = false,
  mutable = true,
  health = 'AVAILABLE',
  allowed = true,
} = {}) {
  const exports = {},
    values = [],
    effects = [];
  let index = 0,
    initialized = false,
    requests = 0;
  const bindings = {
    './ExceptionAddressCorrection': { ExceptionAddressCorrection: 'ExceptionAddressCorrection' },
    react: {
      useState(initial) {
        const key = index++;
        if (!(key in values)) values[key] = initial;
        return [
          values[key],
          (next) => {
            values[key] = typeof next === 'function' ? next(values[key]) : next;
          },
        ];
      },
      useRef: (initial) => ({ current: initial }),
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
    'next-intl': {
      useTranslations: () => (key) => key,
      useFormatter: () => ({ dateTime: () => 'formatted date' }),
    },
    '@/components/Common': Object.fromEntries(
      ['Alert', 'Button', 'Card', 'Input', 'PageHeader', 'Select'].map((name) => [name, name]),
    ),
    '@/components/Common/DataTable/DataTable': { default: 'DataTable' },
    '@/components/Common/Modal/Modal': { default: 'Modal' },
    '@/hooks/useAccess': {
      useAccess: () => ({
        can: (capability) => allowed && (capability === 'exceptions.view' || mutable),
      }),
    },
    '@/stores/authStore': { useAuthStore: (selector) => selector() },
    '../lib/orderScope': { orderScope: () => 'synthetic-scope' },
    '@/services/apiClient': { ApiError: class extends Error {} },
    '../lib/fulfillmentRetry': { isRejectedOperation: () => false },
    '../lib/exceptionPending': {},
    '../api/operationsExceptionApi': {
      exceptionFiltersSchema: {},
      operationsExceptionApi: {
        async list() {
          requests++;
          if (reject) throw new Error('Network unavailable');
          return {
            items: [],
            warehouses: [],
            nextCursor: null,
            collection: { status: health, checkedAt: new Date().toISOString() },
          };
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
    return exports.OperationsExceptionQueue();
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
  return { nodes, requests };
}
test('network failure offers refresh without claiming an empty exception result', async () => {
  const { nodes } = await workspace({ reject: true });
  assert.ok(nodes.some((node) => node.type === 'Alert' && node.props.role === 'alert'));
  assert.equal(
    nodes.some((node) => node.type === 'DataTable'),
    false,
  );
  assert.ok(nodes.some((node) => node.type === 'Button' && node.children.includes('refresh')));
});
test('unavailable and partial scans stay distinct from an empty successful queue', async () => {
  for (const health of ['UNAVAILABLE', 'PARTIAL', 'NOT_READY']) {
    const { nodes } = await workspace({ health });
    assert.ok(nodes.some((node) => node.type === 'Alert' && node.props.variant === 'warning'));
    assert.ok(nodes.some((node) => node.type === 'DataTable'));
  }
});
test('read-only roles see their scope notice and denied roles issue no request', async () => {
  const { nodes } = await workspace({ mutable: false });
  assert.ok(nodes.some((node) => node.type === 'Alert' && node.children.includes('readOnly')));
  assert.equal((await workspace({ allowed: false })).requests, 0);
});
