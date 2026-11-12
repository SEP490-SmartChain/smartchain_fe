import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

function sourceTree(path) {
  return ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

const schemaTree = sourceTree('../src/features/orders/schemas/pickingSchema.ts');
const schemaDeclaration = schemaTree.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.text === 'pickWaveFormSchema',
    ),
);
const schemaExpression = schemaDeclaration.declarationList.declarations[0].initializer;
const schema = new Function('z', `return (${schemaExpression.getText(schemaTree)});`)(z);

function renderWaveForm(values, previewCalls, submissions) {
  const tree = sourceTree('../src/features/orders/components/PickingWorkspace.tsx');
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WaveForm',
  );
  const bindings = {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity),
      }),
    },
    useTranslations: () => (key) => key,
    useState: (initial) => [initial, () => {}],
    useEffect() {},
    useForm: () => ({
      register: (name) => ({ name }),
      watch: (name) => values[name],
      getValues: () => ({ ...values }),
      trigger: async (names) =>
        schema.pick(Object.fromEntries(names.map((name) => [name, true]))).safeParse(values)
          .success,
      handleSubmit: (submit) => async () => {
        const result = schema.safeParse(values);
        if (result.success) await submit(result.data);
      },
      formState: { errors: {} },
    }),
    zodResolver: () => ({}),
    pickWaveFormSchema: schema,
    pickingApi: {
      previewWave: async (...args) => {
        previewCalls.push(args);
        return { proposedOrders: 1, proposedParcels: 2, firstParcelTooLarge: false };
      },
    },
    Card: 'Card',
    CardContent: 'CardContent',
    Input: 'Input',
    Select: 'Select',
    Button: 'Button',
    Alert: 'Alert',
  };
  const code = ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const WaveForm = new Function(...Object.keys(bindings), `${code}; return WaveForm;`)(
    ...Object.values(bindings),
  );
  return WaveForm({
    warehouseId: 'warehouse-a',
    staff: [],
    disabled: false,
    onSubmit: (data) => submissions.push(data),
  });
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

test('wave preview accepts cutoff and capacity before assignment, while creation still requires assignee', async () => {
  const values = { cutoffAt: '2026-11-05T08:00:00Z', maxParcels: 20, assigneeId: '' };
  const previewCalls = [];
  const submissions = [];
  const ui = renderWaveForm(values, previewCalls, submissions);
  const previewButton = nodes(ui).find(
    (node) => node.type === 'Button' && node.children.includes('previewWave'),
  );
  previewButton.props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(previewCalls, [['warehouse-a', '2026-11-05T08:00:00.000Z', 20]]);

  const form = nodes(ui).find((node) => node.type === 'form');
  await form.props.onSubmit();
  assert.equal(submissions.length, 0, 'creation must reject the missing assignee');
  values.assigneeId = '00000000-0000-4000-8000-000000000001';
  await form.props.onSubmit();
  assert.deepEqual(submissions, [values]);
});

test('wave preview still validates capacity before requesting an estimate', async () => {
  const previewCalls = [];
  const ui = renderWaveForm(
    { cutoffAt: '2026-11-05T08:00:00Z', maxParcels: 51, assigneeId: '' },
    previewCalls,
    [],
  );
  nodes(ui)
    .find((node) => node.type === 'Button' && node.children.includes('previewWave'))
    .props.onClick();
  await new Promise(setImmediate);
  assert.equal(previewCalls.length, 0);
});
