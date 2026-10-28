import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/orders/hooks/useOrderDetailRefresh.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function mount({ status = 'VALIDATED', active = true, holdReason = null, read = true } = {}) {
  const timers = new Map();
  let cleanup,
    listener,
    scope = 'seller-a',
    timerId = 0,
    calls = 0,
    signal;
  let order = { id: 'order-a', status, holdReason, version: 3 };
  let result = { ...order, status: 'BACKORDER', version: 4 };
  let error = null;
  const exports = {};
  const bindings = {
    react: {
      useEffect: (effect) => {
        cleanup = effect();
      },
    },
    'next-intl': { useTranslations: () => (key) => key },
    '@/stores/authStore': {
      useAuthStore: {
        subscribe: (fn) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      },
    },
    '../lib/orderScope': { orderScope: () => scope, sellerOrderAccess: () => ({ read }) },
    '../api/ordersApi': {
      ordersApi: {
        detail: async (id, owner, requestSignal) => {
          assert.equal(id, 'order-a');
          assert.equal(owner, true);
          signal = requestSignal;
          calls++;
          if (result instanceof Error) throw result;
          return await result;
        },
      },
    },
  };
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', code)(
    (name) => {
      assert.ok(name in bindings, name);
      return bindings[name];
    },
    exports,
    (fn) => {
      const id = ++timerId;
      timers.set(id, fn);
      return id;
    },
    (id) => timers.delete(id),
  );
  exports.useOrderDetailRefresh({
    scope,
    owner: true,
    detail: order,
    active,
    setDetail: (update) => {
      order = update(order);
    },
    setError: (value) => {
      error = value;
    },
  });
  return {
    async tick() {
      const [id, fn] = timers.entries().next().value ?? [];
      if (fn) {
        timers.delete(id);
        fn();
      }
      await new Promise(setImmediate);
    },
    cleanup: () => cleanup?.(),
    changeScope: () => {
      scope = 'seller-b';
      listener?.();
    },
    setResult: (value) => {
      result = value;
    },
    newerOrder: () => {
      order = { ...order, status: 'CANCELLED', version: 9 };
    },
    get order() {
      return order;
    },
    get calls() {
      return calls;
    },
    get error() {
      return error;
    },
    get signal() {
      return signal;
    },
    get timers() {
      return timers.size;
    },
  };
}

test('validated detail updates to worker result without another click', async () => {
  const r = mount();
  await r.tick();
  assert.equal(r.calls, 1);
  assert.equal(r.order.status, 'BACKORDER');
  assert.equal(r.order.version, 4);
  r.cleanup();
  assert.equal(r.timers, 0);
  assert.equal(r.signal.aborted, true);
});

test('stable states and closed dialogs schedule no background request', async () => {
  for (const options of [
    { status: 'BACKORDER' },
    { status: 'ALLOCATED' },
    { status: 'CANCELLED' },
    { status: 'ON_HOLD' },
    { active: false },
  ]) {
    const r = mount(options);
    await r.tick();
    assert.equal(r.calls, 0);
    assert.equal(r.timers, 0);
  }
});

test('pending cancellation remains eligible for status refresh', async () => {
  const r = mount({ status: 'ON_HOLD', holdReason: 'CANCEL_PENDING' });
  await r.tick();
  assert.equal(r.calls, 1);
  r.cleanup();
});

test('scope changes abort an in-flight result and prevent another seller from seeing it', async () => {
  const r = mount();
  let resolve;
  r.setResult(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await r.tick();
  r.changeScope();
  assert.equal(r.signal.aborted, true);
  resolve({ id: 'order-a', status: 'BACKORDER', version: 4 });
  await new Promise(setImmediate);
  assert.equal(r.order.status, 'VALIDATED');
  assert.equal(r.timers, 0);
  r.cleanup();
});

test('a late poll cannot replace a newer cancellation result', async () => {
  const r = mount();
  r.newerOrder();
  await r.tick();
  assert.equal(r.order.status, 'CANCELLED');
  assert.equal(r.order.version, 9);
  r.cleanup();
});

test('failed refresh shows recovery feedback and stops retrying; denied reads do not request', async () => {
  const r = mount();
  r.setResult(new Error('offline'));
  await r.tick();
  assert.equal(r.error, 'response_error');
  assert.equal(r.order.status, 'VALIDATED');
  assert.equal(r.timers, 0);
  r.cleanup();
  const denied = mount({ read: false });
  await denied.tick();
  assert.equal(denied.calls, 0);
  denied.cleanup();
});
