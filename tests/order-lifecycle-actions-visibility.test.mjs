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
function render(status, holdReason, allowed = true) {
  const exports = {};
  const bindings = {
    react: {
      useEffect: () => {},
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
    },
    'react-hook-form': { useForm: () => ({ formState: { isDirty: false } }) },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Common': { Alert: 'Alert', Button: 'Button', Input: 'Input', Select: 'Select' },
    '@/stores/authStore': { useAuthStore: () => null },
    '@/hooks/useAccess': { useAccess: () => ({ can: () => allowed }) },
    '../api/orderLifecycleApi': { orderLifecycleApi: {} },
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
    { createElement: (type, props, ...children) => ({ type, props, children }) },
  );
  return exports.OrderLifecycleActions({ order: { status, holdReason }, onChanged: () => {} });
}
test('correction actions do not render an empty duplicate section for valid or held orders', () => {
  for (const status of [
    'RECEIVED',
    'ON_HOLD',
    'VALIDATED',
    'BACKORDER',
    'ALLOCATED',
    'DELIVERED',
    'CANCELLED',
  ])
    assert.equal(render(status, null), null);
  assert.equal(render('FAILED', 'ALLOCATION_QUEUE_FAILED'), null);
});
test('only an authorized validation failure shows correction actions', () => {
  assert.equal(render('FAILED', 'VALIDATION_FAILED', false), null);
  assert.equal(render('FAILED', 'VALIDATION_FAILED').type, 'section');
});
