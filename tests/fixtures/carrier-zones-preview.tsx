// Synthetic browser fixture. All API responses stay in memory; no database or carrier calls.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../messages/vi.json';
import { CarrierZonePanel } from '../../src/features/catalog/components/CarrierZonePanel';
import { FreightTariffEditor } from '../../src/features/catalog/components/FreightTariffEditor';
import { useAuthStore } from '../../src/stores/authStore';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';

const id = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-19T00:00:00.000Z';
const routes: Record<string, unknown>[] = [];
let tariffSaved = false;
window.fetch = async (input, init) => {
  const path = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  let data: unknown = [];
  if (path.includes('admin-divisions'))
    data = [{ code: '79', name: 'Thành phố Hồ Chí Minh', type: 'PROVINCE', parentCode: null }];
  else if (path.endsWith('/zone-codes')) data = [...new Set(routes.map((r) => r.zone))];
  else if (path.includes('/zones')) {
    if (init?.method === 'POST') {
      const route = { ...body, id, carrierId: id, createdAt: stamp, updatedAt: stamp };
      routes.push(route);
      data = route;
    } else if (init?.method === 'PATCH') {
      Object.assign(routes[0], body);
      data = routes[0];
    } else data = routes;
  } else if (path.endsWith('/purchase')) {
    if (body?.zone !== 'INTRA_PROVINCE')
      return Response.json(
        {
          success: false,
          error: { code: 'RATING.INVALID_ZONE', message: 'Invalid zone', statusCode: 400 },
          meta: { timestamp: stamp, path, requestId: 'fixture' },
        },
        { status: 400 },
      );
    tariffSaved = true;
    data = { ...body, id, version: 1, status: 'DRAFT' };
  }
  return Response.json({
    success: true,
    data,
    meta: {
      timestamp: stamp,
      path,
      requestId: 'fixture',
      pagination: { limit: 50, hasNext: false, nextCursor: null },
    },
  });
};
useAuthStore.getState().setSession({
  accessToken: 'fixture',
  expiresIn: 3600,
  user: {
    userId: id,
    tenantId: null,
    actorScope: 'PLATFORM',
    email: 'fixture@local.test',
    fullName: 'Fixture Admin',
    roles: ['ORCA_ADMIN'],
    permissions: [],
  },
});
function Fixture() {
  const [editor, setEditor] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-xl font-semibold">Kiểm tra tuyến và bảng cước — dữ liệu giả</h1>
        <CarrierZonePanel carrierId={id} />
        <button onClick={() => setEditor(true)}>Mở bảng cước</button>
        {saved && tariffSaved && <p role="status">Đã lưu bản nháp trong fixture</p>}
        {editor && (
          <FreightTariffEditor
            kind="purchase"
            row={null}
            services={[
              {
                id,
                carrierId: id,
                code: 'road',
                name: 'Express đường bộ',
                volumetricDivisor: 6000,
                carrier: { code: 'GHTK', name: 'GHTK' },
              },
            ]}
            onClose={() => setEditor(false)}
            onSaved={() => {
              setSaved(true);
              setEditor(false);
            }}
          />
        )}
      </main>
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
