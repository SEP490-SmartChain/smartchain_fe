import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/orders/components/HandoverWorkspace.tsx', import.meta.url),
  'utf8',
);
const tree = ts.createSourceFile(
  'handover.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
for (const name of ['HandoverPhoto', 'RemoveDraftParcel']) {
  test(name + ' keeps a live request controller after StrictMode setup-cleanup-setup', () => {
    const component = tree.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
    );
    assert.ok(component);
    let effect;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect')
        effect = node.arguments[0];
      ts.forEachChild(node, visit);
    }
    visit(component);
    assert.ok(effect);
    const code = ts.transpileModule('const setup = ' + effect.getText(tree), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const abort = { current: new AbortController() };
    const setup = new Function('abort', code + '; return setup;')(abort);
    const cleanup = setup();
    const first = abort.current;
    cleanup();
    assert.equal(first.signal.aborted, true);
    const cleanupAgain = setup();
    assert.equal(abort.current.signal.aborted, false);
    cleanupAgain();
    assert.equal(abort.current.signal.aborted, true);
  });
}
