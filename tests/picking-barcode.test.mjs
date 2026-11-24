import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, pickBarcode, pickingApi, apiClient;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  pickBarcode = await server.ssrLoadModule('/src/features/orders/lib/pickBarcode.ts');
  ({ pickingApi } = await server.ssrLoadModule('/src/features/orders/api/pickingApi.ts'));
  ({ apiClient } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => server?.close());

test('normalizeScannedCode trims whitespace and removes scanner control characters', () => {
  assert.equal(pickBarcode.normalizeScannedCode('  WH-DN-001\r\n '), 'WH-DN-001');
  assert.equal(pickBarcode.normalizeScannedCode('\uFEFF8930000000123\t'), '8930000000123');
  assert.equal(pickBarcode.normalizeScannedCode('   \n  '), '');
});

test('parsePickQrPayload parses structured JSON and ORCA-PICK payloads while leaving plain codes null', () => {
  assert.deepEqual(
    pickBarcode.parsePickQrPayload('{"bin":"WH-DN-001","sku":"DCT-8926328","lot":"RCV-123"}'),
    { bin: 'WH-DN-001', sku: 'DCT-8926328', lot: 'RCV-123' },
  );
  assert.deepEqual(
    pickBarcode.parsePickQrPayload('{"binCode":"WH-DN-001","productBarcode":"8930000000123"}'),
    { bin: 'WH-DN-001', sku: '8930000000123' },
  );
  assert.deepEqual(pickBarcode.parsePickQrPayload('ORCA-PICK:WH-DN-001|DCT-8926328|RCV-123'), {
    bin: 'WH-DN-001',
    sku: 'DCT-8926328',
    lot: 'RCV-123',
  });
  assert.equal(pickBarcode.parsePickQrPayload('5aa04468-86c7-4c9e-981b-c9c65a2bcdbb'), null);
  assert.equal(pickBarcode.parsePickQrPayload('DCT-8926328'), null);
  assert.equal(pickBarcode.parsePickQrPayload('{}'), null);
});

test('getNextPickScanField advances sequentially for USB and camera scans', () => {
  assert.equal(pickBarcode.getNextPickScanField('binScan'), 'skuScan');
  assert.equal(pickBarcode.getNextPickScanField('skuScan'), 'lotScan');
  assert.equal(pickBarcode.getNextPickScanField('lotScan'), 'qty');
});

test('PickingWorkspace integrates shared BarcodeScanButton and single-QR PickLineLabels without private fields', () => {
  const workspaceSource = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const labelsSource = readFileSync(
    new URL('../src/features/orders/components/PickLineLabels.tsx', import.meta.url),
    'utf8',
  );
  assert.match(workspaceSource, /BarcodeScanButton/);
  assert.match(workspaceSource, /PickLineLabels/);
  assert.match(labelsSource, /QRCode\.toDataURL/);
  assert.doesNotMatch(labelsSource, /encodeCode128|codAmount|recipientPhone|declaredValue/);
});

test('All operational warehouse labels and scan controls are unified on QR', () => {
  const asnLabelsSource = readFileSync(
    new URL('../src/features/inbound/components/AsnLabels.tsx', import.meta.url),
    'utf8',
  );
  const packingSource = readFileSync(
    new URL('../src/features/orders/components/PackingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const scanButtonSource = readFileSync(
    new URL('../src/components/Common/BarcodeScanButton/BarcodeScanButton.tsx', import.meta.url),
    'utf8',
  );
  assert.match(asnLabelsSource, /QRCode\.toDataURL/);
  assert.doesNotMatch(asnLabelsSource, /encodeCode128/);
  assert.match(packingSource, /QrCodeImage/);
  assert.doesNotMatch(packingSource, /encodeLabelBarcode/);
  assert.match(scanButtonSource, /QrCode/);
  assert.doesNotMatch(scanButtonSource, /ScanLine/);
});

test('Picking barcode i18n keys exist in both vi.json and en.json', () => {
  const vi = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
  for (const key of [
    'scanProgress',
    'continueScan',
    'previousStep',
    'skipLot',
    'resolvingBin',
    'viewQrLabels',
    'lineQr',
    'pickLabelsTitle',
    'pickLabelsHint',
    'previousLabel',
    'nextLabel',
    'labelProgress',
    'labelBin',
    'labelSku',
    'labelLot',
    'printLabels',
    'closeLabels',
    'printError',
  ]) {
    assert.ok(vi.Picking[key], `Missing vi.Picking.${key}`);
    assert.ok(en.Picking[key], `Missing en.Picking.${key}`);
  }
  for (const field of ['binScan', 'skuScan', 'lotScan']) {
    assert.ok(vi.Picking.scanCamera[field], `Missing vi.Picking.scanCamera.${field}`);
    assert.ok(en.Picking.scanCamera[field], `Missing en.Picking.scanCamera.${field}`);
  }
  assert.ok(vi.Picking.errors.LOT_SCAN_REQUIRED);
  assert.ok(en.Picking.errors.LOT_SCAN_REQUIRED);
});

test('pickingApi.resolveBinCode maps bin UUID barcode to binCode and falls back to null on error', async () => {
  const originalGet = apiClient.get;
  const calls = [];
  apiClient.get = async (path, options) => {
    calls.push({ path, params: options.params });
    if (options.params.code === '5aa04468-86c7-4c9e-981b-c9c65a2bcdbb') {
      return {
        data: {
          binId: '00000000-0000-4000-8000-000000000099',
          binCode: 'WH-DN-001',
          barcode: '5aa04468-86c7-4c9e-981b-c9c65a2bcdbb',
          zoneCode: 'HCM-001',
          zoneType: 'STORAGE',
        },
      };
    }
    throw new Error('404 not found');
  };
  try {
    const resolved = await pickingApi.resolveBinCode(
      'warehouse-1',
      '5aa04468-86c7-4c9e-981b-c9c65a2bcdbb',
    );
    assert.equal(resolved, 'WH-DN-001');
    assert.deepEqual(calls[0], {
      path: '/v1/warehouses/warehouse-1/mobile-inbound/bins/lookup',
      params: { code: '5aa04468-86c7-4c9e-981b-c9c65a2bcdbb' },
    });
    const missing = await pickingApi.resolveBinCode('warehouse-1', 'unknown-code');
    assert.equal(missing, null);
  } finally {
    apiClient.get = originalGet;
  }
});
