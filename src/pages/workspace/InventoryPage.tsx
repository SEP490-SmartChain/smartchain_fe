import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs, type TabItem } from '@/components/Common/Tabs/Tabs';
import { ActiveReservationsPanel, StockLevelsPanel } from '@/features/inventory';
import { useAccess } from '@/hooks/useAccess';

type InventoryTabId = 'stock' | 'reservations';

const TAB_IDS: readonly InventoryTabId[] = ['stock', 'reservations'];

function toTabId(id: string): InventoryTabId {
  return TAB_IDS.find((tabId) => tabId === id) ?? 'stock';
}

export default function InventoryPage() {
  const t = useTranslations('Inventory');
  const { can } = useAccess();
  const [activeTab, setActiveTab] = useState<InventoryTabId>('stock');

  const tabs: TabItem[] = [
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
        {visibleTab === 'stock' && <StockLevelsPanel />}
        {visibleTab === 'reservations' && <ActiveReservationsPanel />}
      </div>
    </div>
  );
}
