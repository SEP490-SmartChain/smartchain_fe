import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/orders/components/SellerOrders.tsx', import.meta.url),
  'utf8',
);
const tree = ts.createSourceFile(
  'seller.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let declaration;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'openDetail') declaration = node;
  ts.forEachChild(node, visit);
}
visit(tree);
const code = ts.transpileModule(declaration.getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function refresh(current, id) {
  let value = current;
  const open = new Function(
    'setDetail',
    'setDetailId',
    'setModal',
    'execute',
    code + '; return openDetail',
  )(
    (update) => {
      value = typeof update === 'function' ? update(value) : update;
    },
    () => {},
    () => {},
    () => {},
  );
  open(id);
  return value;
}
test('same-order refresh keeps mounted detail and its unsaved action drafts while the request runs', () => {
  const current = { id: 'order-a', version: 3 };
  assert.equal(refresh(current, 'order-a'), current);
});
test('opening another order removes previous details before its request runs', () => {
  assert.equal(refresh({ id: 'order-a' }, 'order-b'), null);
});
