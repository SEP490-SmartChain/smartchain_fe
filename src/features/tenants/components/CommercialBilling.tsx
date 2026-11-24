import { useState } from 'react';

import { BookOpen, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/stores/authStore';

import { FulfillmentBilling } from './FulfillmentBilling';
import { SellerPayoutWorkspace } from './SellerPayoutWorkspace';

export function CommercialBilling({ tenantId }: { tenantId?: string }) {
  const revision = useAuthStore((state) => state.revision);
  const actorScope = useAuthStore((state) => state.user?.actorScope);
  const t = useTranslations('Payouts');
  const [tab, setTab] = useState<'invoices' | 'statements'>('invoices');

  // Seller (TENANT) đã có 2 mục menu tách biệt hoàn toàn trên Sidebar:
  // - /billing (Hóa đơn)
  // - /statements (Sổ tiền & sao kê)
  // Chỉ Platform (Accountant / Admin) mới dùng chung route /billing cho cả 2 tab.
  const showPlatformSwitcher = !tenantId && actorScope === 'PLATFORM';

  return (
    <div className="space-y-3.5">
      {showPlatformSwitcher && (
        <div
          className="inline-flex rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-1 shadow-xs"
          role="group"
          aria-label={t('view')}
        >
          <button
            type="button"
            aria-pressed={tab === 'invoices'}
            onClick={() => setTab('invoices')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'invoices'
                ? 'bg-[var(--sc-primary-alpha-12)] text-[var(--sc-primary)]'
                : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
            }`}
          >
            <FileText size={14} aria-hidden="true" />
            {t('invoices')}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'statements'}
            onClick={() => setTab('statements')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'statements'
                ? 'bg-[var(--sc-primary-alpha-12)] text-[var(--sc-primary)]'
                : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
            }`}
          >
            <BookOpen size={14} aria-hidden="true" />
            {t('title')}
          </button>
        </div>
      )}
      {!showPlatformSwitcher || tab === 'invoices' || tenantId ? (
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
