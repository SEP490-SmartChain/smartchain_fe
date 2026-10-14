import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common/Tabs/Tabs';
import {
  CarrierAccountManager,
  GlobalCarrierCatalog,
  FreightTariffManager,
} from '@/features/catalog';

export default function CarrierCatalogPage() {
  const t = useTranslations('FreightTariffs');
  const [tab, setTab] = useState('catalogue');
  return (
    <>
      <Tabs
        tabs={[
          { id: 'catalogue', label: t('catalogue') },
          { id: 'accounts', label: t('accounts') },
          { id: 'rates', label: t('title') },
        ]}
        activeId={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === 'catalogue' ? (
          <GlobalCarrierCatalog />
        ) : tab === 'accounts' ? (
          <CarrierAccountManager />
        ) : (
          <FreightTariffManager />
        )}
      </div>
    </>
  );
}
