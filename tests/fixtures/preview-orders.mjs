// Isolated visual preview. No connection to a real API, Google Sheet or database.
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';

const productId = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-08T03:00:00.000Z';
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
                  productName: 'Áo thun mẫu',
                  qty: 1,
                  ...(owner ? { unitPrice: '100000' } : {}),
                },
              ],
              statusHistory: [
                { fromStatus: null, toStatus: 'RECEIVED', reason: null, changedAt: timestamp },
              ],
              fulfillmentOrders: [],
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
