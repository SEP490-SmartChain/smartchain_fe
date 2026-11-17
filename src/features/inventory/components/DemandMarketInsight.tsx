import { useState } from 'react';

import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { cn } from '@/lib/utils';

import type { ForecastMarketInsight } from '../api/demandForecastApi';

/** Figures that show how the AI total follows from the seller's own sales. */
export interface DemandForecastCalculation {
  /** Average units/day over the last 28 days, or null without enough history. */
  recentAverage: string | null;
  baselineTotal: string;
  /** Units sold in the last 30 days, with the base total as a number to compare. */
  trend: { recent: string; direction: 'UP' | 'DOWN' } | null;
  /** `1 + adjustment`, e.g. 1.22. */
  factor: string;
}

interface DemandMarketInsightProps {
  insight: ForecastMarketInsight;
  aiTotal: string;
  calculation: DemandForecastCalculation;
}

const IMPACT_ICON = { UP: ArrowUpRight, DOWN: ArrowDownRight, NEUTRAL: Minus } as const;
const IMPACT_COLOR = {
  UP: 'text-[var(--sc-success)]',
  DOWN: 'text-[var(--sc-error)]',
  NEUTRAL: 'text-[var(--sc-text-tertiary)]',
} as const;
// Links in Google's suggestion chips must open the search page, not navigate the frame.
const SUGGESTION_FRAME_PREFIX = '<base target="_blank">';

/** One-line AI conclusion; the full research (factors, sources) opens in a dialog. */
export function DemandMarketInsight({ insight, aiTotal, calculation }: DemandMarketInsightProps) {
  const t = useTranslations('DemandForecast');
  const [isOpen, setIsOpen] = useState(false);
  const sign = insight.adjustmentPct > 0 ? '+' : '';
  const isKnowledge = insight.mode === 'KNOWLEDGE';
  const suggestion = t('marketSuggestion', {
    pct: `${sign}${insight.adjustmentPct}`,
    total: aiTotal,
  });

  return (
    <section
      aria-labelledby="market-insight-title"
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id="market-insight-title"
            className="flex items-center gap-2 text-base leading-6 font-semibold"
          >
            <Sparkles aria-hidden="true" size={16} className="text-[var(--sc-primary)]" />
            {t('marketTitle')}
          </h3>
          <p className="text-sm text-[var(--sc-text-secondary)] tabular-nums">{suggestion}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
            {t('marketDetail')}
          </Button>
        </div>
      </div>

      <p className="line-clamp-1 text-sm" title={insight.summary}>
        {insight.summary}
      </p>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('marketTitle')}
        width="640px"
      >
        <div className="space-y-5">
          <section className="space-y-2 rounded-xl bg-[var(--sc-bg-secondary)] p-4">
            <h4 className="text-sm font-semibold">{t('marketCalcTitle')}</h4>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm tabular-nums">
              <li>
                {calculation.recentAverage
                  ? t('marketCalcStep1', {
                      average: calculation.recentAverage,
                      base: calculation.baselineTotal,
                    })
                  : t('marketCalcStep1NoAverage', { base: calculation.baselineTotal })}
                {calculation.trend && (
                  <>
                    {' '}
                    {t(
                      calculation.trend.direction === 'DOWN'
                        ? 'marketCalcTrendDown'
                        : 'marketCalcTrendUp',
                      {
                        recent: calculation.trend.recent,
                      },
                    )}
                  </>
                )}
              </li>
              <li>
                {insight.adjustmentPct === 0
                  ? t('marketCalcStep2Zero', { base: calculation.baselineTotal })
                  : t('marketCalcStep2', {
                      pct: `${sign}${insight.adjustmentPct}`,
                      base: calculation.baselineTotal,
                      factor: calculation.factor,
                      total: aiTotal,
                    })}
              </li>
            </ol>
            <p className="text-xs text-[var(--sc-text-secondary)]">{t('marketCalcNote')}</p>
          </section>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t('marketSummaryLabel')}</h4>
            <p className="text-sm">{insight.summary}</p>
          </div>

          {insight.analysis && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">{t('marketAnalysisLabel')}</h4>
              <p className="text-sm leading-6 whitespace-pre-line">{insight.analysis}</p>
            </div>
          )}

          {insight.factors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('marketFactors')}</h4>
              <ul className="space-y-2">
                {insight.factors.map((factor) => {
                  const Icon = IMPACT_ICON[factor.impact];
                  return (
                    <li key={factor.text} className="flex gap-2 text-sm">
                      <Icon
                        aria-label={t(`impact_${factor.impact}`)}
                        size={16}
                        className={cn('mt-0.5 shrink-0', IMPACT_COLOR[factor.impact])}
                      />
                      <span>{factor.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {isKnowledge && (
            <p className="rounded-xl bg-[var(--sc-bg-secondary)] p-3 text-sm">
              {t('marketKnowledgeNote')}
            </p>
          )}

          {insight.sources.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('marketSources')}</h4>
              <ul className="flex flex-wrap gap-2">
                {insight.sources.map((source) => (
                  <li key={source.uri}>
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-xs items-center gap-1 rounded-lg bg-[var(--sc-bg-secondary)] px-2.5 py-1 text-xs text-[var(--sc-primary)] hover:underline"
                    >
                      <span className="truncate">{source.title}</span>
                      <ExternalLink aria-hidden="true" size={12} className="shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.searchSuggestionsHtml && (
            <iframe
              title={t('marketSearchSuggestions')}
              srcDoc={SUGGESTION_FRAME_PREFIX + insight.searchSuggestionsHtml}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-16 w-full rounded-lg border-0"
            />
          )}

          <p className="text-xs text-[var(--sc-text-tertiary)]">
            {t(isKnowledge ? 'marketDisclaimerKnowledge' : 'marketDisclaimer')}
          </p>
        </div>
      </Modal>
    </section>
  );
}
