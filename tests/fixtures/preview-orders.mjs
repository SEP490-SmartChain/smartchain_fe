// Isolated visual preview. No connection to a real API, Google Sheet or database.
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';

const productId = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-08T03:00:00.000Z';
const totalCostPreview = process.env['PREVIEW_TOTAL_COST'] === '1';
const money = {
  codAmount: '100000',
  totalAmount: '100000',
  declaredValue: '100000',
  customerShippingFee: '0',
  shippingFeePayer: 'SENDER',
};
const orders = Array.from({ length: 50 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
  externalOrderCode: `excel-${String(index + 1).padStart(3, '0')}`,
  sourceChannel: 'Excel',
  status: index === 0 ? 'ALLOCATED' : 'RECEIVED',
  createdAt: timestamp,
  updatedAt: timestamp,
  holdReason: null,
  version: 1,
}));
const accepted = new Map();
const server = await createServer({
  server: { host: '127.0.0.1', port: 2326, strictPort: true },
  plugins: [
    {
      name: 'isolated-order-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          const url = new URL(req.url, 'http://127.0.0.1');
          const owner = req.headers.authorization === 'Bearer preview-owner';
          const respond = (data, status = 200, pagination) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                data,
                meta: {
                  timestamp,
                  path: url.pathname,
                  requestId: 'preview',
                  ...(pagination ? { pagination } : {}),
                },
              }),
            );
          };
          if (url.pathname === '/api/v1/orders/locations')
            return respond([
              { code: '01', name: 'Hà Nội', type: 'PROVINCE', parentCode: null },
              { code: '00001', name: 'Ba Đình', type: 'WARD', parentCode: '01' },
            ]);
          if (url.pathname === '/api/v1/orders/import-preview')
            return respond({
              items: [
                {
                  row: 2,
                  rowId: 'internal.fixture',
                  externalOrderCode: 'ORCA-MẪU-001',
                  excelRows: [2],
                  status: 'READY',
                },
                {
                  row: 3,
                  rowId: 'internal.bad',
                  externalOrderCode: 'SHOP-002',
                  status: 'REJECTED',
                  code: 'ORDERS.INVALID_ADDRESS',
                  fields: ['toWardCode'],
                },
              ],
              accepted: 0,
              rejected: 1,
              ready: 1,
            });
          if (url.pathname === '/api/v1/catalog/products')
            return respond(
              [
                {
                  id: productId,
                  sku: 'DEMO-001',
                  name: 'Demo SKU',
                  weightG: 100,
                  lengthCm: '10',
                  widthCm: '10',
                  heightCm: '10',
                  declaredValue: '100000',
                  isActive: true,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
              ],
              200,
              { limit: 100, hasNext: false, nextCursor: null },
            );
          if (url.pathname === '/api/v1/orders' && req.method === 'POST') {
            if (!owner) {
              res.writeHead(403);
              return res.end();
            }
            let body = '';
            for await (const part of req) body += part;
            const input = JSON.parse(body);
            const key = req.headers['x-idempotency-key'];
            let id = accepted.get(key);
            if (!id) {
              id = randomUUID();
              accepted.set(key, id);
              orders.unshift({
                id,
                externalOrderCode: input.externalOrderCode,
                sourceChannel: input.sourceChannel,
                status: 'RECEIVED',
                createdAt: timestamp,
                updatedAt: timestamp,
                holdReason: null,
                version: 1,
              });
            }
            return respond({ orderId: id, status: 'RECEIVED' }, 202);
          }
          if (url.pathname === '/api/v1/orders') {
            const selected = orders.filter(
              (order) =>
                (!url.searchParams.get('status') ||
                  order.status === url.searchParams.get('status')) &&
                (!url.searchParams.get('channel') ||
                  order.sourceChannel === url.searchParams.get('channel')),
            );
            return respond(
              selected.map((order) => (owner ? { ...order, ...money } : order)),
              200,
              { limit: 50, hasNext: false, nextCursor: null },
            );
          }
          const cancellationOrder = orders.find(
            (entry) => url.pathname === `/api/v1/orders/${entry.id}/cancellation`,
          );
          if (cancellationOrder)
            return respond({ id: cancellationOrder.id, status: 'NOT_REQUESTED', code: null });
          const order = orders.find((entry) => url.pathname === `/api/v1/orders/${entry.id}`);
          if (order)
            return respond({
              ...order,
              ...(owner
                ? {
                    ...money,
                    recipientName: 'Synthetic receiver',
                    recipientPhone: '0900000000',
                    recipientAddress: 'Demo address',
                    toProvinceCode: '01',
                    toWardCode: '00001',
                    provinceName: 'Hà Nội',
                    wardName: 'Ba Đình',
                  }
                : {}),
              items: [
                {
                  productId,
                  sku: 'DEMO-001',
                  productName: totalCostPreview ? 'Trà mô phỏng' : 'Áo thun mẫu',
                  qty: totalCostPreview ? 2 : 1,
                  ...(owner ? { unitPrice: totalCostPreview ? '50000' : '100000' } : {}),
                },
              ],
              statusHistory: [
                { fromStatus: null, toStatus: 'RECEIVED', reason: null, changedAt: timestamp },
              ],
              fulfillmentOrders: totalCostPreview
                ? [1, 2].map((sequenceNo) => ({
                    id: `00000000-0000-4000-8000-${String(900 + sequenceNo).padStart(12, '0')}`,
                    warehouseId: `00000000-0000-4000-8000-${String(800 + sequenceNo).padStart(12, '0')}`,
                    warehouseName:
                      sequenceNo === 1 ? 'Kho Đà Nẵng mô phỏng' : 'Kho Hà Nội mô phỏng',
                    sequenceNo,
                    status: 'STOCK_RESERVED',
                    items: [{ productId, sku: 'DEMO-001', productName: 'Trà mô phỏng', qty: 1 }],
                    parcels: [],
                    shipments: [],
                    allocation: {
                      reason: 'TOTAL_COST',
                      ruleVersion: 1,
                      lots: [
                        {
                          sku: 'DEMO-001',
                          lotCode: 'LOT-SYNTHETIC',
                          expiresOn: '2027-01-01',
                          binCode: 'A01',
                          qty: 1,
                        },
                      ],
                    },
                    ...(owner
                      ? {
                          codAmount: '50000',
                          allocationCost: {
                            extraShippingFeeVnd: '13000',
                            savedGoodsValueVnd: '90000',
                            globalOptimum: false,
                          },
                        }
                      : {}),
                  }))
                : [],
            });
          res.writeHead(404);
          res.end();
        });
      },
    },
  ],
});
await server.listen();
console.log('Isolated Orders preview: http://127.0.0.1:2326/tests/fixtures/orders-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
