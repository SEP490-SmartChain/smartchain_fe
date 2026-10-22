import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, geometry, schemas, view;
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
  view = await server.ssrLoadModule('/src/features/catalog/utils/warehouseView.ts');
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


test('view search finds code and barcode without rewriting catalog or draft', () => {
  const bins = [bin, { ...bin, id: uuid(5), code: 'OTHER', barcode: 'SCAN-0002' }];
  const plan = geometry.arrangeVisualPlan([zone], bins), before = JSON.stringify({ zone, bins, plan });
  const filter = (search) => view.filterWarehouseEntities([zone], bins, plan, { ...view.defaultWarehouseViewFilters, search }, 'en');
  assert.deepEqual(filter(' scan-0002 '), [{ kind: 'bin', id: uuid(5) }]);
  assert.deepEqual(filter('store'), [{ kind: 'zone', id: zoneId }]);
  assert.equal(filter('unknown').length, 0);
  assert.equal(JSON.stringify({ zone, bins, plan }), before);
});
test('view filters intersect parent zone, zone type and each object status', () => {
  const zones = [zone, { ...zone, id: uuid(6), zoneType: 'QUARANTINE', isActive: false }];
  const bins = [bin, { ...bin, id: uuid(5), zoneId: uuid(6), isActive: true }, { ...bin, id: uuid(7), zoneId: uuid(6), isActive: false }];
  const plan = geometry.arrangeVisualPlan(zones, bins);
  const matches = view.filterWarehouseEntities(zones, bins, plan, { ...view.defaultWarehouseViewFilters, zoneId: uuid(6), zoneType: 'QUARANTINE', status: 'active' }, 'vi');
  assert.deepEqual(matches, [{ kind: 'bin', id: uuid(5) }]);
  assert.deepEqual(view.filterWarehouseEntities(zones, bins, plan, { ...view.defaultWarehouseViewFilters, zoneId: uuid(6), zoneType: 'STORAGE' }, 'vi'), []);
});
test('placement filters include unplaced catalog entries and clear restores all results', () => {
  const zones = [zone, { ...zone, id: uuid(6) }];
  const bins = [bin, { ...bin, id: uuid(5), zoneId: uuid(6) }, { ...bin, id: uuid(7) }];
  const plan = { ...geometry.arrangeVisualPlan([zone], [bin]), bins: [{ binId, x: 1, z: 1 }] };
  assert.deepEqual(view.filterWarehouseEntities(zones, bins, plan, { ...view.defaultWarehouseViewFilters, placement: 'unplaced' }, 'en'), [{ kind: 'zone', id: uuid(6) }, { kind: 'bin', id: uuid(5) }, { kind: 'bin', id: uuid(7) }]);
  assert.equal(view.filterWarehouseEntities(zones, bins, plan, view.defaultWarehouseViewFilters, 'en').length, 5);
  assert.equal(view.filterWarehouseEntities([], [], { ...plan, zones: [], bins: [] }, view.defaultWarehouseViewFilters, 'en').length, 0);
});
test('filtering out an obstacle never permits overlapping it', () => {
  const bins = [bin, { ...bin, id: uuid(5), code: 'OBSTACLE', barcode: 'OTHER' }];
  const plan = geometry.arrangeVisualPlan([zone], bins);
  assert.equal(view.filterWarehouseEntities([zone], bins, plan, { ...view.defaultWarehouseViewFilters, search: 'BIN-1' }, 'en').length, 1);
  assert.equal(geometry.moveVisualEntity(plan, { kind: 'bin', id: binId }, plan.bins[1].x, plan.bins[1].z, [zone], bins), null);
});
test('focus bounds follow the correct parent zone after zone or bin moves', () => {
  const zones = [zone, { ...zone, id: uuid(6) }], bins = [{ ...bin, zoneId: uuid(6) }];
  const plan = { schemaVersion: 1, width: 64, depth: 64, zones: [{ zoneId, x: 1, z: 1, width: 8, depth: 8 }, { zoneId: uuid(6), x: 25, z: 35, width: 8, depth: 8 }], bins: [{ binId, x: 3, z: 4 }] };
  assert.deepEqual(view.warehouseEntityBounds({ kind: 'bin', id: binId }, plan, bins), { x: 28, z: 39, width: 1, depth: 1 });
  const moved = geometry.moveVisualEntity(plan, { kind: 'zone', id: uuid(6) }, 40, 40, zones, bins);
  assert.deepEqual(view.warehouseEntityBounds({ kind: 'bin', id: binId }, moved, bins), { x: 43, z: 44, width: 1, depth: 1 });
  assert.deepEqual(view.warehouseEntityBounds({ kind: 'zone', id: uuid(6) }, plan, bins), { x: 25, z: 35, width: 8, depth: 8 });
  for (const entity of [{ kind: 'bin', id: uuid(99) }, { kind: 'zone', id: uuid(99) }]) assert.equal(view.warehouseEntityBounds(entity, plan, bins), null);
  assert.equal(view.warehouseEntityBounds({ kind: 'bin', id: binId }, { ...plan, zones: [] }, bins), null);
});
test('camera framing keeps all bounds corners within desktop HUD and mobile viewport', async () => {
  const THREE = await import('three');
  for (const [width, height, reserved] of [[1280, 640, 326], [360, 410, 0]]) {
    for (const [w, d] of [[1, 1], [32, 32], [256, 16], [256, 256]]) {
      for (const top of [false, true]) {
        const bounds = { x: 40, z: 60, width: w, depth: d };
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 2000);
        camera.setViewOffset(width, height, reserved / 2, 0, width, height);
        const target = new THREE.Vector3(40 + w / 2, 0.5, 60 + d / 2);
        const distance = view.warehouseCameraDistance(bounds, width / height, 38, (width - reserved) / width);
        camera.position.copy(new THREE.Vector3(top ? 0 : 0.7, top ? 1 : 1.2, top ? 0.00001 : 0.9).normalize().multiplyScalar(distance).add(target));
        camera.lookAt(target); camera.updateMatrixWorld();
        for (const x of [40, 40 + w]) for (const z of [60, 60 + d]) for (const y of [0, 1.5]) {
          const projected = new THREE.Vector3(x, y, z).project(camera), screenX = (projected.x + 1) / 2 * width;
          assert.ok(screenX >= 0 && screenX <= width - reserved, `horizontal fit ${w}/${d}/${width}`);
          assert.ok(Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1, `vertical/depth fit ${w}/${d}/${width}`);
        }
      }
    }
  }
});
test('floor resize preserves positions and refuses to clip a zone or exceed schema limits', () => {
  const plan = geometry.arrangeVisualPlan([zone], [bin]), before = JSON.stringify(plan);
  const enlarged = { ...plan, width: 64, depth: 64 };
  assert.equal(geometry.validVisualPlan(enlarged, [zone], [bin]), true);
  assert.deepEqual(enlarged.zones, plan.zones); assert.deepEqual(enlarged.bins, plan.bins);
  const edgePlan = { ...plan, zones: [{ ...plan.zones[0], x: 20 }] };
  assert.equal(geometry.validVisualPlan({ ...edgePlan, width: 16 }, [zone], [bin]), false);
  assert.equal(geometry.validVisualPlan({ ...plan, width: 257 }, [zone], [bin]), false);
  assert.equal(JSON.stringify(plan), before);
});
