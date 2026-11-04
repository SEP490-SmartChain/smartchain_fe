import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(
    new URL('../src/features/orders/components/ExceptionAddressCorrection.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } },
).outputText;
async function renderCorrection(pending = null, reject = false) {
  const exports = {},
    states = [],
    effects = [],
    calls = [];
  let index = 0,
    initialized = false,
    completed = 0;
  const bindings = {
    react: {
      useState(initial) {
        const key = index++;
        if (!(key in states)) states[key] = initial;
        return [
          states[key],
          (next) => {
            states[key] = typeof next === 'function' ? next(states[key]) : next;
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
        watch: () => '01',
        getValues: () => '',
        reset: () => {},
        setValue: () => {},
        handleSubmit: (fn) => fn,
        formState: { errors: {} },
      }),
    },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Common': { Alert: 'Alert', Button: 'Button', Input: 'Input', Select: 'Select' },
    '@/services/apiClient': { ApiError: class extends Error {} },
    '../lib/orderScope': { orderScope: () => 'scope' },
    '../lib/fulfillmentRetry': { isRejectedOperation: () => false },
    '../lib/exceptionPending': {
      pendingExceptionCommand: () => pending,
      beginExceptionCommand: (_id, input) => {
        calls.push('begin');
        return { ...input, operationId: 'new-reference' };
      },
      completeExceptionCommand: () => {},
    },
    '../api/operationsExceptionApi': {
      exceptionCorrectionFormSchema: {},
      operationsExceptionApi: {
        async correctionSource() {
          calls.push('read');
          if (reject) throw new Error('Not editable');
          return {
            exceptionVersion: 2,
            orderVersion: 1,
            recipientAddress: 'Synthetic address',
            toProvinceCode: '01',
            toWardCode: '00001',
            locations: [],
          };
        },
        async command(id, input) {
          calls.push({ id, input });
          return { outcome: 'QUEUED' };
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
        return { type, props, children: children.flat(Infinity) };
      },
    },
  );
  const render = () => {
    index = 0;
    return exports.ExceptionAddressCorrection({
      id: 'exception',
      exceptionVersion: 99,
      onCompleted: () => completed++,
      onCancel: () => {},
    });
  };
  render();
  initialized = true;
  const cleanup = effects.map((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  }
  walk(render());
  return { nodes, calls, completed: () => completed, close: () => cleanup.forEach((fn) => fn?.()) };
}
test('a pending correction can be checked after its order is no longer editable without fetching private source data', async () => {
  const pending = {
    operationId: 'same-reference',
    expectedVersion: 1,
    kind: 'RETRY',
    note: 'Original note',
    correction: {
      expectedOrderVersion: 1,
      recipientAddress: 'Synthetic corrected address',
      toProvinceCode: '01',
      toWardCode: '00001',
    },
  };
  const view = await renderCorrection(pending);
  try {
    const button = view.nodes.find(
      (node) => node.type === 'Button' && node.children.includes('checkPending'),
    );
    assert.ok(button);
    button.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(view.calls.includes('read'), false);
    assert.equal(view.calls.includes('begin'), false);
    assert.deepEqual(view.calls[0].input, pending);
    assert.equal(view.completed(), 1);
  } finally {
    view.close();
  }
});
test('an unavailable or locked correction source offers refresh without rendering address inputs', async () => {
  const view = await renderCorrection(null, true);
  try {
    assert.ok(view.nodes.some((node) => node.type === 'Alert' && node.props.role === 'alert'));
    assert.equal(
      view.nodes.some((node) => node.type === 'Input'),
      false,
    );
    assert.ok(
      view.nodes.some((node) => node.type === 'Button' && node.children.includes('refresh')),
    );
  } finally {
    view.close();
  }
});
test('a correction uses the refreshed exception version from its protected source instead of the stale parent detail', async () => {
  const view = await renderCorrection();
  try {
    const form = view.nodes.find((node) => node.type === 'form');
    assert.ok(form);
    await form.props.onSubmit({
      recipientAddress: 'Synthetic updated address',
      toProvinceCode: '01',
      toWardCode: '00001',
      note: 'Checked refreshed source',
    });
    const sent = view.calls.find((call) => typeof call === 'object');
    assert.equal(sent.input.expectedVersion, 2);
  } finally {
    view.close();
  }
});
