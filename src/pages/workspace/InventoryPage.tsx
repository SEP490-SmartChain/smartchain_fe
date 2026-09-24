import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs, type TabItem } from '@/components/Common/Tabs/Tabs';
import { ProductCatalogTable } from '@/features/catalog';
import { StockLevelsPanel } from '@/features/inventory';
import { useAccess } from '@/hooks/useAccess';

type InventoryTabId = 'stock' | 'catalog';

export default function InventoryPage() {
  const t = useTranslations('Inventory');
  const { can } = useAccess();
  const [activeTab, setActiveTab] = useState<InventoryTabId>('stock');

  const tabs: TabItem[] = [
    ...(can('inventory.view') ? [{ id: 'stock', label: t('tabStock') }] : []),
    ...(can('catalog.products.view') ? [{ id: 'catalog', label: t('tabCatalog') }] : []),
  ];
  const visibleTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;

  return (
    <div className="space-y-5">
      <Tabs
        tabs={tabs}
        activeId={visibleTab ?? ''}
        onChange={(id) => setActiveTab(id === 'catalog' ? 'catalog' : 'stock')}
      />
      <div role="tabpanel">
        {visibleTab === 'stock' && <StockLevelsPanel />}
        {visibleTab === 'catalog' && <ProductCatalogTable />}
      </div>
    </div>
  );
}
