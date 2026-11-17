import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common/Tabs/Tabs';
import {
  CarrierAccountManager,
  CarrierWebhookManager,
  GlobalCarrierCatalog,
} from '@/features/catalog';
import { useAccess } from '@/hooks/useAccess';

// Tariffs have their own route; carrier setup keeps catalogue, accounts and inbound callbacks together.
export default function CarrierCatalogPage() {
  const t = useTranslations('FreightTariffs');
  const webhookT = useTranslations('CarrierWebhooks');
  const { can } = useAccess();
  const [tab, setTab] = useState('catalogue');
  return (
    <>
      <Tabs
        tabs={[
          { id: 'catalogue', label: t('catalogue') },
          { id: 'accounts', label: t('accounts') },
          ...(can('carriers.credentials.manage')
            ? [{ id: 'webhooks', label: webhookT('tab') }]
            : []),
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
          <CarrierWebhookManager />
        )}
      </div>
    </>
  );
}
