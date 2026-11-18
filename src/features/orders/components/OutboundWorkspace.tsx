import { Suspense, useId } from 'react';

import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { PackageCheck, PackageSearch, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, PageHeader, Tabs } from '@/components/Common';
import { WAREHOUSE_OUTBOUND_TABS } from '@/lib/accessPolicy';

const TAB_ICONS = {
  warehouse_picking: PackageSearch,
  warehouse_packing: PackageCheck,
  warehouse_handover: Truck,
};

/**
 * Pick, pack and carrier handover as one workspace. Each tab keeps its own screen and API
 * contract; the tabs only remove page switching for an operator who runs the whole flow.
 */
export function OutboundWorkspace() {
  const t = useTranslations('WarehouseOutbound');
  const sidebar = useTranslations('Sidebar');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabId = useId();
  const activeTab =
    WAREHOUSE_OUTBOUND_TABS.find((tab) => tab.href === pathname.replace(/\/+$/, '')) ??
    WAREHOUSE_OUTBOUND_TABS[0];

  return (
    <div className="space-y-5">
      <PageHeader title={sidebar('warehouse_outbound')} description={t('description')} />
      <Card padding="none" className="min-w-0 overflow-hidden">
        <div className="px-4 pt-4 sm:px-6">
          <Tabs
            id={tabId}
            label={sidebar('warehouse_outbound')}
            className="flex-nowrap gap-5 overflow-x-auto overflow-y-hidden [&>button]:shrink-0 [&>button]:whitespace-nowrap sm:gap-6"
            tabs={WAREHOUSE_OUTBOUND_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.key];
              return {
                id: tab.key,
                label: sidebar(tab.key),
                icon: <Icon size={18} aria-hidden="true" className="hidden sm:block" />,
              };
            })}
            activeId={activeTab.key}
            onChange={(key) => {
              const tab = WAREHOUSE_OUTBOUND_TABS.find((item) => item.key === key);
              if (tab) void navigate(tab.href);
            }}
          />
        </div>
        <section
          role="tabpanel"
          id={`${tabId}-panel-${activeTab.key}`}
          aria-labelledby={`${tabId}-${activeTab.key}`}
          className="min-w-0 p-4 sm:p-6"
        >
          <Suspense fallback={<p role="status">{t('loading')}</p>}>
            <Outlet />
          </Suspense>
        </section>
      </Card>
    </div>
  );
}
