import { Suspense, useEffect, useId, useState } from 'react';

import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Archive, ArrowDownToLine, PackageCheck, Warehouse } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button, Card, PageHeader, Select, Tabs } from '@/components/Common';
import { WAREHOUSE_INBOUND_TABS } from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

import { receivingApi, type ReceivingWarehouse } from '../api/receivingApi';

import type { InboundWarehouseScope } from '../types/inboundWarehouse.types';

type Principal = ReturnType<typeof useAuthStore.getState>['user'];

const TAB_DETAILS = {
  warehouse_inbound: { icon: ArrowDownToLine, label: 'waiting' },
  warehouse_receiving: { icon: PackageCheck, label: 'receiving' },
  warehouse_putaway: { icon: Archive, label: 'putaway' },
};

export function InboundWorkspace() {
  const t = useTranslations('Receiving');
  const flow = useTranslations('WarehouseInbound');
  const sidebar = useTranslations('Sidebar');
  const user = useAuthStore((state) => state.user);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const tabId = useId();
  const [directory, setDirectory] = useState<{
    owner: Principal;
    items: ReceivingWarehouse[];
  } | null>(null);
  const [error, setError] = useState<{ owner: Principal } | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [isLocked, setLocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const warehouses = directory?.owner === user ? directory.items : [];
  const warehouse = warehouses.find((item) => item.id === warehouseId);
  const hasError = error?.owner === user;
  const isLoading = directory?.owner !== user && !hasError;
  const activeTab =
    WAREHOUSE_INBOUND_TABS.find((tab) => tab.href === pathname.replace(/\/+$/, '')) ??
    WAREHOUSE_INBOUND_TABS[0];

  useEffect(() => {
    const controller = new AbortController();
    setDirectory(null);
    setError(null);
    setWarehouseId('');
    setLocked(false);
    void receivingApi
      .warehouses(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted && user === useAuthStore.getState().user) {
          setDirectory({ owner: user, items });
          if (items.length === 1 && items[0]) setWarehouseId(items[0].id);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && user === useAuthStore.getState().user) {
          setError({ owner: user });
        }
      });
    return () => controller.abort();
  }, [user, refresh]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={sidebar('warehouse_intake')}
        actionsClassName="w-full sm:w-72 lg:w-80"
        actions={
          <Select
            label={flow('warehouseLabel')}
            placeholder={t('selectWarehouse')}
            value={warehouse?.id ?? ''}
            disabled={isLocked || isLoading || !warehouses.length}
            options={warehouses.map((item) => ({
              value: item.id,
              label: `${item.code} — ${item.name}`,
            }))}
            onChange={(event) => setWarehouseId(event.target.value)}
          />
        }
      />
      <Card padding="none" className="min-w-0 overflow-hidden">
        <div className="px-4 pt-4 sm:px-6">
          <Tabs
            id={tabId}
            label={sidebar('warehouse_intake')}
            className="flex-nowrap gap-5 overflow-x-auto overflow-y-hidden [&>button]:shrink-0 [&>button]:whitespace-nowrap sm:gap-6"
            tabs={WAREHOUSE_INBOUND_TABS.map((tab) => {
              const { icon: Icon, label } = TAB_DETAILS[tab.key];
              return {
                id: tab.key,
                label: flow(`tabs.${label}`),
                icon: <Icon size={18} aria-hidden="true" className="hidden sm:block" />,
              };
            })}
            activeId={activeTab.key}
            disabled={isLocked}
            onChange={(key) => {
              const tab = WAREHOUSE_INBOUND_TABS.find((item) => item.key === key);
              if (tab && !isLocked) void navigate({ pathname: tab.href, search });
            }}
          />
        </div>
        <section
          role="tabpanel"
          id={`${tabId}-panel-${activeTab.key}`}
          aria-labelledby={`${tabId}-${activeTab.key}`}
          className="min-w-0 p-4 sm:p-6"
        >
          {hasError && (
            <Alert variant="error" title={t('loadError')}>
              <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
                {t('reload')}
              </Button>
            </Alert>
          )}
          {isLoading && (
            <div className="flex min-h-60 items-center justify-center">
              <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
                {t('loading')}
              </p>
            </div>
          )}
          {!isLoading && !hasError && !warehouse && (
            <div className="flex min-h-60 flex-col items-center justify-center py-6 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                <Warehouse size={24} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold">
                {flow(warehouses.length ? 'selectTitle' : 'noWarehouseTitle')}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--sc-text-secondary)]">
                {warehouses.length ? flow('selectDescription') : t('noWarehouses')}
              </p>
            </div>
          )}
          {warehouse && (
            <Suspense fallback={<p role="status">{t('loading')}</p>}>
              <Outlet
                key={warehouse.id}
                context={
                  { warehouse, onNavigationLockChange: setLocked } satisfies InboundWarehouseScope
                }
              />
            </Suspense>
          )}
        </section>
      </Card>
    </div>
  );
}
