import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';

let server, createCancellationSession, auth, orderScope, cancellationReasonSchema;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ createCancellationSession } = await server.ssrLoadModule(
    '/src/features/orders/lib/cancellationSession.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ orderScope } = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts'));
  ({ cancellationReasonSchema } = await server.ssrLoadModule(
    '/src/features/orders/schemas/orderCancellationSchema.ts',
  ));
});
after(async () => server?.close());

const code = ts.transpileModule(
  readFileSync(
    new URL('../src/features/orders/components/OrderCancellationActions.tsx', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } },
).outputText;

async function render(
  status,
  cancellationStatus = null,
  holdReason = null,
  failStatusRead = false,
) {
  auth.getState().clear();
  auth.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 60,
    user: {
      userId: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000001',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
      serviceStatus: 'ACTIVE',
    },
  });
  const exports = {};
  let stateIndex = 0,
    session;
  const states = [];
  const bindings = {
    react: {
      useEffect: () => {},
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [
          states[index],
          (value) => {
            states[index] = value;
          },
        ];
      },
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    },
    'react-hook-form': {
      useForm: () => ({
        register: () => ({}),
        handleSubmit: () => () => {},
        formState: { errors: {} },
      }),
    },
    '@hookform/resolvers/zod': { zodResolver: () => ({}) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Common': { Alert: 'Alert', Button: 'Button', Input: 'Input' },
    '@/hooks/useAccess': { useAccess: () => ({ can: () => true }) },
    '@/stores/authStore': { useAuthStore: (selector) => selector(auth.getState()) },
    '../lib/orderScope': { orderScope },
    '../lib/cancellationSession': {
      createCancellationSession: (input) => {
        session = createCancellationSession(input);
        return session;
      },
    },
    '../api/orderCancellationApi': {
      orderCancellationApi: {
        cancellation: async () => {
          if (failStatusRead) throw new Error('temporary outage');
          return {
            id: 'order-a',
            status: cancellationStatus ?? 'NOT_REQUESTED',
            code: null,
          };
        },
        cancel: async () => {
          throw new Error('Feedback rendering must not submit a cancellation');
        },
      },
    },
    '../schemas/orderCancellationSchema': { cancellationReasonSchema },
  };
  new Function('require', 'exports', 'React', code)(
    (name) => {
      assert.ok(name in bindings, name);
      return bindings[name];
    },
    exports,
    {
      createElement: (type, props, ...children) => {
        if (typeof type === 'function') return type({ ...props, children });
        return { type, props, children: children.flat(Infinity) };
      },
    },
  );
  function tree() {
    stateIndex = 0;
    return exports.OrderCancellationActions({
      order: { id: 'order-a', version: 5, status, holdReason },
      onChanged: () => {},
    });
  }
  tree();
  await session.check();
  const view = tree();
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  }
  walk(view);
  session.stop();
  return {
    alerts: nodes.filter((node) => node.type === 'Alert'),
    form: nodes.find((node) => node.type === 'form'),
  };
}
function text(node) {
  if (typeof node === 'string') return node;
  return (node?.children ?? []).map(text).join(' ');
}

test('authoritative cancelled order overrides a cached pending or exception response', async () => {
  for (const prior of ['PENDING', 'EXCEPTION', null]) {
    const view = await render('CANCELLED', prior);
    const alert = view.alerts.find((node) => text(node).includes('cancelled'));
    assert.ok(alert);
    assert.equal(alert.props.variant, 'success');
    assert.equal(text(alert).trim(), 'cancelled');
    assert.equal(view.form, undefined);
    assert.equal(
      view.alerts.some((node) =>
        ['cancelPending', 'cancelException'].some((key) => text(node).includes(key)),
      ),
      false,
    );
  }
});

test('confirmed cancelled order does not also display a stale cancellation lookup error', async () => {
  const view = await render('CANCELLED', null, null, true);
  assert.equal(
    view.alerts.some((node) => text(node).includes('statusError')),
    false,
  );
  assert.ok(view.alerts.some((node) => text(node).trim() === 'cancelled'));
});

test('pending cancellation retains warning feedback until cancellation is confirmed', async () => {
  const pending = await render('ALLOCATED', 'PENDING', 'CANCEL_PENDING');
  const pendingAlert = pending.alerts.find((node) => text(node).includes('cancelPending'));
  assert.ok(pendingAlert);
  assert.equal(pendingAlert.props.variant, 'warning');
  assert.equal(pending.form, undefined);
  const exception = await render('ALLOCATED', 'EXCEPTION', 'CANCEL_PENDING');
  const exceptionAlert = exception.alerts.find((node) => text(node).includes('cancelException'));
  assert.ok(exceptionAlert);
  assert.equal(exceptionAlert.props.variant, 'warning');
  assert.equal(exception.form, undefined);
});
