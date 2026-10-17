import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, schema;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schema = await server.ssrLoadModule('/src/features/tenants/schemas/serviceTariffSchema.ts');
});
after(async () => {
  await server?.close();
});
const line = {
  feeType: 'PICK_PACK_ORDER',
  unit: 'ORDER',
  lowerBound: '0',
  upperBound: null,
  unitPriceVnd: '8000',
  rounding: 'CEIL_VND',
};
const form = () => ({
  code: 'FULFILLMENT',
  versionNo: 1,
  effectiveFrom: '2026-11-01T00:00:00Z',
  effectiveTo: '',
  reason: 'Reviewed demonstration rates',
  lines: [{ ...line }],
});

test('accepts exact VND and fractional quantities without Number conversion', () => {
  assert.equal(
    schema.serviceTariffFormSchema.safeParse({
      ...form(),
      lines: [{ ...line, unitPriceVnd: '99999999999999999999' }],
    }).success,
    true,
  );
});
test('rejects malformed numbers as validation errors without throwing BigInt exceptions', () => {
  for (const lowerBound of ['invalid', '-1', '1e3', '0.0000001'])
    assert.equal(
      schema.serviceTariffFormSchema.safeParse({ ...form(), lines: [{ ...line, lowerBound }] })
        .success,
      false,
    );
  for (const unitPriceVnd of ['-1', '8.5', 8000, '100000000000000000000'])
    assert.equal(
      schema.serviceTariffFormSchema.safeParse({ ...form(), lines: [{ ...line, unitPriceVnd }] })
        .success,
      false,
    );
});
test('rejects overlapping or gapped bands and accepts contiguous half-open bands', () => {
  for (const lower of ['9', '11'])
    assert.equal(
      schema.serviceTariffFormSchema.safeParse({
        ...form(),
        lines: [
          { ...line, upperBound: '10' },
          { ...line, lowerBound: lower },
        ],
      }).success,
      false,
    );
  assert.equal(
    schema.serviceTariffFormSchema.safeParse({
      ...form(),
      lines: [
        { ...line, upperBound: '10' },
        { ...line, lowerBound: '10' },
      ],
    }).success,
    true,
  );
});
test('requires valid dates, reason, matching unit and an open final band', () => {
  for (const override of [
    { effectiveFrom: '2026-02-30T00:00:00Z' },
    { effectiveTo: '2026-10-01T00:00:00Z' },
    { reason: '   ' },
    { lines: [{ ...line, unit: 'CARTON' }] },
    { lines: [{ ...line, upperBound: '10' }] },
  ])
    assert.equal(
      schema.serviceTariffFormSchema.safeParse({ ...form(), ...override }).success,
      false,
    );
});
