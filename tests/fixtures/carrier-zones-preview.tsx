// Synthetic browser fixture. All API responses stay in memory; no database or carrier calls.
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../messages/vi.json';
import { CarrierZonePanel } from '../../src/features/catalog/components/CarrierZonePanel';
import { useAuthStore } from '../../src/stores/authStore';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';

const id = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-19T00:00:00.000Z';
const routes: Record<string, unknown>[] = [];
window.fetch = async (input, init) => {
  const path = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  let data: unknown = [];
  if (path.includes('admin-divisions'))
    data = [{ code: '79', name: 'Thành phố Hồ Chí Minh', type: 'PROVINCE', parentCode: null }];
  else if (path.includes('/zones')) {
    if (init?.method === 'POST') {
      const route = { ...body, id, carrierId: id, createdAt: stamp, updatedAt: stamp };
      routes.push(route);
      data = route;
    } else if (init?.method === 'PATCH') {
      Object.assign(routes[0], body);
      data = routes[0];
    } else data = routes;
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
  return (
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-xl font-semibold">Kiểm tra tuyến của hãng — dữ liệu giả</h1>
        <CarrierZonePanel carrierId={id} />
      </main>
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
