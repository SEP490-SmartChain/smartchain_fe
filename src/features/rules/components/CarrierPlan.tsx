import { Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ServiceChain } from './ServiceChain';

import type { RuleRecord } from '../types/rule.types';

interface CarrierPlanProps {
  /** The effective catch-all carrier rule, or null when none is enabled. */
  rule: RuleRecord | null;
  serviceNames: Readonly<Record<string, string>>;
  areServicesReady: boolean;
}

const CARD =
  'flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4';
const ICON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]';

export function CarrierPlan({ rule, serviceNames, areServicesReady }: CarrierPlanProps) {
  const t = useTranslations('Rules');
  const action = rule?.action;
  if (!action || !('carrierServiceId' in action)) {
    return (
      <section aria-label={t('carrierPlan.title')} className={CARD}>
        <span className={ICON}>
          <Truck size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">{t('carrierPlan.none')}</p>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('carrierPlan.noneHint')}</p>
        </div>
      </section>
    );
  }
  const ids = [action.carrierServiceId, ...action.fallbackServiceIds];
  return (
    <section aria-label={t('carrierPlan.title')} className={CARD}>
      <span className={ICON}>
        <Truck size={20} aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{t('carrierPlan.title')}</p>
        <ServiceChain ids={ids} serviceNames={serviceNames} isReady={areServicesReady} />
      </div>
      {ids.length > 1 && (
        <p className="basis-full text-xs text-[var(--sc-text-secondary)] sm:ml-auto sm:basis-auto sm:max-w-56">
          {t('carrierPlan.fallbackNote')}
        </p>
      )}
    </section>
  );
}
