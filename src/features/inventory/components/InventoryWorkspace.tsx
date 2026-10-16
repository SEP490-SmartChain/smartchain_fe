import { useRef, useState } from 'react';

import {
  Boxes,
  CalendarClock,
  History,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button, PageHeader, Select, Tabs, type TabItem } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { ActiveReservationsPanel } from './ActiveReservationsPanel';
import { InventoryDetailPanel } from './InventoryDetailPanel';
import { InventoryState } from './InventoryState';
import { NearExpiryPanel } from './NearExpiryPanel';
import { StockLevelsPanel } from './StockLevelsPanel';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

type InventoryTab = 'stock' | 'positions' | 'expiry' | 'ledger' | 'reservations';

// Scope changes remount every reader, including legacy aggregate/reservation hooks.
export function InventoryWorkspace() {
  const revision = useAuthStore((state) => state.revision);
  return <InventoryWorkspaceContent key={revision} />;
}

function InventoryWorkspaceContent() {
  const t = useTranslations('Inventory');
  const detail = useTranslations('InventoryDetail');
  const { can, actorScope } = useAccess();
  const { warehouses, error, isLoading, refetch } = useWarehouseOptions(
    [
      'inventory.stocks.view',
      'inventory.positions.view',
      'inventory.expiry.view',
      'inventory.ledger.view',
    ].some(can),
  );
  const [activeTab, setActiveTab] = useState('stock');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);
  const definitions: (TabItem & { id: InventoryTab; capability: string })[] = [
    {
      id: 'stock',
      label: t('tabStock'),
      icon: <Boxes size={16} aria-hidden="true" />,
      capability: 'inventory.stocks.view',
    },
    {
      id: 'positions',
      label: detail('positions'),
      icon: <Layers size={16} aria-hidden="true" />,
      capability: 'inventory.positions.view',
    },
    {
      id: 'expiry',
      label: detail('expiry'),
      icon: <CalendarClock size={16} aria-hidden="true" />,
      capability: 'inventory.expiry.view',
    },
    {
      id: 'ledger',
      label: detail('ledger'),
      icon: <History size={16} aria-hidden="true" />,
      capability: 'inventory.ledger.view',
    },
    {
      id: 'reservations',
      label: t('tabReservations'),
      icon: <LockKeyhole size={16} aria-hidden="true" />,
      capability: 'inventory.reservations.view',
    },
  ];
  const tabs = definitions.filter((tab) => can(tab.capability));
  const visibleTab = tabs.find((tab) => tab.id === activeTab)?.id ?? tabs[0]?.id;
  const requiresWarehouse =
    actorScope === 'PLATFORM' && visibleTab !== 'stock' && visibleTab !== 'reservations';
  const warehouseId = warehouses.some((warehouse) => warehouse.id === selectedWarehouse)
    ? selectedWarehouse
    : requiresWarehouse && warehouses.length === 1
      ? warehouses[0].id
      : '';
  const ready =
    visibleTab === 'reservations' ||
    (!isLoading &&
      !error &&
      (!requiresWarehouse || Boolean(warehouseId)) &&
      (actorScope !== 'PLATFORM' || warehouses.length > 0));

  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs
        id="inventory"
        label={t('navigationLabel')}
        tabs={tabs}
        activeId={visibleTab ?? ''}
        onChange={setActiveTab}
      />
      {visibleTab && visibleTab !== 'reservations' && (
        <section
          className="sc-surface grid items-center gap-4 p-4 sm:grid-cols-[1fr_minmax(240px,360px)]"
          aria-label={t('scopeTitle')}
        >
          <div className="flex items-start gap-3">
            <Warehouse
              size={20}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--sc-primary)]"
            />
            <div>
              <h2 className="m-0 text-sm font-semibold">{t('scopeTitle')}</h2>
              <p className="mb-0 mt-1 text-xs leading-5 text-[var(--sc-text-secondary)]">
                {t(actorScope === 'PLATFORM' ? 'scopePlatform' : 'scopeSeller')}
              </p>
            </div>
          </div>
          <Select
            ref={selectRef}
            aria-label={detail('warehouse')}
            value={warehouseId}
            disabled={isLoading || Boolean(error) || warehouses.length === 0}
            placeholder={t(
              isLoading
                ? 'warehousesLoading'
                : error
                  ? 'warehouseLoadError'
                  : requiresWarehouse
                    ? 'selectWarehouse'
                    : 'allWarehouses',
            )}
            isPlaceholderDisabled={requiresWarehouse}
            options={warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: `${warehouse.code} — ${warehouse.name}`,
            }))}
            onChange={(event) => setSelectedWarehouse(event.target.value)}
          />
        </section>
      )}
      <div
        role="tabpanel"
        id={`inventory-panel-${visibleTab}`}
        aria-labelledby={`inventory-${visibleTab}`}
        tabIndex={0}
      >
        {!visibleTab ? (
          <InventoryState title={t('accessDenied')} />
        ) : ready ? (
          <div key={`${visibleTab}:${warehouseId}`}>
            {visibleTab === 'stock' && <StockLevelsPanel warehouseId={warehouseId} />}
            {visibleTab === 'positions' && (
              <InventoryDetailPanel kind="positions" warehouseId={warehouseId} />
            )}
            {visibleTab === 'ledger' && (
              <InventoryDetailPanel kind="ledger" warehouseId={warehouseId} />
            )}
            {visibleTab === 'expiry' && <NearExpiryPanel warehouseId={warehouseId} />}
            {visibleTab === 'reservations' && <ActiveReservationsPanel />}
          </div>
        ) : (
          <section className="sc-surface">
            {isLoading ? (
              <InventoryState
                title={t('warehousesLoading')}
                icon={<LoaderCircle size={23} aria-hidden="true" className="animate-spin" />}
              />
            ) : error ? (
              <div className="p-4">
                <Alert variant="error" title={t('warehouseLoadError')}>
                  <p className="mb-3 mt-0">{t('warehouseErrorHint')}</p>
                  <Button size="sm" variant="outline" onClick={refetch}>
                    {t('retry')}
                  </Button>
                </Alert>
              </div>
            ) : (
              <InventoryState
                title={t(warehouses.length ? 'chooseWarehouseTitle' : 'noWarehousesTitle')}
                description={t(warehouses.length ? 'chooseWarehouseHint' : 'noWarehousesHint')}
                icon={<Warehouse size={23} aria-hidden="true" />}
                action={
                  warehouses.length > 0 ? (
                    <Button variant="outline" onClick={() => selectRef.current?.focus()}>
                      {t('selectWarehouse')}
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={refetch}>
                      {t('refresh')}
                    </Button>
                  )
                }
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
