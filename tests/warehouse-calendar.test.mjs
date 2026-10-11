import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schema;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const calendar = {
  warehouseId: id,
  version: 1,
  workingDays: [1, 2, 3, 4, 5],
  closedDates: ['2026-12-25'],
  timeZone: 'Asia/Ho_Chi_Minh',
  operatingStartMinute: 480,
  operatingEndMinute: 1080,
  cutoffMinute: 840,
  dailyCapacity: 10,
  capacityUsed: 2,
  capacityRemaining: 8,
  checkedAt: '2026-10-20T03:00:00.000Z',
  localDate: '2026-10-20',
  localMinute: 600,
  intakeEligible: true,
  allocationEligible: true,
  sameDayHandoverEligible: true,
  reasons: [],
};
const ok = (data) => Response.json({ success: true, data, meta: {} });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ warehouseApi: api } = await server.ssrLoadModule('/src/features/catalog/api/warehouseApi.ts'));
  schema = await server.ssrLoadModule('/src/features/catalog/schemas/warehouseCalendarSchema.ts');
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts');
  useAuthStore.getState().setSession({
    accessToken: 'synthetic-test-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_MANAGER'],
      email: 'calendar@example.test',
      fullName: 'Calendar Manager',
      permissions: [],
      warehouseIds: [id],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('calendar read sends the UTC instant and abort signal, with no identity overrides', async () => {
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    const request = new URL(url, 'https://example.test');
    assert.equal(request.pathname, `/api/v1/warehouses/${id}/calendar`);
    assert.deepEqual([...request.searchParams.keys()], ['at']);
    assert.equal(request.searchParams.get('at'), calendar.checkedAt);
    assert.equal(options.signal, signal);
    return ok(calendar);
  };
  assert.deepEqual(await api.calendar(id, calendar.checkedAt, signal), calendar);
});
test('calendar edit keeps the reviewed version, local dates and exact weekday values', async () => {
  const payload = { workingDays: [1, 2, 3, 4, 5], closedDates: ['2026-12-25'], expectedVersion: 1 };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), payload);
    return ok({ ...calendar, version: 2 });
  };
  assert.equal((await api.updateCalendar(id, payload)).version, 2);
});
for (const invalid of [
  { capacityUsed: -1 },
  { version: 0 },
  { reasons: ['UNKNOWN'] },
  { workingDays: [] },
  { checkedAt: 'invalid' },
]) {
  test(`calendar rejects malformed API fields: ${Object.keys(invalid)[0]}`, async () => {
    globalThis.fetch = async () => ok({ ...calendar, ...invalid });
    await assert.rejects(api.calendar(id), { name: 'ZodError' });
  });
}
for (const invalid of [
  { workingDays: [] },
  { workingDays: [1, 1] },
  { workingDays: [0, 8] },
  { closedDatesText: '2026-02-30' },
  { closedDatesText: '0000-01-01' },
  { closedDatesText: '2026-12-25\n2026-12-25' },
  { closedDatesText: '2026-12-25T00:00:00Z' },
]) {
  test(`calendar form rejects ${JSON.stringify(invalid)}`, () => {
    assert.equal(
      schema
        .warehouseCalendarSchema('Invalid calendar')
        .safeParse({ workingDays: [1, 2, 3, 4, 5], closedDatesText: '', ...invalid }).success,
      false,
    );
  });
}
test('valid leap date, comma/newline input and removal of all closed dates are supported', () => {
  const form = schema.warehouseCalendarSchema('Invalid calendar');
  assert.equal(
    form.safeParse({
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      closedDatesText: '2028-02-29, 2028-03-01\n2028-03-02',
    }).success,
    true,
  );
  assert.deepEqual(schema.closedDateList('2028-02-29, 2028-03-01\n2028-03-02'), [
    '2028-02-29',
    '2028-03-01',
    '2028-03-02',
  ]);
  assert.equal(form.safeParse({ workingDays: [7], closedDatesText: '' }).success, true);
});
test('calendar stale revision remains a conflict that asks the user to reload', async () => {
  globalThis.fetch = async () =>
    Response.json(
      { success: false, error: { code: 'WAREHOUSE.STALE', message: 'Refresh the warehouse' } },
      { status: 409 },
    );
  await assert.rejects(
    api.updateCalendar(id, { workingDays: [1], closedDates: [], expectedVersion: 1 }),
    { name: 'ApiError', code: 'WAREHOUSE.STALE', status: 409 },
  );
});
