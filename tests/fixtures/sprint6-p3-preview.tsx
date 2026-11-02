// Isolated browser fixture; all recipients, identities and business records are synthetic.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import '../../src/styles/globals.css';
import { ReturnsWorkspace } from '../../src/features/inventory';
import { LotTracePanel } from '../../src/features/inventory/components/LotTracePanel';
import { useAuthStore } from '../../src/stores/authStore';
import type { ReturnLine, ReturnRecord } from '../../src/features/inventory/api/returnWorkflowApi';
const params = new URLSearchParams(location.search),
  role = params.get('role') ?? 'WAREHOUSE_MANAGER',
  locale = params.get('locale') === 'en' ? 'en' : 'vi';
const id = (n: number) => `10280000-0000-4000-8000-${String(n).padStart(12, '0')}`;
useAuthStore.getState().setSession({
  accessToken: 'synthetic-p3-visual',
  expiresIn: 3600,
  user: {
    userId: id(99),
    tenantId: role.startsWith('SELLER') ? id(90) : null,
    actorScope: role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
    roles: [role],
    permissions: [],
    warehouseIds: [id(1)],
    email: 'synthetic@example.test',
    fullName: 'Synthetic P3',
  },
});
const line = (n: number): ReturnLine => ({
  id: id(n),
  sourceId: id(n + 100),
  lotId: id(50),
  sku: 'CA-PHE-250',
  lotCode: 'LOT-2026-10-A',
  requestedQty: 2,
  receivedQty: 2,
  restockedQty: 0,
  quarantinedQty: 0,
  classification: 'ACCEPTED',
  reviewed: false,
  hasEvidence: true,
  targetStockId: null as string | null,
  reviewReason: null as string | null,
});
const record = (n: number): ReturnRecord => ({
  id: id(n),
  version: 4,
  fulfillmentOrderId: id(n + 1000),
  kind: 'POST_DELIVERY',
  status: 'REVIEW_PENDING',
  reason: 'Khách đổi hàng, bao bì nguyên vẹn — dữ liệu tổng hợp',
  requestedAt: '2026-10-28T03:00:00.000Z',
  arrivedAt: '2026-10-28T07:30:00.000Z',
  inspectionDueAt: '2026-10-30T07:30:00.000Z',
  inspectionOverdue: false,
  reverseBookingState: 'CONFIRMED',
  reverseTrackingNumber: 'GHN-synthetic-reverse',
  reverseShipmentStatus: 'DELIVERED',
  warehouseNoticeStatus: 'DELIVERED',
  lines: [line(n + 1)],
});
let records = [
  record(10),
  {
    ...record(20),
    version: 6,
    status: 'COMPLETED',
    lines: [
      {
        ...line(21),
        classification: 'DAMAGED',
        reviewed: true,
        quarantinedQty: 2,
        targetStockId: id(200),
        reviewReason: 'Vỏ hộp bị móp, giữ cách ly chờ quyết định seller.',
      },
    ],
  },
];
if (role === 'OPS_DISPATCHER')
  records = [
    {
      ...record(10),
      version: 1,
      status: 'REQUESTED',
      arrivedAt: null,
      inspectionDueAt: null,
      reverseBookingState: null,
      reverseTrackingNumber: null,
      reverseShipmentStatus: null,
      warehouseNoticeStatus: null,
      lines: [{ ...line(11), receivedQty: 0, classification: 'PENDING', hasEvidence: false }],
    },
    records[1] ?? record(20),
  ];
if (role === 'WAREHOUSE_STAFF')
  records = [
    {
      ...record(10),
      version: 2,
      status: 'AUTHORIZED',
      arrivedAt: null,
      inspectionDueAt: null,
      reverseBookingState: null,
      reverseTrackingNumber: null,
      reverseShipmentStatus: null,
      warehouseNoticeStatus: null,
      lines: [{ ...line(11), receivedQty: 0, classification: 'PENDING', hasEvidence: false }],
    },
    { ...record(30), version: 5, lines: [{ ...line(31), reviewed: true }] },
  ];
const ok = (data: unknown, pagination?: unknown) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-28T08:00:00Z',
      requestId: 'synthetic-p3-preview',
      path: '',
      ...(pagination ? { pagination } : {}),
    },
  });
window.fetch = async (input, init = {}) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.origin,
  );
  if (url.hostname === 'private.example.test') return new Response('', { status: 200 });
  if (url.pathname.endsWith('/warehouses'))
    return ok([{ id: id(1), code: 'HN-01', name: 'Kho Hà Nội' }], {
      limit: 50,
      hasNext: false,
      nextCursor: null,
    });
  if (url.pathname.endsWith('/returns') && (!init.method || init.method === 'GET')) {
    if (params.has('error'))
      return Response.json(
        {
          success: false,
          error: { code: 'SYNTHETIC.UNAVAILABLE', message: 'Synthetic error', statusCode: 503 },
          meta: {},
        },
        { status: 503 },
      );
    return ok({ items: params.has('empty') ? [] : records, nextCursor: null });
  }
  if (url.pathname.endsWith('/eligible'))
    return ok({
      items: [
        {
          id: id(111),
          fulfillmentOrderId: id(1010),
          sku: 'CA-PHE-250',
          lotCode: 'LOT-2026-10-A',
          remainingQty: 2,
        },
      ],
      nextCursor: null,
    });
  if (url.pathname.endsWith('/bins'))
    return ok({
      items: [
        { id: id(70), code: 'HN-A01', zoneType: 'STORAGE' },
        { id: id(71), code: 'HN-Q01', zoneType: 'QUARANTINE' },
      ],
      truncated: false,
    });
  if (url.pathname.includes('/trace/')) {
    if (url.pathname.endsWith('/notifications'))
      return ok({ queued: 1, examined: 1, nextCursor: null });
    if (url.pathname.endsWith('/recall'))
      return ok({
        id: id(50),
        version: 2,
        status: 'RECALLED',
        releasedQty: 6,
        reallocatedQty: 4,
        recoveryCount: 1,
      });
    if (url.pathname.endsWith('/affected'))
      return ok({
        items: [
          {
            id: id(40),
            orderId: id(1040),
            parcelId: id(1010),
            name: 'N***',
            phone: '*******123',
            qty: 2,
          },
        ],
        nextCursor: null,
      });
    return ok({
      items: [
        {
          id: id(111),
          lotId: id(50),
          lotCode: 'LOT-2026-10-A',
          lotStatus: params.has('recalled') ? 'RECALLED' : 'SELLABLE',
          lotVersion: params.has('recalled') ? 2 : 1,
          sku: 'CA-PHE-250',
          binCode: 'HN-A01',
          allocatedQty: 4,
          pickedQty: 4,
          returnedQty: 0,
          fulfillmentOrderId: id(1010),
          orderId: id(1040),
          status: 'PACKED',
          picks: [{ id: id(80), qty: 4, pickedAt: '2026-10-25T04:15:00Z', pickerId: id(99) }],
          shipments: [
            {
              id: id(60),
              trackingNumber: 'SYNTHETIC-001',
              deliveredAt: '2026-10-26T05:00:00Z',
              status: 'DELIVERED',
            },
          ],
        },
      ],
      nextCursor: null,
    });
  }
  if (url.pathname.endsWith('/evidence'))
    return init.method === 'POST'
      ? ok({
          method: 'PUT',
          uploadUrl: 'https://private.example.test/proof',
          headers: { 'content-type': 'image/png' },
          expiresInSeconds: 60,
        })
      : ok({ downloadUrl: 'https://private.example.test/proof', expiresInSeconds: 60 });
  if (init.method === 'POST' && url.pathname.includes('/returns/')) {
    const body = JSON.parse(String(init.body)),
      recordId = url.pathname.split('/returns/')[1]?.split('/')[0],
      r = records.find((r) => r.id === recordId);
    if (!r || body.expectedVersion !== r.version)
      return Response.json(
        {
          success: false,
          error: {
            code: 'INVENTORY.STALE_VERSION',
            message: 'Synthetic stale version',
            statusCode: 409,
          },
          meta: {},
        },
        { status: 409 },
      );
    r.version++;
    if (url.pathname.endsWith('/authorize')) r.status = 'AUTHORIZED';
    if (url.pathname.endsWith('/arrival')) {
      r.status = 'ARRIVED';
      r.arrivedAt = '2026-10-28T08:00:00Z';
      r.inspectionDueAt = '2026-10-30T08:00:00Z';
    }
    if (url.pathname.endsWith('/review')) {
      r.lines[0].reviewed = body.decision === 'APPROVE';
      r.lines[0].reviewReason = body.reason;
    }
    return ok({ id: r.id, version: r.version, status: r.status });
  }
  return Response.json(
    {
      success: false,
      error: {
        code: 'SYNTHETIC.NOT_IMPLEMENTED',
        message: 'Synthetic visual fixture only',
        statusCode: 404,
      },
      meta: {},
    },
    { status: 404 },
  );
};
const root = document.getElementById('root');
if (!root) throw new Error('Preview root required');
createRoot(root).render(
  <NextIntlClientProvider
    locale={locale}
    messages={locale === 'en' ? en : vi}
    timeZone="Asia/Ho_Chi_Minh"
  >
    <BrowserRouter>
      <main style={{ maxWidth: 1100, margin: 'auto', padding: 24 }}>
        <p style={{ fontSize: 12 }}>
          SYNTHETIC PREVIEW · {role} · {params.get('view') === 'trace' ? id(50) : 'No live backend'}
        </p>
        {params.get('view') === 'trace' ? (
          <LotTracePanel warehouseId={id(1)} />
        ) : (
          <ReturnsWorkspace />
        )}
      </main>
    </BrowserRouter>
  </NextIntlClientProvider>,
);
