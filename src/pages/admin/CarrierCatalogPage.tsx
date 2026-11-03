import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common/Tabs/Tabs';
import { CarrierAccountManager, GlobalCarrierCatalog } from '@/features/catalog';

// Tariffs have their own route (/admin/tariffs) in the sidebar; this page keeps carriers and accounts.
export default function CarrierCatalogPage() {
  const t = useTranslations('FreightTariffs');
  const [tab, setTab] = useState('catalogue');
  return (
    <>
      <Tabs
        tabs={[
          { id: 'catalogue', label: t('catalogue') },
          { id: 'accounts', label: t('accounts') },
        ]}
        activeId={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === 'catalogue' ? <GlobalCarrierCatalog /> : <CarrierAccountManager />}
      </div>
    </>
  );
}
