import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let selectionModel;
let selectionState;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  selectionModel = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/model/orderFreightCoordinator.ts',
  );
  selectionState = await server.ssrLoadModule(
    '/src/features/orders/seller-freight/order-selection/model/orderSelectionState.ts',
  );
});

after(async () => {
  await server?.close();
});

test('selection state helpers toggle rows, page visible subset, and prune invisibles', () => {
  const s1 = selectionState.toggleVisibleOrderSelection(new Set(), ['o1', 'o2']);
  assert.deepEqual([...s1], ['o1', 'o2']);
  const s2 = selectionState.toggleOrderSelection(s1, 'o1');
  assert.deepEqual([...s2], ['o2']);
  const s3 = selectionState.retainOrderSelection(new Set(['o2', 'o99']), ['o1', 'o2']);
  assert.deepEqual([...s3], ['o2']);
});

test('OrderFreightCoordinator chunks 50 orderIds into <=5/req with <=2 concurrency, handles 429 retry, and protects RECORDED from late ESTIMATED', async () => {
  const orderIds = Array.from({ length: 50 }, (_, idx) => {
    const suffix = String(idx + 1).padStart(12, '0');
    return `00001030-0000-4000-8000-${suffix}`;
  });

  let activeLookups = 0;
  let maxConcurrentLookups = 0;
  let rateLimitedOnce = false;
  const chunkSizes = [];
  const waits = [];

  const client = {
    orderStatus: async (ids) =>
      ids.map((orderId) => ({
        orderId,
        state: 'VISIBLE',
        orderVersion: 2,
        sourceRevision: `rev-${orderId.slice(-2)}`,
        asOf: '2026-11-28T03:35:00.000Z',
        parcelCount: 1,
        recorded:
          orderId === orderIds[0]
            ? { count: 1, subtotalVnd: '35000' }
            : { count: 0, subtotalVnd: null },
        estimated: { count: 0, subtotalVnd: null },
        parcels: [
          {
            fulfillmentOrderId: `00001050-0000-4000-8000-${orderId.slice(-12)}`,
            freight:
              orderId === orderIds[0]
                ? {
                    state: 'RECORDED',
                    amountVnd: '35000',
                    recordedAt: '2026-11-28T03:10:00.000Z',
                  }
                : { state: 'NOT_QUOTED' },
          },
        ],
      })),
    orderLookup: async (items) => {
      activeLookups += 1;
      maxConcurrentLookups = Math.max(maxConcurrentLookups, activeLookups);
      chunkSizes.push(items.length);
      try {
        await Promise.resolve();
        if (!rateLimitedOnce && items[0].orderId === orderIds[5]) {
          rateLimitedOnce = true;
          throw { status: 429, retryAfterSeconds: 2 };
        }
        return items.reverse().map((item) => ({
          orderId: item.orderId,
          state: 'VISIBLE',
          orderVersion: 2,
          sourceRevision: `rev-${item.orderId.slice(-2)}`,
          asOf: '2026-11-28T03:36:00.000Z',
          parcelCount: 1,
          recorded: { count: 0, subtotalVnd: null },
          estimated: { count: 1, subtotalVnd: '32000' },
          parcels: [
            {
              fulfillmentOrderId: `00001050-0000-4000-8000-${item.orderId.slice(-12)}`,
              freight: {
                state: 'ESTIMATED',
                amountVnd: '32000',
                quotedAt: '2026-11-28T03:36:00.000Z',
                refreshAfter: '2026-11-28T03:41:00.000Z',
                tier: 'ECONOMY',
                basis: 'PACKED',
                origin: {
                  id: '00000400-0000-4000-8000-000000000001',
                  code: 'HCM-01',
                  name: 'Kho Thủ Đức',
                },
              },
            },
          ],
        }));
      } finally {
        activeLookups -= 1;
      }
    },
  };

  const coord = new selectionModel.OrderFreightCoordinator(
    client,
    'tenant-a:user-a',
    async (ms) => {
      waits.push(ms);
    },
  );

  await coord.refreshStatus(orderIds);
  assert.equal(coord.getState().rowsByOrderId[orderIds[0]].recorded.subtotalVnd, '35000');

  await coord.lookupOrders(orderIds.map((orderId) => ({ orderId })));
  assert.equal(maxConcurrentLookups <= 2, true);
  assert.equal(
    chunkSizes.every((s) => s <= 5),
    true,
  );
  assert.deepEqual(waits, [2000]);
  assert.equal(coord.getState().lookupProgress.completedOrders, 50);
  assert.equal(coord.getState().lookupProgress.failedOrderIds.length, 0);

  // Even when reversed lookup tried to emit ESTIMATED for orderIds[0], cached RECORDED stays RECORDED!
  const firstRow = coord.getState().rowsByOrderId[orderIds[0]];
  assert.equal(firstRow.parcels[0].freight.state, 'RECORDED');
  assert.equal(firstRow.recorded.subtotalVnd, '35000');
  assert.equal(firstRow.estimated.count, 0);

  // Subsequent refreshStatus with unchanged sourceRevision preserves unexpired ESTIMATED on orderIds[1]!
  const quotedNow = Date.parse('2026-11-28T03:37:00.000Z');
  await coord.refreshStatus([orderIds[1]], quotedNow);
  assert.equal(coord.getState().rowsByOrderId[orderIds[1]].parcels[0].freight.state, 'ESTIMATED');

  // Expired estimate is NOT preserved when DB reports NOT_QUOTED after refreshAfter.
  const expiredNow = Date.parse('2026-11-28T03:42:00.000Z');
  await coord.refreshStatus([orderIds[1]], expiredNow);
  assert.equal(coord.getState().rowsByOrderId[orderIds[1]].parcels[0].freight.state, 'NOT_QUOTED');

  // Scope switch wipes entire table+detail freight state.
  coord.resetScope('tenant-b:user-b');
  assert.deepEqual(coord.getState().rowsByOrderId, {});

  // Background refreshStatus fails closed silently on abort or transient network error without unhandled rejection.
  const failingCoord = new selectionModel.OrderFreightCoordinator(
    {
      orderStatus: async () => {
        throw new Error('Network reset');
      },
      orderLookup: async () => [],
    },
    'tenant-a:user-a',
  );
  await failingCoord.refreshStatus(['00001030-0000-0000-0000-000000000001']);
  assert.equal(failingCoord.getState().statusLoading, false);
});

test('Finding #5: OrderFreightCoordinator retries deferred NOT_QUOTED orders after partial batch completion and 429 backoff', async () => {
  const orderIds = Array.from(
    { length: 5 },
    (_, idx) => `00001030-0000-4000-8000-00000000004${idx}`,
  );
  const waits = [];
  const calls = [];
  let budget = 10;

  const client = {
    orderStatus: async () => [],
    orderLookup: async (items) => {
      calls.push(items.map((i) => i.orderId));
      await Promise.resolve();
      const rows = [];
      let admittedAny = false;
      for (const item of items) {
        if (budget >= 3) {
          budget -= 3;
          admittedAny = true;
          rows.push({
            orderId: item.orderId,
            state: 'VISIBLE',
            orderVersion: 1,
            sourceRevision: `rev-${item.orderId.slice(-1)}`,
            asOf: '2026-11-28T03:36:00.000Z',
            parcelCount: 3,
            recorded: { count: 0, subtotalVnd: null },
            estimated: { count: 3, subtotalVnd: '96000' },
            parcels: [1, 2, 3].map((p) => ({
              fulfillmentOrderId: `${item.orderId}-fo-${p}`,
              freight: {
                state: 'ESTIMATED',
                amountVnd: '32000',
                quotedAt: '2026-11-28T03:36:00.000Z',
                refreshAfter: '2026-11-28T03:41:00.000Z',
                tier: 'ECONOMY',
                basis: 'PACKED',
                origin: { id: 'o-1', code: 'HCM', name: 'Kho HCM' },
              },
            })),
          });
        } else if (!admittedAny) {
          throw { status: 429, retryAfterSeconds: 15 };
        } else {
          rows.push({
            orderId: item.orderId,
            state: 'VISIBLE',
            orderVersion: 1,
            sourceRevision: `rev-${item.orderId.slice(-1)}`,
            asOf: '2026-11-28T03:36:00.000Z',
            parcelCount: 3,
            recorded: { count: 0, subtotalVnd: null },
            estimated: { count: 0, subtotalVnd: null },
            parcels: [1, 2, 3].map((p) => ({
              fulfillmentOrderId: `${item.orderId}-fo-${p}`,
              freight: { state: 'NOT_QUOTED' },
            })),
          });
        }
      }
      return rows;
    },
  };

  const coord = new selectionModel.OrderFreightCoordinator(
    client,
    'tenant-a:user-a',
    async (ms) => {
      waits.push(ms);
      budget = 10;
    },
  );

  await coord.lookupOrders(orderIds.map((orderId) => ({ orderId })));
  assert.deepEqual(waits, [15000]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], orderIds);
  assert.deepEqual(calls[1], orderIds.slice(3));
  assert.deepEqual(calls[2], orderIds.slice(3));
  assert.equal(coord.getState().lookupProgress.completedOrders, 5);
  assert.equal(coord.getState().lookupProgress.failedOrderIds.length, 0);
  for (const id of orderIds) {
    assert.equal(coord.getState().rowsByOrderId[id].estimated.subtotalVnd, '96000');
  }
});

test('Finding #6: buildAssumptionModalTargets and buildLookupItemsFromAssumptions preserve independent dimensions per NEEDS_INPUT parcel', () => {
  const orderId = '00001030-0000-4000-8000-000000000050';
  const rowsByOrderId = {
    [orderId]: {
      orderId,
      state: 'VISIBLE',
      orderVersion: 1,
      sourceRevision: 'rev-a',
      asOf: '2026-11-28T03:35:00.000Z',
      parcelCount: 2,
      recorded: { count: 0, subtotalVnd: null },
      estimated: { count: 0, subtotalVnd: null },
      parcels: [
        { fulfillmentOrderId: 'fo-small', freight: { state: 'NEEDS_INPUT', fields: ['parcel'] } },
        { fulfillmentOrderId: 'fo-large', freight: { state: 'NEEDS_INPUT', fields: ['parcel'] } },
      ],
    },
  };
  const targets = selectionState.buildAssumptionModalTargets([orderId], rowsByOrderId);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].requiresOrigin, false);
  assert.equal(targets[1].requiresOrigin, false);

  const defaultParcel = { weightG: 500, lengthCm: 20, widthCm: 15, heightCm: 10, itemCount: 1 };
  const initialParcels = selectionState.createInitialAssumptionParcels(targets, defaultParcel);
  initialParcels[targets[0].key] = { ...defaultParcel, weightG: 300, lengthCm: 10 };
  initialParcels[targets[1].key] = { ...defaultParcel, weightG: 4500, lengthCm: 60 };

  const items = selectionState.buildLookupItemsFromAssumptions({
    targetOrderIds: [orderId],
    rowsByOrderId,
    parcelsByKey: initialParcels,
    selectedOriginId: 'wh-unused',
    defaultParcel,
  });
  assert.equal(items[0].assumptions.length, 2);
  assert.deepEqual(items[0].assumptions[0], {
    fulfillmentOrderId: 'fo-small',
    parcel: { weightG: 300, lengthCm: 10, widthCm: 15, heightCm: 10, itemCount: 1 },
  });
  assert.deepEqual(items[0].assumptions[1], {
    fulfillmentOrderId: 'fo-large',
    parcel: { weightG: 4500, lengthCm: 60, widthCm: 15, heightCm: 10, itemCount: 1 },
  });
});

test('Finding #8: late ESTIMATED response from older sourceRevision never overwrites newer status revision even when orderVersion stays equal', async () => {
  const orderId = '00001030-0000-4000-8000-000000000060';
  let statusCall = 0;
  let resolveLookup;

  const client = {
    orderStatus: async () => {
      statusCall += 1;
      if (statusCall === 1) {
        return [
          {
            orderId,
            state: 'VISIBLE',
            orderVersion: 1,
            sourceRevision: 'rev-old-parcel',
            asOf: '2026-11-28T03:35:00.000Z',
            parcelCount: 1,
            recorded: { count: 0, subtotalVnd: null },
            estimated: { count: 0, subtotalVnd: null },
            parcels: [{ fulfillmentOrderId: 'fo-1', freight: { state: 'NOT_QUOTED' } }],
          },
        ];
      }
      return [
        {
          orderId,
          state: 'VISIBLE',
          orderVersion: 1,
          sourceRevision: 'rev-new-parcel',
          asOf: '2026-11-28T03:35:10.000Z',
          parcelCount: 1,
          recorded: { count: 0, subtotalVnd: null },
          estimated: { count: 0, subtotalVnd: null },
          parcels: [{ fulfillmentOrderId: 'fo-1', freight: { state: 'NOT_QUOTED' } }],
        },
      ];
    },
    orderLookup: () =>
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
  };

  const coord = new selectionModel.OrderFreightCoordinator(client, 'tenant-a:user-a');
  await coord.refreshStatus([orderId]);
  assert.equal(coord.getState().rowsByOrderId[orderId].sourceRevision, 'rev-old-parcel');

  const pendingLookup = coord.lookupOrders([{ orderId }]);
  // While lookup for rev-old-parcel is in flight, parcel changes & status updates sourceRevision with unchanged orderVersion=1!
  await coord.refreshStatus([orderId]);
  assert.equal(coord.getState().rowsByOrderId[orderId].sourceRevision, 'rev-new-parcel');

  resolveLookup([
    {
      orderId,
      state: 'VISIBLE',
      orderVersion: 1,
      sourceRevision: 'rev-old-parcel',
      asOf: '2026-11-28T03:35:20.000Z',
      parcelCount: 1,
      recorded: { count: 0, subtotalVnd: null },
      estimated: { count: 1, subtotalVnd: '32000' },
      parcels: [
        {
          fulfillmentOrderId: 'fo-1',
          freight: {
            state: 'ESTIMATED',
            amountVnd: '32000',
            quotedAt: '2026-11-28T03:35:20.000Z',
            refreshAfter: '2026-11-28T03:40:20.000Z',
            tier: 'ECONOMY',
            basis: 'PACKED',
            origin: { id: 'o-1', code: 'HCM', name: 'Kho HCM' },
          },
        },
      ],
    },
  ]);
  await pendingLookup;

  const finalRow = coord.getState().rowsByOrderId[orderId];
  assert.equal(finalRow.sourceRevision, 'rev-new-parcel');
  assert.equal(finalRow.estimated.count, 0);
  assert.equal(finalRow.parcels[0].freight.state, 'NOT_QUOTED');
});
