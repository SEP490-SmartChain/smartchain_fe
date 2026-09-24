import type { CSSProperties, ReactNode } from 'react';

import { Boxes, PackageCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';

import { useInventorySummary } from '../hooks/useInventorySummary';

interface SummaryCard {
  key: string;
  label: string;
  value: string | null;
  icon: ReactNode;
  hint?: string;
}

export function StockSummaryCards() {
  const t = useTranslations('Inventory');
  const { summary, error, isLoading, refetch } = useInventorySummary();

  if (error) {
    return (
      <Alert variant="error" title={t('summaryLoadError')}>
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </Alert>
    );
  }

  const cards: SummaryCard[] = [
    {
      key: 'totalSkus',
      label: t('totalSkus'),
      value: summary ? t('totalSkusValue', { count: summary.totalSkus }) : null,
      icon: <Boxes size={18} aria-hidden="true" />,
    },
    {
      key: 'availableUnits',
      label: t('availableStock'),
      value: summary ? t('availableStockValue', { count: summary.availableUnits }) : null,
      icon: <PackageCheck size={18} aria-hidden="true" />,
      hint: t('availableStockHint'),
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={t('summaryLabel')}>
      {cards.map((card, index) => (
        <Card
          key={card.key}
          padding="none"
          className="sc-card-enter flex items-center gap-4 p-5"
          style={{ '--sc-delay': index } as CSSProperties}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
            {card.icon}
          </div>
          <div className="min-w-0">
            <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{card.label}</p>
            {isLoading || card.value === null ? (
              <span
                aria-hidden="true"
                className="mt-1 block h-7 w-24 animate-pulse rounded-md bg-[var(--sc-bg-secondary)]"
              />
            ) : (
              <p className="m-0 mt-1 text-2xl font-semibold text-[var(--sc-text-primary)]">
                {card.value}
              </p>
            )}
            {card.hint && (
              <p className="m-0 mt-1 text-xs text-[var(--sc-text-tertiary)]">{card.hint}</p>
            )}
          </div>
        </Card>
      ))}
    </section>
  );
}
