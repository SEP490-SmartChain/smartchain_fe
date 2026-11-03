import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common/Tabs/Tabs';
import { FreightTariffManager, RateIntelligenceManager } from '@/features/catalog';
import { ServiceTariffManager } from '@/features/tenants';

export default function FreightTariffsPage() {
  const t = useTranslations('ServiceTariffs');
  const [tab, setTab] = useState('freight');
  const intelligence = useTranslations('RateIntelligence');
  return (
    <div className="space-y-5">
      <Tabs
        label={t('tariffGroups')}
        tabs={[
          { id: 'freight', label: t('freightTab') },
          { id: 'service', label: t('serviceTab') },
          { id: 'intelligence', label: intelligence('tab') },
        ]}
        activeId={tab}
        onChange={setTab}
      />
      {tab === 'service' ? (
        <ServiceTariffManager />
      ) : tab === 'intelligence' ? (
        <RateIntelligenceManager />
      ) : (
        <FreightTariffManager />
      )}
    </div>
  );
}
