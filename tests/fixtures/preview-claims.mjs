// Production components, synthetic API and private loopback image storage only.
import { createServer } from 'vite';
const a = '00001314-0000-4000-8000-000000000010',
  b = '00001314-0000-4000-8000-000000000020';
const itemA = '00001314-0000-4000-8000-000000000011',
  itemB = '00001314-0000-4000-8000-000000000021';
const tenant = '00001314-0000-4000-8000-000000000001';
const now = () => new Date().toISOString();
const claims = new Map(),
  commands = new Map(),
  intents = new Map(),
  images = new Map();
let loseCreate = true,
  expireImage = true;
const warehouses = [
  { id: a, name: 'Kho A · Hà Nội' },
  { id: b, name: 'Kho B · Đà Nẵng' },
];
const baseClaim = (input, warehouse) => ({
  id: input.operationId,
  version: 1,
  status: 'OPEN',
  approvedAmountVnd: null,
  creditState: 'NOT_APPROVED',
  tenantId: tenant,
  warehouseId: warehouse,
  warehouseName: warehouses.find((w) => w.id === warehouse).name,
  fulfillmentOrderId: warehouse,
  fulfillmentItemId: input.fulfillmentItemId,
  orderReference: warehouse === a ? 'QA-KHO-A' : 'QA-KHO-B',
  sequenceNo: 1,
  sku: 'QA-TEA',
  productName: 'Trà mô phỏng',
  returnOrderId: null,
  incidentType: input.incidentType,
  description: input.note,
  responsibility: null,
  affectedQty: input.affectedQty,
  declaredCostVnd: '150000',
  declaredCostSource: 'ORDER_SNAPSHOT',
  contractId: tenant,
  contractCapVnd: '200000',
  maximumCreditVnd: String(Math.min(150000 * input.affectedQty, 200000)),
  investigationNote: null,
  investigationCompletedAt: null,
  decisionNote: null,
  carrierDisputeId: null,
  carrierDisputeStatus: null,
  createdAt: now(),
  updatedAt: now(),
  evidence: [],
  history: [],
});
const commandResult = (c) => ({
  id: c.id,
  version: c.version,
  status: c.status,
  approvedAmountVnd: c.approvedAmountVnd,
  creditState: c.creditState,
});
// Opt-in investigation fixture: no writes to the application's database.
let loseInvestigation = process.argv.includes('--investigation-review');
if (loseInvestigation) {
  const c = baseClaim(
    {
      operationId: tenant,
      fulfillmentItemId: itemA,
      affectedQty: 1,
      incidentType: 'DAMAGED',
      note: 'Hồ sơ mô phỏng để kiểm tra lưu điều tra',
    },
    a,
  );
  c.evidence.push({
    id: itemA,
    contentType: 'image/png',
    fileSizeBytes: 100,
    sha256: 'a'.repeat(64),
    verifiedAt: now(),
    createdAt: now(),
    canConfirm: false,
  });
  claims.set(c.id, c);
}
const server = await createServer({
  server: { host: '127.0.0.1', port: 2328, strictPort: true },
  plugins: [
    {
      name: 'claims-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, 'http://127.0.0.1');
          if (url.pathname.startsWith('/synthetic-images/')) {
            if (req.method === 'PUT') {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              images.set(url.pathname, Buffer.concat(chunks));
              res.writeHead(200);
              return res.end();
            }
            res.writeHead(200, { 'Content-Type': 'image/png' });
            return res.end(images.get(url.pathname));
          }
          if (!url.pathname.startsWith('/api/')) return next();
          const role = req.headers.authorization?.replace('Bearer preview-', '');
          const ops = role === 'OPS_DISPATCHER',
            accountant = role === 'ORCA_ACCOUNTANT';
          const send = (data, status = 200) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: status < 400,
                data,
                meta: { timestamp: now(), path: url.pathname, requestId: 'synthetic-preview' },
              }),
            );
          };
          const error = (code, status) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: { code, message: code } }));
          };
          const view = (c) => ({
            ...c,
            canAddEvidence: ops && ['OPEN', 'INVESTIGATING'].includes(c.status),
            canInvestigate: ops && ['OPEN', 'INVESTIGATING'].includes(c.status),
            canDecide: accountant && ['OPEN', 'INVESTIGATING'].includes(c.status),
          });
          const warehouse = url.searchParams.get('warehouseId') || a;
          if (req.method === 'GET') {
            if (url.pathname === '/api/v1/warehouses') return send(warehouses);
            if (url.pathname === '/api/v1/claims/options')
              return send({
                items: [
                  {
                    fulfillmentItemId: warehouse === a ? itemA : itemB,
                    fulfillmentOrderId: warehouse,
                    tenantId: tenant,
                    warehouseId: warehouse,
                    orderReference: warehouse === a ? 'QA-KHO-A' : 'QA-KHO-B',
                    sequenceNo: 1,
                    sku: 'QA-TEA',
                    productName: 'Trà mô phỏng',
                    parcelQty: 4,
                    remainingQty: 4,
                    declaredCostVnd: '150000',
                  },
                ],
                nextCursor: null,
              });
            if (url.pathname === '/api/v1/claims')
              return send({
                items: [...claims.values()]
                  .filter(
                    (c) =>
                      (accountant || c.warehouseId === warehouse) &&
                      (!url.searchParams.get('status') ||
                        url.searchParams.get('status') === c.status),
                  )
                  .map(view),
                nextCursor: null,
              });
            const c = claims.get(url.pathname.split('/')[4]);
            if (c)
              return ops && c.warehouseId !== warehouse
                ? error('CLAIM.NOT_FOUND', 404)
                : send(view(c));
            return error('CLAIM.NOT_FOUND', 404);
          }
          let raw = '';
          for await (const c of req) raw += c;
          const input = JSON.parse(raw || '{}');
          if (url.pathname === '/api/v1/claims') {
            if (!ops) return error('CLAIM.FORBIDDEN', 403);
            if (commands.has(input.operationId)) return send(commands.get(input.operationId));
            const c = baseClaim(input, warehouse);
            claims.set(c.id, c);
            const result = commandResult(c);
            commands.set(input.operationId, result);
            if (warehouse === a && loseCreate) {
              loseCreate = false;
              return error('SYNTHETIC.RESPONSE_UNAVAILABLE', 503);
            }
            return send(result);
          }
          const parts = url.pathname.split('/'),
            c = claims.get(parts[4]);
          if (!c) return error('CLAIM.NOT_FOUND', 404);
          if (parts[5] === 'evidence' && parts[6] === 'presign') {
            if (expireImage) {
              expireImage = false;
              return error('CLAIM.EVIDENCE_EXPIRED', 409);
            }
            intents.set(input.evidenceId, { ...input, claimId: c.id });
            return send({
              id: input.evidenceId,
              method: 'PUT',
              uploadUrl: `http://127.0.0.1:2328/synthetic-images/${input.evidenceId}`,
              expiresInSeconds: 300,
              headers: {
                'Content-Type': input.contentType,
                'x-amz-checksum-sha256': Buffer.from(input.sha256, 'hex').toString('base64'),
              },
            });
          }
          if (parts[5] === 'evidence' && parts[7] === 'confirm') {
            const intent = intents.get(parts[6]);
            if (!intent || !images.has(`/synthetic-images/${parts[6]}`))
              return error('CLAIM.EVIDENCE_REQUIRED', 409);
            const verifiedAt = now();
            c.evidence.push({
              id: parts[6],
              contentType: intent.contentType,
              fileSizeBytes: intent.fileSizeBytes,
              sha256: intent.sha256,
              verifiedAt,
              createdAt: verifiedAt,
              canConfirm: false,
            });
            c.version++;
            c.investigationCompletedAt = null;
            return send({ id: parts[6], verifiedAt });
          }
          if (commands.has(input.operationId)) return send(commands.get(input.operationId));
          if (input.expectedVersion !== c.version) return error('CLAIM.STALE_VERSION', 409);
          if (parts[5] === 'investigation' && ops) {
            c.responsibility = input.responsibility;
            c.investigationNote = input.note;
            c.investigationCompletedAt = input.complete ? now() : null;
            c.status = 'INVESTIGATING';
          } else if (parts[5] === 'decision' && accountant && c.investigationCompletedAt) {
            c.decisionNote = input.note;
            c.status = input.decision === 'APPROVE' ? 'CREDITED' : 'REJECTED';
            c.approvedAmountVnd = input.decision === 'APPROVE' ? c.maximumCreditVnd : null;
            c.creditState = input.decision === 'APPROVE' ? 'POSTED' : 'NOT_APPROVED';
          } else return error('CLAIM.FORBIDDEN', 403);
          c.version++;
          c.updatedAt = now();
          const result = commandResult(c);
          commands.set(input.operationId, result);
          if (parts[5] === 'investigation' && loseInvestigation) {
            loseInvestigation = false;
            return error('SYNTHETIC.RESPONSE_UNAVAILABLE', 503);
          }
          return send(result);
        });
      },
    },
  ],
});
await server.listen();
console.log('http://127.0.0.1:2328/tests/fixtures/claims-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
