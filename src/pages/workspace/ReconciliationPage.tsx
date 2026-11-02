import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { UnderConstruction } from '@/components/Common';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import {
  CarrierDisputes,
  CarrierSettlementBatches,
  SepayUnmatchedTransfers,
} from '@/features/reconciliation';
import { useAccess } from '@/hooks/useAccess';

export default function ReconciliationPage() {
  const t = useTranslations('ReconciliationPage');
  const { can } = useAccess();
  const tabs = [
    ...(can('reconciliation.operate')
      ? [
          { id: 'carrier', label: t('carrierTab') },
          { id: 'disputes', label: t('disputesTab') },
        ]
      : []),
    ...(can('invoice.bankReceipt.post') ? [{ id: 'sepay', label: t('sepayTab') }] : []),
  ];
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');

  // Admin read of the carrier settlement screen is not exposed by the API yet.
  const firstTab = tabs[0];
  if (!firstTab) return <UnderConstruction />;
  const current = tabs.some((tab) => tab.id === activeId) ? activeId : firstTab.id;

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <Tabs tabs={tabs} activeId={current} onChange={setActiveId} label={t('tabsLabel')} />
      )}
      {current === 'carrier' ? (
        <CarrierSettlementBatches />
      ) : current === 'disputes' ? (
        <CarrierDisputes />
      ) : (
        <SepayUnmatchedTransfers />
      )}
    </div>
  );
}
