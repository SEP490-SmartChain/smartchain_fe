import { Fragment } from 'react';

import { useTranslations } from 'next-intl';

import { useProvinceNames } from '@/features/catalog';

import { ServiceChain } from './ServiceChain';
import { summarizeCondition } from '../lib/ruleSummary';

import type { RuleAction, RuleCondition, RuleField } from '../types/rule.types';

interface RuleSentenceProps {
  condition: RuleCondition;
  action: RuleAction;
  serviceNames: Readonly<Record<string, string>>;
  areServicesReady: boolean;
}

const KEYWORD =
  'inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold tracking-wide';
const CLAUSE =
  'inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-1 text-xs text-[var(--sc-text-primary)]';

export function RuleSentence({
  condition,
  action,
  serviceNames,
  areServicesReady,
}: RuleSentenceProps) {
  const t = useTranslations('Rules');
  const provinceNames = useProvinceNames();
  const weight = (grams: unknown) =>
    Number(grams) >= 1000 ? `${Number(grams) / 1000} kg` : `${String(grams)} g`;
  const plainClause = (predicate: Extract<RuleCondition, { kind: 'PREDICATE' }>): string | null => {
    if (
      predicate.field === 'provinceCode' &&
      'values' in predicate &&
      predicate.operator === 'IN'
    ) {
      return t('sentence.deliverTo', {
        names: predicate.values.map((code) => provinceNames.get(String(code)) ?? code).join(', '),
      });
    }
    if (predicate.field === 'weightG' && 'value' in predicate) {
      if (predicate.operator === 'LTE') {
        return t('sentence.weightUpTo', { weight: weight(predicate.value) });
      }
      if (predicate.operator === 'GT') {
        return t('sentence.weightOver', { weight: weight(predicate.value) });
      }
    }
    if (predicate.field === 'isCod' && 'value' in predicate && predicate.operator === 'EQ') {
      return t(predicate.value ? 'sentence.cod' : 'sentence.noCod');
    }
    return null;
  };
  const summary = summarizeCondition(condition, {
    predicate: plainClause,
    field: (field: RuleField) => t(`fields.${field}`),
    operator: (operator) => t(`operators.${operator}`),
    boolean: (value) => t(value ? 'yes' : 'no'),
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`${KEYWORD} bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]`}>
          {t('ifLabel')}
        </span>
        {summary.clauses.length === 0 ? (
          <span className={`${CLAUSE} text-[var(--sc-text-secondary)]`}>{t('allOrders')}</span>
        ) : (
          summary.clauses.map((clause, index) => (
            <Fragment key={clause}>
              {index > 0 && (
                <span className="text-xs text-[var(--sc-text-secondary)]">
                  {t(summary.joiner === 'ALL' ? 'andWord' : 'orWord')}
                </span>
              )}
              <span className={CLAUSE}>{clause}</span>
            </Fragment>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`${KEYWORD} bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]`}>
          {t('thenLabel')}
        </span>
        {'strategy' in action ? (
          <span className="text-sm font-medium">{t(`strategies.${action.strategy}`)}</span>
        ) : (
          <ServiceChain
            ids={[action.carrierServiceId, ...action.fallbackServiceIds]}
            serviceNames={serviceNames}
            isReady={areServicesReady}
          />
        )}
      </div>
    </div>
  );
}
