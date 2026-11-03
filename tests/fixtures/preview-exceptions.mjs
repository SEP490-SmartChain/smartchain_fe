// Isolated real-component UI preview with synthetic API; no project DB access.
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';
const now = () => new Date().toISOString();
const id = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000010';
let row = {
  id,
  reference: 'QA-PARCEL-LIMIT',
  sellerName: 'Synthetic seller',
  sourceStatus: 'MANUAL_REVIEW',
  warehouseId,
  type: 'ORDER',
  reasonCode: 'PARCEL_LIMIT',
  status: 'OPEN',
  version: 1,
  assignedToPlatformUserId: null,
  createdAt: now(),
  updatedAt: now(),
};
const operations = [],
  replies = new Map();
const server = await createServer({
  server: { host: '127.0.0.1', port: 2327, strictPort: true },
  plugins: [
    {
      name: 'exceptions-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          const url = new URL(req.url, 'http://127.0.0.1');
          const send = (data, status = 200, pagination) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: status < 400,
                data,
                meta: {
                  timestamp: now(),
                  path: url.pathname,
                  requestId: 'preview',
                  ...(pagination ? { pagination } : {}),
                },
              }),
            );
          };
          if (req.method === 'POST') {
            let raw = '';
            for await (const chunk of req) raw += chunk;
            const input = JSON.parse(raw);
            if (req.headers.authorization !== 'Bearer preview-owner') return send(null, 403);
            if (replies.has(input.operationId)) return send(replies.get(input.operationId));
            if (input.expectedVersion !== row.version) return send(null, 409);
            row = {
              ...row,
              version: row.version + 1,
              status: 'ASSIGNED',
              sourceStatus: input.kind === 'RETRY' ? 'VALIDATED' : row.sourceStatus,
              updatedAt: now(),
            };
            operations.unshift({
              id: randomUUID(),
              operationId: input.operationId,
              actorId: id,
              kind: input.kind,
              note: input.note,
              createdAt: now(),
            });
            const result = {
              id,
              operationId: input.operationId,
              status: row.status,
              version: row.version,
              outcome: input.kind === 'RETRY' ? 'QUEUED' : 'RECORDED',
            };
            replies.set(input.operationId, result);
            return send(result);
          }
          if (url.pathname === '/api/v1/sla-exceptions')
            return send([], 200, { limit: 50, hasNext: false, nextCursor: null });
          if (url.pathname === `/api/v1/operations/exceptions/${id}`)
            return send({
              ...row,
              canRetry: row.sourceStatus === 'MANUAL_REVIEW',
              canResolve: false,
              canCorrect: false,
              resolutionRef: null,
              assignees: [],
              operations,
            });
          if (url.pathname === '/api/v1/operations/exceptions')
            return send({
              items:
                !url.searchParams.get('status') || url.searchParams.get('status') === row.status
                  ? [row]
                  : [],
              warehouses: [{ id: warehouseId, name: 'Kho mô phỏng' }],
              nextCursor: null,
              collection: {
                status: 'AVAILABLE',
                queuesScanned: 4,
                checkedAt: now(),
                lastSuccessAt: now(),
              },
            });
          return send(null, 404);
        });
      },
    },
  ],
});
await server.listen();
console.log('http://127.0.0.1:2327/tests/fixtures/exceptions-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
