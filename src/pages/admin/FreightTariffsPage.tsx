import { useSearchParams } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common/Tabs/Tabs';
import { CarrierAutoSelection, CarrierPriceBoard } from '@/features/catalog';
import { ServiceTariffManager } from '@/features/tenants';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

type PricingTab = 'prices' | 'selection' | 'service';

/** `intelligence` is the old link to the proposals screen and still opens it. */
function initialTab(value: string | null): PricingTab {
  if (value === 'selection' || value === 'intelligence') return 'selection';
  if (value === 'service') return 'service';
  return 'prices';
}

export default function FreightTariffsPage() {
  const t = useTranslations('ServiceTariffs');
  const { can } = useAccess();
  const user = useAuthStore((state) => state.user);
  const scopeKey = `${user?.userId}:${user?.actorScope}:${user?.roles.join(',')}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageCarriers = can('carriers.credentials.manage');
  const tab = canManageCarriers ? initialTab(searchParams.get('tab')) : 'service';

  const handleTabChange = (id: string) => {
    const next = initialTab(id);
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === 'prices') params.delete('tab');
      else params.set('tab', next);
      return params;
    });
  };

  return (
    <div className="space-y-5">
      <Tabs
        label={t('tariffGroups')}
        tabs={[
          ...(canManageCarriers
            ? [
                { id: 'prices', label: t('pricesTab') },
                { id: 'selection', label: t('selectionTab') },
              ]
            : []),
          { id: 'service', label: t('serviceTab') },
        ]}
        activeId={tab}
        onChange={handleTabChange}
      />
      {tab === 'prices' ? <CarrierPriceBoard key={scopeKey} /> : null}
      {tab === 'selection' ? <CarrierAutoSelection key={scopeKey} /> : null}
      {tab === 'service' ? <ServiceTariffManager /> : null}
    </div>
  );
}
