import { useEffect, useMemo, useState } from 'react';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';

import { freightTariffApi } from '../api/freightTariffApi';
import { rateProposalApi } from '../api/rateProposalApi';
import { warehouseApi } from '../api/warehouseApi';

import type { RateCollectionJob, RateScenario } from '../api/rateIntelligenceApi';

type StepState = 'done' | 'running' | 'todo';

interface GuideStep {
  key: string;
  title: string;
  detail: string;
  state: StepState;
  action?: { label: string; onClick: () => void };
}

interface RateWorkflowGuideProps {
  routes: readonly RateScenario[];
  jobs: readonly RateCollectionJob[];
  /** Changes whenever a price update finishes, so the counts reload. */
  refreshToken: string;
  onOpenRoutes: () => void;
  onOpenQuotes: () => void;
  onOpenTariffs?: () => void;
}

const STATE_ICON = {
  done: <CheckCircle2 aria-hidden="true" size={18} className="text-[var(--sc-success-dark)]" />,
  running: (
    <Loader2 aria-hidden="true" size={18} className="animate-spin text-[var(--sc-info-dark)]" />
  ),
  todo: <Circle aria-hidden="true" size={18} className="text-[var(--sc-text-secondary)]" />,
} as const;

/**
 * The rate workflow from warehouse to approved rule, with where each step stands, so an admin
 * knows what to do next without knowing how the tabs relate.
 */
export function RateWorkflowGuide({
  routes,
  jobs,
  refreshToken,
  onOpenRoutes,
  onOpenQuotes,
  onOpenTariffs,
}: RateWorkflowGuideProps) {
  const t = useTranslations('RateIntelligence');
  const [cardCount, setCardCount] = useState<{ count: number; more: boolean } | null>(null);
  const [proposals, setProposals] = useState<{ pending: number; approved: number } | null>(null);
  const [warehouseNames, setWarehouseNames] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const now = Date.now();
    void freightTariffApi
      .purchase(undefined, controller.signal)
      .then((page) =>
        setCardCount({
          count: page.items.filter(
            (card) =>
              card.status === 'PUBLISHED' &&
              (card.effectiveTo === null || new Date(card.effectiveTo).getTime() > now),
          ).length,
          more: page.pagination.hasNext,
        }),
      )
      .catch(() => setCardCount(null));
    void warehouseApi
      .list({ search: '', status: 'ACTIVE' }, undefined, controller.signal)
      .then((page) =>
        setWarehouseNames(
          page.items
            .filter((warehouse) => warehouse.tenantId === null)
            .map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
        ),
      )
      .catch(() => setWarehouseNames(null));
    void rateProposalApi
      .list(controller.signal)
      .then((rows) =>
        setProposals({
          pending: rows.filter((row) => row.status === 'PENDING').length,
          approved: rows.filter((row) => row.status === 'APPROVED').length,
        }),
      )
      .catch(() => setProposals(null));
    return () => controller.abort();
  }, [refreshToken]);

  const steps = useMemo<GuideStep[]>(() => {
    const active = routes.filter((route) => route.isActive);
    // Routes of a new warehouse are created on the next price update, so list every active
    // platform warehouse and say which ones are not quoted yet.
    const routeCount = new Map<string, number>();
    for (const route of active) {
      if (route.originWarehouseId) {
        routeCount.set(route.originWarehouseId, (routeCount.get(route.originWarehouseId) ?? 0) + 1);
      }
    }
    const warehouses =
      warehouseNames ??
      [
        ...new Map(
          routes.flatMap((route) =>
            route.originWarehouseId && route.originWarehouseName
              ? [[route.originWarehouseId, route.originWarehouseName] as const]
              : [],
          ),
        ),
      ].map(([id, name]) => ({ id, name }));
    const unquoted = warehouses.filter((warehouse) => !routeCount.get(warehouse.id));
    const running = jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING');
    const lastSuccess = jobs.find(
      (job) => (job.status === 'SUCCEEDED' || job.status === 'PARTIAL') && job.finishedAt,
    );
    return [
      {
        key: 'warehouses',
        title: t('guideWarehouses'),
        detail: !warehouses.length
          ? t('guideWarehousesTodo')
          : [
              t('guideWarehousesList', {
                count: warehouses.length,
                names: warehouses
                  .map((warehouse) =>
                    t('guideWarehouseRoutes', {
                      name: warehouse.name,
                      count: routeCount.get(warehouse.id) ?? 0,
                    }),
                  )
                  .join('; '),
              }),
              unquoted.length
                ? t('guideWarehousesUnquoted', {
                    names: unquoted.map((warehouse) => warehouse.name).join(', '),
                  })
                : t('guideWarehousesQuoted'),
            ].join(' '),
        state: warehouses.length && !unquoted.length ? 'done' : 'todo',
      },
      {
        key: 'routes',
        title: t('guideRoutes'),
        detail: active.length
          ? t('guideRoutesDone', { count: active.length })
          : t('guideRoutesTodo'),
        state: active.length ? 'done' : 'todo',
        action: { label: t('guideRoutesAction'), onClick: onOpenRoutes },
      },
      {
        key: 'prices',
        title: t('guidePrices'),
        detail: running
          ? t('guidePricesRunning')
          : lastSuccess?.finishedAt
            ? t('guidePricesDone', { time: new Date(lastSuccess.finishedAt).toLocaleString() })
            : t('guidePricesTodo'),
        state: running ? 'running' : lastSuccess ? 'done' : 'todo',
        action: { label: t('guidePricesAction'), onClick: onOpenQuotes },
      },
      {
        key: 'tariffs',
        title: t('guideTariffs'),
        detail:
          cardCount && cardCount.count > 0
            ? t('guideTariffsDone', { count: `${cardCount.count}${cardCount.more ? '+' : ''}` })
            : t('guideTariffsTodo'),
        state: cardCount && cardCount.count > 0 ? 'done' : 'todo',
        ...(onOpenTariffs
          ? { action: { label: t('guideTariffsAction'), onClick: onOpenTariffs } }
          : {}),
      },
      {
        key: 'rules',
        title: t('guideRules'),
        detail: proposals?.pending
          ? t('guideRulesPending', { count: proposals.pending })
          : proposals?.approved
            ? t('guideRulesDone')
            : t('guideRulesTodo'),
        state: proposals?.approved && !proposals.pending ? 'done' : 'todo',
      },
    ];
  }, [
    routes,
    jobs,
    cardCount,
    proposals,
    warehouseNames,
    t,
    onOpenRoutes,
    onOpenQuotes,
    onOpenTariffs,
  ]);

  return (
    <Card>
      <CardHeader title={t('guideTitle')} description={t('guideDescription')} />
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex flex-col gap-2 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sc-primary)] text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                {step.title}
              </span>
              <span className="ml-auto" title={t(`guideState_${step.state}`)}>
                {STATE_ICON[step.state]}
                <span className="sr-only">{t(`guideState_${step.state}`)}</span>
              </span>
            </div>
            <p className="flex-1 text-xs text-[var(--sc-text-secondary)]">{step.detail}</p>
            {step.action ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                onClick={step.action.onClick}
              >
                {step.action.label}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
