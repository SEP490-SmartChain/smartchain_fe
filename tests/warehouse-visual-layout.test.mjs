import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, geometry, schemas;
const originalFetch = globalThis.fetch;
const uuid = (n) => `10570000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const warehouseId = uuid(1), zoneId = uuid(2), binId = uuid(3);
const zone = { id: zoneId, warehouseId, code: 'STORE', zoneType: 'STORAGE', isActive: true, updatedAt: '2026-10-21T00:00:00Z' };
const bin = { id: binId, warehouseId, zoneId, code: 'BIN-1', barcode: 'BIN-1', maxWeightG: '100000000000000001', maxVolumeM3: '0.123456', isActive: true, version: 1 };
const page = { limit: 100, hasNext: false, nextCursor: null };
const ok = (data, pagination) => Response.json({ success: true, data, meta: { ...(pagination ? { pagination } : {}) } });
before(async () => {
  server = await createServer({ configFile: false, envFile: false, optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL('..', import.meta.url)), resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, server: { middlewareMode: true, watch: null, ws: false } });
  ({ warehouseVisualLayoutApi: api } = await server.ssrLoadModule('/src/features/catalog/api/warehouseVisualLayoutApi.ts'));
  geometry = await server.ssrLoadModule('/src/features/catalog/utils/visualLayout.ts');
  schemas = await server.ssrLoadModule('/src/features/catalog/schemas/warehouseVisualLayoutSchema.ts');
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts');
  useAuthStore.getState().setSession({ accessToken: 'synthetic-layout-test', expiresIn: 900, user: { userId: uuid(4), tenantId: null, actorScope: 'PLATFORM', roles: ['WAREHOUSE_MANAGER'], email: 'visual@example.test', fullName: 'Synthetic test', permissions: [], warehouseIds: [warehouseId] } });
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('auto-arranges actual IDs and preserves exact capacity strings', () => {
  const plan = geometry.arrangeVisualPlan([zone], [bin]);
  assert.equal(geometry.validVisualPlan(plan, [zone], [bin]), true);
  assert.equal(plan.zones[0].zoneId, zoneId); assert.equal(plan.bins[0].binId, binId);
  assert.equal(bin.maxWeightG, '100000000000000001');
});
test('snaps coordinates and rejects collision, foreign IDs and out-of-zone placement', () => {
  const bins = [bin, { ...bin, id: uuid(5) }], plan = geometry.arrangeVisualPlan([zone], bins);
  const entity = { kind: 'bin', id: binId };
  assert.equal(geometry.moveVisualEntity(plan, entity, 2.1, 2.3, [zone], bins).bins[0].x, 2);
  assert.equal(geometry.moveVisualEntity(plan, entity, plan.bins[1].x, plan.bins[1].z, [zone], bins), null);
  assert.equal(geometry.moveVisualEntity(plan, entity, -1, 0, [zone], bins), null);
  assert.equal(geometry.moveVisualEntity(plan, entity, 127, 127, [zone], bins), null);
  assert.equal(geometry.validVisualPlan({ ...plan, bins: [{ binId: uuid(999), x: 0, z: 0 }] }, [zone], bins), false);
  assert.equal(geometry.moveVisualEntity(plan, entity, NaN, 0, [zone], bins), null);
});
test('zone moves preserve child positions and reject overlapping zones', () => {
  const zones = [zone, { ...zone, id: uuid(6) }], plan = geometry.arrangeVisualPlan(zones, [bin]);
  assert.deepEqual(geometry.moveVisualEntity(plan, { kind: 'zone', id: zoneId }, 1, 20, zones, [bin]).bins, plan.bins);
  assert.equal(geometry.moveVisualEntity(plan, { kind: 'zone', id: zoneId }, plan.zones[1].x, plan.zones[1].z, zones, [bin]), null);
});
test('maximum supported catalog creates a valid arrangement', () => {
  const zones = Array.from({ length: 100 }, (_, i) => ({ ...zone, id: uuid(100 + i) }));
  const bins = Array.from({ length: 1000 }, (_, i) => ({ ...bin, id: uuid(1000 + i), zoneId: zones[i % zones.length].id }));
  const plan = geometry.arrangeVisualPlan(zones, bins);
  assert.equal(geometry.validVisualPlan(plan, zones, bins), true);
  assert.ok(Buffer.byteLength(JSON.stringify({ expectedRevision: 1, plan })) < 100 * 1024);
  assert.throws(() => geometry.arrangeVisualPlan(zones, [...bins, bin]), /VISUAL_LAYOUT_LIMIT/);
});
test('saved layout contracts reject partial revisions, extra fields and duplicate IDs', () => {
  const plan = geometry.arrangeVisualPlan([zone], [bin]);
  for (const data of [{ revision: 1, plan: null, savedAt: null }, { revision: 0, plan, savedAt: null }, { revision: 1, plan: { ...plan, zones: [...plan.zones, ...plan.zones] }, savedAt: '2026-10-21T00:00:00Z' }, { revision: 1, plan, savedAt: '2026-10-21T00:00:00Z', tenantId: uuid(8) }]) assert.equal(schemas.visualLayoutSchema.safeParse(data).success, false);
});
test('save sends expected revision and abort signal without authority fields', async () => {
  const signal = new AbortController().signal, plan = geometry.arrangeVisualPlan([zone], [bin]);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith(`/warehouses/${warehouseId}/visual-layout`)); assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), { expectedRevision: 2, plan });
    return ok({ revision: 3, plan, savedAt: '2026-10-21T00:00:00Z' });
  };
  assert.equal((await api.save(warehouseId, 2, plan, signal)).revision, 3);
});
test('catalog follows every page and preserves the exact bin schema', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++; const parsed = new URL(url, 'https://example.test');
    if (parsed.pathname.endsWith('/zones')) return ok([zone], page);
    return parsed.searchParams.has('cursor') ? ok([{ ...bin, id: uuid(7) }], page) : ok([bin], { ...page, hasNext: true, nextCursor: binId });
  };
  const result = await api.catalog(warehouseId, new AbortController().signal);
  assert.equal(calls, 3); assert.equal(result.bins.length, 2); assert.equal(result.bins[0].maxVolumeM3, bin.maxVolumeM3);
});
test('catalog rejects foreign warehouses, duplicate pages and non-advancing cursors', async () => {
  for (const mode of ['foreign', 'duplicate', 'cursor']) {
    globalThis.fetch = async (url) => url.includes('/zones') ? ok([{ ...zone, ...(mode === 'foreign' ? { warehouseId: uuid(999) } : {}) }], page) : ok(mode === 'cursor' ? [] : [bin, bin], mode === 'cursor' ? { ...page, hasNext: true, nextCursor: binId } : page);
    await assert.rejects(api.catalog(warehouseId, new AbortController().signal));
  }
});
