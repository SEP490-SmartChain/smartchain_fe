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
function render(name, state, props, overrides = {}) {
  let index = 0;
  const form = {
    register: (name) => ({ name }),
    handleSubmit: (f) => f,
    formState: { errors: {} },
  };
  const bindings = {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props ?? {},
        children: children.flat(Infinity),
      }),
    },
    useState: () => [state[index++], () => {}],
    useEffect() {},
    useLocale: () => 'vi',
    createPortal: (node) => node,
    document: { body: {} },
    useRef: (current) => ({ current }),
    useAuthStore: (selector) => selector({ user: { userId: 'test-actor' }, revision: 0 }),
    loadFulfillmentPending: () => null,
    persistFulfillmentPending() {},
    clearFulfillmentPending() {},
    createUuid: () => 'test-operation',
    isRejectedOperation: () => true,
    useTranslations: () => (key, values) => (values ? key + JSON.stringify(values) : key),
    useForm: () => form,
    zodResolver: () => ({}),
    handoverAckSchema: {},
    manifestCommandSchema: {},
    Button: 'Button',
    Card: 'Card',
    Tabs: 'Tabs',
    PageHeader: 'PageHeader',
    Select: 'Select',
    WarehouseHandover: 'WarehouseHandover',
    useAccess: () => ({ can: () => true }),
    Alert: 'Alert',
    Input: 'Input',
    SignManifest: 'SignManifest',
    RemoveDraftParcel: 'RemoveDraftParcel',
    HandoverPhoto: 'HandoverPhoto',
    PutbackForm: 'PutbackForm',
    carrierPickupRecorded: () => false,
    styles: {},
    ...overrides,
  };
  const fn = tree.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  const code = ts.transpileModule(fn.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), code + '; return ' + name)(
    ...Object.values(bindings),
  )(props);
}

test('confirmed putback stays visible after the last task leaves the pending list', () => {
  const state = layoutState(layoutData);
  state.push(null);
  // Keep hook indexing local to each render, as React does.
  function draw() {
    let index = 0;
    return render('WarehouseHandover', state, layoutProps, {
      useState(initial) {
        const slot = index++;
        return [
          slot in state ? state[slot] : initial,
          (value) => {
            state[slot] = typeof value === 'function' ? value(state[slot]) : value;
          },
        ];
      },
    });
  }
  state[1] = [{ id: 'task', sku: 'SKU-RETURN', qty: 2, binCode: 'A1', lotCode: 'L1' }];
  const task = flatten(draw()).find((n) => n.type === 'PutbackForm');
  task.props.onDone(2);
  state[1] = [];
  const ui = draw();
  const notice = flatten(ui).find((n) => n.type === 'Alert' && n.props.variant === 'success');
  assert.ok(notice, 'completion must remain visible when the task disappears');
  assert.equal(notice.props.role, 'status');
  assert.ok(JSON.stringify(notice).includes('SKU-RETURN'));
  assert.ok(notice.children.join('').includes('"qty":2'));
  const details = flatten(ui).find(
    (n) => n.type === 'details' && JSON.stringify(n).includes('putbackTitle'),
  );
  assert.equal(details.props.open, false);
  assert.ok(
    !flatten(details).includes(notice),
    'notice must be outside the collapsed pending section',
  );
});

function printedManifest(manifest) {
  const state = layoutState(layoutData);
  state[8] = manifest;
  const ui = render('WarehouseHandover', state, layoutProps, {
    styles: { manifestPrint: 'manifest-print' },
  });
  return flatten(ui).find((n) => n.props.className === 'manifest-print');
}

test('signed print uses recorded acknowledgement and confirmation time, without blank signature lines', () => {
  const print = printedManifest({
    status: 'SIGNED',
    manifestCode: 'BG-PRINT',
    parcelCount: 1,
    carrierAckRef: 'ACK-123',
    carrierSignerName: 'Nguyễn Văn A',
    signedAt: '2026-11-05T17:00:00.000Z',
    hasHandoverPhoto: true,
    shipments: [{ id: 's', trackingNumber: 'TRACK-123' }],
  });
  const text = JSON.stringify(print);
  assert.ok(text.includes('Nguyễn Văn A'), 'recorded representative must be printed');
  assert.ok(text.includes('ACK-123'));
  assert.ok(text.includes('warehouseConfirmedAt'));
  assert.ok(text.includes('06/11/2026'), 'confirmation is printed in warehouse local time');
  assert.ok(text.includes('signedPrintEvidence'));
  assert.ok(!text.includes('____'), 'a signed record must not ask for signatures again');
});

test('draft print leaves physical handover fields for handwriting and identifies itself as draft', () => {
  const text = JSON.stringify(
    printedManifest({
      status: 'DRAFT',
      manifestCode: 'BG-DRAFT',
      parcelCount: 1,
      shipments: [],
    }),
  );
  assert.ok(text.includes('draftPrintTitle'));
  assert.ok(text.includes('warehouseSignature'));
  assert.ok(text.includes('carrierSignature'));
  assert.ok(text.includes('____'));
});

test('historical signed print explicitly identifies missing data instead of inventing signatures', () => {
  const text = JSON.stringify(
    printedManifest({
      status: 'SIGNED',
      manifestCode: 'BG-OLD',
      parcelCount: 1,
      shipments: [],
    }),
  );
  assert.ok(text.includes('recordNotAvailable'));
  assert.ok(!text.includes('____'));
});

test('handover print preserves every tracking number in a numbered table for a full manifest', () => {
  const shipments = Array.from({ length: 100 }, (_, index) => ({
    id: `shipment-${index}`,
    trackingNumber: `TRACK-${String(index + 1).padStart(3, '0')}`,
  }));
  const print = printedManifest({
    status: 'SIGNED',
    manifestCode: 'BG-FULL',
    parcelCount: 100,
    shipments,
  });
  const table = flatten(print).find((n) => n.type === 'table');
  assert.ok(table, 'tracking references must be organized in a readable table');
  const body = flatten(table).find((n) => n.type === 'tbody');
  const rows = body.children.filter((n) => n.type === 'tr');
  assert.equal(rows.length, 100);
  for (let index = 0; index < 100; index++) {
    assert.equal(rows[index].children[0].children[0], index + 1);
    assert.equal(rows[index].children[1].children[0], shipments[index].trackingNumber);
  }
});

test('putback reports the submitted quantity only after server confirmation, never on rejection', async () => {
  for (const rejected of [false, true]) {
    let resolveRequest, rejectRequest;
    const request = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const completions = [];
    const ui = render(
      'PutbackForm',
      ['', false],
      {
        warehouse: 'w',
        task: { id: 'task', version: 1 },
        onDone: (qty) => completions.push(qty),
      },
      {
        putbackFormSchema: {},
        createUuid: () => 'operation',
        packingApi: { putback: () => request },
        isRejectedOperation: () => true,
      },
    );
    const submitting = ui.props.onSubmit({ binCode: 'A1', sku: 'SKU', lotCode: 'LOT', qty: 2 });
    assert.deepEqual(completions, [], 'pending requests cannot announce success');
    if (rejected) rejectRequest(new Error('Rejected'));
    else resolveRequest([]);
    await submitting;
    assert.deepEqual(completions, rejected ? [] : [2]);
  }
});
function flatten(root) {
  const all = [];
  function visit(n) {
    if (!n || typeof n !== 'object') return;
    all.push(n);
    for (const child of n.children ?? []) visit(child);
  }
  visit(root);
  return all;
}
test('handover explains grouping and hides connection UUID inside optional details', () => {
  const data = {
    shipments: [
      { id: 's', trackingNumber: 'TRACK-REAL', carrierAccountId: 'technical-account-uuid' },
    ],
    manifests: [],
  };
  const ui = render('WarehouseHandover', [data, [], ['s'], 0, false, '', {}, null, null], {
    warehouse: 'w',
    warehouseName: 'Kho',
    create: true,
    sign: true,
    putback: true,
  });
  const all = flatten(ui);
  assert.ok(JSON.stringify(ui).includes('manifestSelectionHint'));
  assert.ok(JSON.stringify(ui).includes('selectedForManifest'));
  assert.ok(
    all.some((n) => n.type === 'details' && JSON.stringify(n).includes('technical-account-uuid')),
  );
});
test('handover confirmation states expected parcel count and marks required physical fields', () => {
  const ui = render('SignManifest', ['', false, false, ''], {
    warehouse: 'w',
    id: 'm',
    parcelCount: 2,
    onSigned() {},
  });
  const all = flatten(ui);
  const count = all.find((n) => n.type === 'Input' && n.props.name === 'confirmedParcelCount');
  assert.equal(count.props.required, true);
  assert.ok(count.props.helperText.includes('2'));
  assert.equal(
    all.find((n) => n.type === 'Input' && n.props.name === 'carrierSignerName').props.required,
    true,
  );
  assert.ok(JSON.stringify(ui).includes('signChecklist'));
});

function layoutState(data, tab = null, expanded = null) {
  return source.includes('useState<PutbackTask')
    ? [data, [], [], 0, false, '', {}, null, null, tab, expanded]
    : [data, [], 0, false, '', {}, null, tab, expanded];
}
const layoutData = {
  shipments: [],
  manifests: [
    {
      id: 'signed',
      status: 'SIGNED',
      manifestCode: 'BG-OLD',
      parcelCount: 1,
      shipments: [],
      hasHandoverPhoto: true,
    },
    { id: 'draft', status: 'DRAFT', manifestCode: 'BG-TODO', parcelCount: 1, shipments: [] },
  ],
};
const layoutProps = {
  warehouse: 'w',
  warehouseName: 'Kho',
  create: true,
  sign: true,
  putback: true,
};
test('handover prioritizes drafts over signed history and uses full-width work tabs', () => {
  const ui = render('WarehouseHandover', layoutState(layoutData), layoutProps);
  const all = flatten(ui),
    tabs = all.find((n) => n.type === 'Tabs');
  assert.ok(tabs, 'work tabs are available');
  assert.equal(tabs.props.activeId, 'drafts');
  assert.equal(tabs.props.tabs.find((t) => t.id === 'drafts').badge, 1);
  assert.ok(!all.some((n) => n.props.className?.includes('lg:grid-cols-2')));
});
test('handover only expands the selected manifest while preserving hidden draft forms for exact retries', () => {
  const ui = render('WarehouseHandover', layoutState(layoutData, 'signed', 'signed'), layoutProps);
  const all = flatten(ui),
    rows = all.filter((n) => n.type === 'details' && n.props.onToggle);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((n) => n.props.open).length, 1);
  assert.ok(
    all.some((n) => n.type === 'SignManifest' && n.props.id === 'draft'),
    'hiding a tab must not discard a pending signing form',
  );
  assert.ok(
    all.some(
      (n) =>
        n.props.role === 'tabpanel' &&
        n.props.id === 'handover-work-panel-drafts' &&
        n.props.hidden,
    ),
  );
});

test('handover users assigned multiple warehouses can choose before a workspace exists', () => {
  const options = [
    { id: 'w1', name: 'First warehouse', code: 'W1' },
    { id: 'w2', name: 'Second warehouse', code: 'W2' },
  ];
  const ui = render('HandoverSession', [options, '', ''], {});
  const controls = flatten(ui).filter((n) => n.type === 'Select');
  assert.equal(controls.length, 1, 'one reachable warehouse selector before selection');
  assert.equal(controls[0].props.options.length, 2);
  assert.equal(controls[0].props.value, '');
  assert.ok(
    !flatten(ui).some((n) => n.type === 'WarehouseHandover'),
    'no unscoped workspace before selection',
  );
});
