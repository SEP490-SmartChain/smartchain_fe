import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs, type TabItem } from '@/components/Common/Tabs/Tabs';
import {
  ActiveReservationsPanel,
  InventoryDetailPanel,
  NearExpiryPanel,
  StockLevelsPanel,
} from '@/features/inventory';
import { useAccess } from '@/hooks/useAccess';

type InventoryTabId = 'stock' | 'reservations' | 'positions' | 'ledger' | 'expiry';

const TAB_IDS: readonly InventoryTabId[] = [
  'stock',
  'reservations',
  'positions',
  'ledger',
  'expiry',
];

function toTabId(id: string): InventoryTabId {
  return TAB_IDS.find((tabId) => tabId === id) ?? 'stock';
}

export default function InventoryPage() {
  const t = useTranslations('Inventory');
  const detail = useTranslations('InventoryDetail');
  const { can } = useAccess();
  const [activeTab, setActiveTab] = useState<InventoryTabId>('positions');

  const tabs: TabItem[] = [
    ...(can('inventory.expiry.view') ? [{ id: 'expiry', label: detail('expiry') }] : []),
    ...(can('inventory.positions.view') ? [{ id: 'positions', label: detail('positions') }] : []),
    ...(can('inventory.ledger.view') ? [{ id: 'ledger', label: detail('ledger') }] : []),
    ...(can('inventory.view') ? [{ id: 'stock', label: t('tabStock') }] : []),
    ...(can('inventory.reservations.view')
      ? [{ id: 'reservations', label: t('tabReservations') }]
      : []),
  ];
  const visibleTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;

  return (
    <div className="space-y-5">
      <Tabs tabs={tabs} activeId={visibleTab ?? ''} onChange={(id) => setActiveTab(toTabId(id))} />
      <div role="tabpanel">
        {visibleTab === 'expiry' && <NearExpiryPanel />}
        {visibleTab === 'stock' && <StockLevelsPanel />}
        {visibleTab === 'positions' && <InventoryDetailPanel kind="positions" />}
        {visibleTab === 'ledger' && <InventoryDetailPanel kind="ledger" />}
        {visibleTab === 'reservations' && <ActiveReservationsPanel />}
      </div>
    </div>
  );
}
