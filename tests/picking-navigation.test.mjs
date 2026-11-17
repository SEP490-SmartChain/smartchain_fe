import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createServer } from 'vite';

const source = readFileSync(
  new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
  'utf8',
);
const tree = ts.createSourceFile(
  'picking.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const elements = nodes.filter(ts.isJsxElement);
const referenceDeclaration = tree.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'shortWaveReference',
);
const referenceCode = ts.transpileModule(referenceDeclaration.getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const shortWaveReference = new Function(`${referenceCode}; return shortWaveReference;`)();
function translatedElement(key, tag = 'Button') {
  return elements.find(
    (node) =>
      node.openingElement.tagName.getText(tree) === tag &&
      node.children.some(
        (child) =>
          ts.isJsxExpression(child) &&
          child.expression &&
          ts.isCallExpression(child.expression) &&
          child.expression.expression.getText(tree) === 't' &&
          child.expression.arguments[0]?.text === key,
      ),
  );
}
let server, Button;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ Button } = await server.ssrLoadModule('/src/components/Common/Button/Button.tsx'));
});
after(async () => server?.close());
function evaluate(node, bindings = {}) {
  assert.ok(node, 'Expected the picking control to exist');
  const scope = {
    React,
    Button,
    Badge: ({ label }) => React.createElement('span', null, label),
    shortWaveReference,
    t: (key, values) => (key === 'waveReference' ? `Wave ${values.code}` : key),
    ...bindings,
  };
  const code = ts.transpileModule(`function render() { return (${node.getText(tree)}); }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(scope), code + '; return render();')(...Object.values(scope));
}
const waveButton = elements.find(
  (node) =>
    node.openingElement.tagName.getText(tree) === 'Button' &&
    node.openingElement.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(tree) === 'onClick' &&
        attribute.initializer?.getText(tree).includes('setWaveId(w.id)'),
    ),
);
const wave = {
  id: '00000000-0000-4000-8000-000000000001',
  waveCode: 'PICK-00000000-0000-4000-8000-000000000021',
  cutoffAt: '2026-10-26T08:09:10Z',
  status: 'ASSIGNED',
};
function waveControl(overrides = {}) {
  return evaluate(waveButton, {
    w: wave,
    waveId: wave.id,
    locale: 'en-GB',
    cutoff: '26/10/2026, 15:09:10',
    status: 'statuses.ASSIGNED',
    badgeStatus: 'default',
    pending: null,
    busy: false,
    setWaveId: () => {},
    ...overrides,
  });
}

test('wave rows show short references, cutoff and status with the full code available on demand', () => {
  const html = renderToStaticMarkup(waveControl());
  assert.ok(html.includes(wave.waveCode));
  assert.ok(html.includes(`Wave ${shortWaveReference(wave.waveCode)}`));
  assert.ok(html.includes('26/10/2026'));
  assert.ok(html.includes('15:09:10'));
  assert.ok(html.includes('statuses.ASSIGNED'));
  const otherCode = 'PICK-00000000-0000-4000-8000-000000000022';
  assert.ok(
    renderToStaticMarkup(waveControl({ w: { ...wave, waveCode: otherCode } })).includes(otherCode),
  );
});

test('wave selection announces the selected state and preserves selection identity', () => {
  let selected;
  const control = waveControl({ setWaveId: (id) => (selected = id) });
  assert.equal(control.props['aria-pressed'], true);
  assert.equal(waveControl({ waveId: 'another-wave' }).props['aria-pressed'], false);
  control.props.onClick();
  assert.equal(selected, wave.id);
  assert.equal(waveControl({ pending: { path: 'confirm' } }).props.disabled, true);
  assert.equal(waveControl({ busy: true }).props.disabled, true);
});

test('the pick-list heading shares the row reference and retains the authoritative code in its title', () => {
  const heading = evaluate(translatedElement('pickList', 'h2'), { detail: wave });
  assert.equal(heading.props.title, wave.waveCode);
  assert.ok(renderToStaticMarkup(heading).includes(`Wave ${shortWaveReference(wave.waveCode)}`));
});

test('refresh returns to the first wave page without altering the pending command or selection', () => {
  let cursor = 'later-page',
    refresh = 5;
  const pending = { path: 'confirm', payload: { clientScanId: 'same-reference' } };
  const control = evaluate(translatedElement('reload'), {
    pending: null,
    busy: false,
    waveRequest: null,
    setCursor: (value) => (cursor = value),
    setRefresh: (update) => (refresh = update(refresh)),
  });
  control.props.onClick();
  assert.equal(cursor, null);
  assert.equal(refresh, 6);
  for (const blocked of [{ pending }, { busy: true }, { waveRequest: 'queued-request' }]) {
    const guarded = evaluate(translatedElement('reload'), {
      pending: null,
      busy: false,
      waveRequest: null,
      ...blocked,
    });
    assert.equal(guarded.props.disabled, true);
  }
});

test('the first wave page control resets its cursor and stays blocked during uncertain writes', () => {
  let cursor = 'later-page';
  const node = translatedElement('firstWaves');
  let visibility = node.parent;
  while (!ts.isJsxExpression(visibility)) visibility = visibility.parent;
  const firstPage = renderToStaticMarkup(evaluate(visibility.expression, { cursor: null }));
  assert.ok(!firstPage.includes('<button'));
  assert.ok(!firstPage.includes('firstWaves'));
  const control = evaluate(node, {
    pending: null,
    busy: false,
    waveRequest: null,
    setCursor: (value) => (cursor = value),
  });
  control.props.onClick();
  assert.equal(cursor, null);
  for (const blocked of [{ pending: { path: 'confirm' } }, { busy: true }]) {
    const guarded = evaluate(node, { pending: null, busy: false, waveRequest: null, ...blocked });
    assert.equal(guarded.props.disabled, true);
  }
});
