// Isolated real-component browser test. Every /api request stays in this fixture.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const id = '10120001-0000-4000-8000-000000000001';
const statementId = '10120001-0000-4000-8000-000000000002';
const tenantId = '10120001-0000-4000-8000-000000000003';
const now = () => new Date().toISOString();
const pagination = { limit: 20, hasNext: false, nextCursor: null };
const receipts = [];
let complete = false;
let statementStatus = 'AUTO_CONFIRMED';
let version = 1;
const requests = [];
const server = await createServer({
  configFile: false,
  envFile: false,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  cacheDir: 'node_modules/.vite-recon-ui',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      '@messages': fileURLToPath(new URL('../../messages', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 2347, strictPort: true },
  plugins: [
    react(),
    {
      name: 'isolated-recon-test-api',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          const url = new URL(req.url, 'http://127.0.0.1');
          const referer = new URL(req.headers.referer ?? 'http://127.0.0.1');
          const fail = referer.searchParams.get('fail');
          const payoutStatus = referer.searchParams.get('payout') ?? statementStatus;
          const send = (data, status = 200, message = 'Synthetic test failure') => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                success: status < 400,
                ...(status < 400
                  ? { data }
                  : {
                      error: { code: 'TEST.DEPENDENCY_UNAVAILABLE', message, statusCode: status },
                    }),
                meta: {
                  timestamp: now(),
                  path: url.pathname,
                  requestId: 'synthetic-ui',
                  pagination,
                },
              }),
            );
          };
          let body = '';
          for await (const chunk of req) body += chunk;
          requests.push({ method: req.method, path: url.pathname, body });
          if (url.pathname === '/api/test/requests') return send(requests);
          if (url.pathname.endsWith('/cod-aging'))
            return send([
              {
                carrierCode: 'GHN',
                tenantId,
                shipmentCount: 2,
                codVnd: '9007199254740993',
                oldestDeliveredAt: '2026-11-01T01:00:00.000Z',
              },
            ]);
          if (url.pathname === '/api/v1/commercial/sepay/unmatched') {
            if (fail === 'sepay') return send(null, 503, 'SePay test unavailable');
            return send(
              ['PRODUCTION', 'SANDBOX'].map((environment, i) => ({
                id: `10120001-0000-4000-8000-00000000000${i + 4}`,
                environment,
                externalRef: `TEST-${environment}`,
                amountVnd: '200000',
                content: null,
                code: null,
                gateway: null,
                transactionDate: null,
                receivedAt: now(),
              })),
            );
          }
          if (url.pathname.endsWith('/remittances')) {
            if (req.method === 'GET')
              return fail === 'receipts'
                ? send(null, 503, 'Receipts test unavailable')
                : send(receipts);
            const input = JSON.parse(body);
            const receipt = { id: randomUUID(), ...input };
            receipts.push(receipt);
            return send({ id: receipt.id, isReplay: false });
          }
          if (url.pathname.endsWith('/sepay-remittances'))
            return send({ id: randomUUID(), isReplay: false });
          if (url.pathname.endsWith('/complete')) {
            if (!receipts.length) return send(null, 422, 'Bank evidence required (synthetic API)');
            complete = true;
            return send({
              batchId: id,
              postedCount: 1,
              skippedAlreadyCredited: 0,
              creditedVnd: '200000',
            });
          }
          if (url.pathname.endsWith('/records')) return send([]);
          if (url.pathname === '/api/v1/reconciliation/settlement-batches')
            return send([
              {
                id,
                carrierCode: 'GHN',
                fileName: 'synthetic-week.csv',
                status: complete ? 'COMPLETED' : 'PROCESSING',
                totalRows: 1,
                processedRows: 1,
                matchedRows: 1,
                exceptionRows: 0,
                createdAt: now(),
                completedAt: complete ? now() : null,
                dueForWeek: '2026-11-23',
                reconDeadlineAt: '2026-11-22T16:59:59.999Z',
                isLate: true,
              },
            ]);
          if (url.pathname === `/api/v1/billing/statements/${statementId}/lines`)
            return send([
              {
                id,
                ledgerEntryId: id,
                amountVnd: '200000',
                lineStatus: 'CONFIRMED',
                carryForwardFromLineId: null,
                entryType: 'COD_CREDIT',
                sourceType: 'SHIPMENT',
                sourceId: id,
                postedAt: now(),
                disputes: [],
              },
            ]);
          if (url.pathname === `/api/v1/billing/statements/${statementId}/approve`) {
            statementStatus = 'APPROVED';
            version++;
            return send({ statementId, status: statementStatus, version });
          }
          if (url.pathname === `/api/v1/billing/statements/${statementId}`)
            return send({
              id: statementId,
              tenantId,
              status: payoutStatus,
              version,
              periodStart: '2026-11-09',
              periodEnd: '2026-11-15',
              cutoffAt: '2026-11-15T23:00:00.000Z',
              reviewDeadlineAt: '2026-11-17T17:00:00.000Z',
              eligibleAmountVnd: '200000',
              openingBalanceVnd: '0',
              closingBalanceVnd: '200000',
              approvedAmountVnd: ['APPROVED', 'PAID'].includes(payoutStatus) ? '200000' : null,
              sentAt: '2026-11-15T23:00:00.000Z',
              confirmedAt: '2026-11-17T17:00:00.000Z',
              approvedAt: ['APPROVED', 'PAID'].includes(payoutStatus)
                ? '2026-11-18T02:00:00.000Z'
                : null,
              closedAt: null,
              isLegacy: false,
              pendingReconBatchCount: 2,
              review: { openDisputeCount: 0, disputedCreditsVnd: '0', disputedDebitsVnd: '0' },
              transfer:
                payoutStatus === 'PAID'
                  ? {
                      id,
                      bankReference: 'TEST-PAID-001',
                      amountVnd: '200000',
                      confirmedAt: '2026-11-19T02:00:00.000Z',
                      isLate: true,
                    }
                  : null,
            });
          return send(null, 404, 'Unhandled synthetic test request');
        });
      },
    },
  ],
});
await server.listen();
console.log('http://127.0.0.1:2347/tests/fixtures/recon-money-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
