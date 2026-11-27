import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let volume;
let binFormSchema;

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    root,
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  volume = await server.ssrLoadModule('/src/lib/volumeValidation.ts');
  ({ binFormSchema } = await server.ssrLoadModule(
    '/src/features/catalog/schemas/warehouseLayoutSchema.ts',
  ));
});

after(() => server?.close());

test('storage volumes accept either decimal separator and preserve exact digits', () => {
  for (const [input, expected] of [
    ['1,5', '1.5'],
    ['1.5', '1.5'],
    [' 0,000001 ', '0.000001'],
    ['99999999999999,999999', '99999999999999.999999'],
    ['10.010000', '10.010000'],
    ['1,234', '1.234'],
  ]) {
    assert.equal(volume.positiveStorageVolumeSchema.parse(input), expected);
    assert.equal(volume.storageVolumeSchema.parse(input), expected);
  }
});

test('storage volumes reject mixed and repeated separators, invalid notation and overflow', () => {
  for (const input of [
    '',
    '  ',
    '-1',
    '+1',
    'NaN',
    'Infinity',
    '1e2',
    '1 m³',
    '1.234,5',
    '1,234.5',
    '1.2.3',
    '1,2,3',
    '1 234',
    '1\u00a0234',
    '1,',
    '.5',
    '01',
    '0.0000001',
    '100000000000000',
    1.5,
  ]) {
    assert.equal(volume.storageVolumeSchema.safeParse(input).success, false, JSON.stringify(input));
    assert.equal(
      volume.positiveStorageVolumeSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    );
  }
});

test('offering a zero allowance is valid while zero cubic metres cannot be saved to a bin', () => {
  for (const input of ['0', '0.000000', '0,000000']) {
    assert.equal(volume.storageVolumeSchema.parse(input), input.replace(',', '.'));
    const result = volume.positiveStorageVolumeSchema.safeParse(input);
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].message, 'positive');
  }
});

test('single, edit and bulk bin payloads normalize the volume and preserve other fields', () => {
  const values = {
    mode: 'single',
    code: 'A-01',
    maxWeightG: '100000000000000001',
    maxVolumeM3: '99999999999999,999999',
    isActive: true,
    aisleStart: 1,
    aisleCount: 1,
    rackStart: 1,
    rackCount: 1,
    levelStart: 1,
    levelCount: 1,
  };
  for (const input of [
    values,
    { ...values, isActive: false },
    { ...values, mode: 'bulk', code: '', aisleCount: 2 },
  ]) {
    assert.deepEqual(binFormSchema.parse(input), {
      ...input,
      maxVolumeM3: '99999999999999.999999',
    });
    const rejected = binFormSchema.safeParse({ ...input, maxVolumeM3: '0' });
    assert.equal(rejected.success, false);
    assert.deepEqual(rejected.error.issues[0].path, ['maxVolumeM3']);
  }
});

test('capacity text keeps the integer and fractional digits exact across both locales', () => {
  const format = volume.formatCapacityDecimal;
  assert.equal(
    format('999999999999999999999999.012345', 'vi'),
    '999.999.999.999.999.999.999.999,012345',
  );
  assert.equal(
    format('999999999999999999999999.012345', 'en'),
    '999,999,999,999,999,999,999,999.012345',
  );
  assert.equal(format('0.000001', 'vi'), '0,000001');
  assert.equal(format('0.000000', 'en'), '0');
  assert.equal(format('12.340000', 'en'), '12.34');
  assert.equal(format('100000000000000001', 'en'), '100,000,000,000,000,001');
  assert.equal(format('12.3.45', 'en'), '12.3.45');
});
