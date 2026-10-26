import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { useAuthStore } from '@/stores/authStore';

import { FulfillmentBilling } from './FulfillmentBilling';
import { SellerPayoutWorkspace } from './SellerPayoutWorkspace';

export function CommercialBilling({ tenantId }: { tenantId?: string }) {
  const revision = useAuthStore((state) => state.revision);
  const t = useTranslations('Payouts');
  const [tab, setTab] = useState<'invoices' | 'statements'>('invoices');
  return (
    <div className="space-y-6">
      {!tenantId && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('view')}>
          <Button
            variant={tab === 'invoices' ? 'primary' : 'outline'}
            aria-pressed={tab === 'invoices'}
            onClick={() => setTab('invoices')}
          >
            {t('invoices')}
          </Button>
          <Button
            variant={tab === 'statements' ? 'primary' : 'outline'}
            aria-pressed={tab === 'statements'}
            onClick={() => setTab('statements')}
          >
            {t('title')}
          </Button>
        </div>
      )}
      {tab === 'invoices' || tenantId ? (
        <FulfillmentBilling
          key={String(revision) + ':' + (tenantId ?? 'own')}
          tenantId={tenantId}
        />
      ) : (
        <SellerPayoutWorkspace key={revision} />
      )}
    </div>
  );
}
