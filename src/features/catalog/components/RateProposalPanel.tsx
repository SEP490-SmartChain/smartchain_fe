import { useCallback, useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';
import { ApiError } from '@/services/apiClient';

import { adminDivisionApi } from '../api/adminDivisionApi';
import {
  RATE_PROPOSAL_OBJECTIVES,
  rateProposalApi,
  type RateProposalObjective,
  type RatePriceAlert,
  type RateProposalDetail,
  type RateProposalListItem,
} from '../api/rateProposalApi';
import { rateQuotesApi } from '../api/rateQuotesApi';
import {
  rateProposalDecisionSchema,
  type RateProposalDecisionForm,
} from '../schemas/rateProposalSchema';
import { formatDelta, formatVnd, formatWeight } from '../utils/rateDisplay';

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' } as const;
const ALERT_TONE = { OPEN: 'warning', PROPOSED: 'info', DISMISSED: 'default' } as const;

interface RateProposalPanelProps {
  /** Changes whenever a price update finishes, so alerts and proposals reload. */
  refreshToken?: string;
}

type GenerateWarning = 'proposalEtaUnavailable';

/** Generation failures the admin can fix themselves, by error code. */
const GENERATE_WARNINGS: Readonly<Record<string, GenerateWarning>> = {
  'RATE_PROPOSAL.ETA_UNAVAILABLE': 'proposalEtaUnavailable',
};

export function RateProposalPanel({ refreshToken = '' }: RateProposalPanelProps) {
  const t = useTranslations('RateIntelligence');
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<RatePriceAlert[]>([]);
  const [proposals, setProposals] = useState<RateProposalListItem[]>([]);
  const [selected, setSelected] = useState<RateProposalDetail | null>(null);
  const [maxDays, setMaxDays] = useState('');
  const [objective, setObjective] = useState<RateProposalObjective>('CHEAPEST');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [canCompare, setCanCompare] = useState(false);
  const [provinceNames, setProvinceNames] = useState<Map<string, string>>(new Map());
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const [generateWarning, setGenerateWarning] = useState<GenerateWarning | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RateProposalDecisionForm>({
    resolver: zodResolver(rateProposalDecisionSchema),
    defaultValues: { note: '' },
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const [nextAlerts, nextProposals, quotes, provinces] = await Promise.all([
        rateProposalApi.alerts(signal),
        rateProposalApi.list(signal),
        rateQuotesApi.latest(signal),
        adminDivisionApi.provinces(signal),
      ]);
      setCanCompare(
        new Set(
          quotes.columns
            .filter((column) => column.isComparable)
            .map((column) => column.carrierName),
        ).size >= 2,
      );
      setProvinceNames(new Map(provinces.map((row) => [row.code, row.name])));
      setAlerts(nextAlerts);
      setProposals(nextProposals);
    } catch (error) {
      if (!signal?.aborted) setHasLoadError(true);
      void error;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  const handleGenerate = async () => {
    setIsBusy(true);
    setHasActionError(false);
    setGenerateWarning(null);
    try {
      const days = Number(maxDays);
      const created = await rateProposalApi.generate(
        objective,
        Number.isInteger(days) && days >= 1 && days <= 30 ? days : undefined,
      );
      setSelected(created);
      reset({ note: '' });
      await load();
    } catch (error) {
      const warning = error instanceof ApiError ? GENERATE_WARNINGS[error.code] : undefined;
      if (warning) {
        setGenerateWarning(warning);
      } else {
        setHasActionError(true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setIsBusy(true);
    setHasActionError(false);
    try {
      await rateProposalApi.remove(id);
      if (selected?.id === id) setSelected(null);
      setConfirmDeleteId(null);
      await load();
    } catch (error) {
      setHasActionError(true);
      void error;
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelect = async (id: string) => {
    setHasActionError(false);
    if (selected?.id === id) {
      setSelected(null);
      return;
    }
    try {
      setSelected(await rateProposalApi.get(id));
      reset({ note: '' });
    } catch (error) {
      setHasActionError(true);
      void error;
    }
  };

  const decide = (kind: 'approve' | 'reject') =>
    handleSubmit(async ({ note }) => {
      if (!selected) return;
      setIsBusy(true);
      setHasActionError(false);
      try {
        setSelected(
          kind === 'approve'
            ? await rateProposalApi.approve(selected.id, note)
            : await rateProposalApi.reject(selected.id, note),
        );
        reset({ note: '' });
        await load();
      } catch (error) {
        setHasActionError(true);
        void error;
      } finally {
        setIsBusy(false);
      }
    });

  const renderDetail = (selected: RateProposalDetail) => {
    return (
      <div className="mt-3 border-t border-[var(--sc-border-default)] pt-3">
        {selected.summary.notes.length > 0 ? (
          <Alert className="mt-4" variant="warning" title={t('proposalNotes')}>
            <ul className="list-disc pl-5">
              {selected.summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table aria-label={t('proposalTitle')} className="w-full text-left text-sm">
            <thead>
              <tr className="text-[var(--sc-text-secondary)]">
                <th className="py-2 pr-4 font-medium">{t('proposalRuleRoute')}</th>
                <th className="py-2 pr-4 font-medium">{t('proposalRuleWeight')}</th>
                <th className="py-2 pr-4 font-medium">{t('proposalRuleTarget')}</th>
                <th className="py-2 font-medium">{t('proposalRuleFallback')}</th>
              </tr>
            </thead>
            <tbody>
              {selected.proposedRules.map((rule) => (
                <tr key={rule.name} className="border-t border-[var(--sc-border-default)]">
                  <td className="py-3 pr-4">
                    {rule.coverage
                      ? rule.coverage.provinceCodes
                          .map((code) => provinceNames.get(code) ?? code)
                          .join(', ')
                      : rule.scenarioIds.length}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4">
                    {rule.coverage
                      ? `${rule.coverage.weightMinExclusiveG > 0 ? `${formatWeight(rule.coverage.weightMinExclusiveG)} – ` : `${t('proposalUpTo')} `}${formatWeight(rule.coverage.weightMaxG)}${rule.coverage.isCod ? ` · ${t('routeCod')}` : ''}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 font-medium">
                    {serviceName(rule.action.carrierServiceId)}
                  </td>
                  <td className="py-3">
                    {rule.action.fallbackServiceIds.map(serviceName).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected.status === 'PENDING' && selected.proposedRules.some((rule) => !rule.coverage) ? (
          <p className="mt-4 text-sm text-[var(--sc-text-secondary)]">{t('proposalLegacy')}</p>
        ) : selected.status === 'PENDING' ? (
          <form className="mt-5 space-y-3" onSubmit={(event) => event.preventDefault()}>
            <label className="block text-sm font-medium" htmlFor="rate-proposal-note">
              {t('proposalNote')}
            </label>
            <textarea
              id="rate-proposal-note"
              rows={2}
              maxLength={500}
              placeholder={t('proposalNotePlaceholder')}
              className="block w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2 text-sm"
              {...register('note')}
            />
            {errors.note ? (
              <p role="alert" className="text-sm text-[var(--sc-error-dark)]">
                {errors.note.message}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="button" isLoading={isBusy} onClick={() => void decide('approve')()}>
                {t('proposalApprove')}
              </Button>
              <Button
                type="button"
                variant="softDanger"
                disabled={isBusy}
                onClick={() => void decide('reject')()}
              >
                {t('proposalReject')}
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[var(--sc-text-secondary)]">
            {selected.decidedAt
              ? t('proposalDecided', { time: new Date(selected.decidedAt).toLocaleString() })
              : null}
            {selected.decisionNote ? ` — ${selected.decisionNote}` : null}
          </p>
        )}
        {selected.status === 'APPROVED' ? (
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={() => navigate('/rules')}
          >
            {t('proposalViewRules')}
          </Button>
        ) : null}
      </div>
    );
  };

  const proposalTitle = (proposal: RateProposalListItem) => {
    const days = proposal.summary.maxDeliveryDays;
    const limit =
      days === undefined
        ? ''
        : ` · ${days === null ? t('proposalNoDayLimit') : t('proposalDayLimit', { days })}`;
    return `${t(`objective${proposal.objective}`)}${limit}`;
  };

  const serviceName = (id: string) => selected?.summary.serviceNames[id] ?? id.slice(0, 8);

  return (
    <div className="space-y-5">
      {hasLoadError ? <Alert variant="error">{t('proposalLoadFailed')}</Alert> : null}
      {alerts.length > 0 ? (
        <Card>
          <CardHeader title={t('alertsTitle')} />
          <div className="overflow-x-auto">
            <table aria-label={t('alertsTitle')} className="w-full text-left text-sm">
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-t border-[var(--sc-border-default)]">
                    <td className="py-3 pr-4 font-medium">{alert.carrier?.name ?? '—'}</td>
                    <td className="py-3 pr-4">
                      {t('alertChange', {
                        oldPrice: formatVnd(alert.oldPriceVnd),
                        newPrice: formatVnd(alert.newPriceVnd),
                        delta: formatDelta(alert.deltaPct),
                      })}
                    </td>
                    <td className="py-3">
                      <Badge
                        status={ALERT_TONE[alert.status]}
                        label={t(`alertStatus${alert.status}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('proposalTitle')} description={t('proposalDescription')} />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Select
              id="rate-proposal-objective"
              label={t('proposalObjective')}
              value={objective}
              onChange={(event) => {
                const next = RATE_PROPOSAL_OBJECTIVES.find((value) => value === event.target.value);
                if (next) setObjective(next);
              }}
              options={RATE_PROPOSAL_OBJECTIVES.map((value) => ({
                value,
                label: t(`objective${value}`),
              }))}
            />
          </div>
          {objective === 'CHEAPEST' ? (
            <div className="w-64">
              <label className="mb-1 block text-sm font-medium" htmlFor="rate-proposal-max-days">
                {t('proposalMaxDays')}
              </label>
              <input
                id="rate-proposal-max-days"
                type="number"
                min={1}
                max={30}
                inputMode="numeric"
                value={maxDays}
                onChange={(event) => setMaxDays(event.target.value)}
                placeholder={t('proposalMaxDaysPlaceholder')}
                className="block w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2 text-sm"
              />
            </div>
          ) : null}
          <Button
            type="button"
            isLoading={isBusy}
            disabled={!canCompare}
            onClick={() => void handleGenerate()}
          >
            {isBusy ? t('proposalGenerating') : t('proposalGenerate')}
          </Button>
        </div>
        <p className="mt-3 text-sm text-[var(--sc-text-secondary)]">
          {t(`proposalMethod${objective}`)}
        </p>
        {!isLoading && !canCompare ? (
          <p className="mt-3 text-sm text-[var(--sc-text-secondary)]">
            {t('proposalNeedCarriers')}
          </p>
        ) : null}
        {hasActionError ? (
          <Alert className="mt-4" variant="error">
            {t('proposalActionFailed')}
          </Alert>
        ) : null}
        {generateWarning ? (
          <Alert className="mt-4" variant="warning">
            {t(generateWarning)}
          </Alert>
        ) : null}

        <div className="mt-5 space-y-2">
          {!isLoading && proposals.length === 0 ? (
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('proposalEmpty')}</p>
          ) : null}
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="rounded-xl border border-[var(--sc-border-default)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{proposalTitle(proposal)}</span>
                    <Badge
                      status={STATUS_TONE[proposal.status]}
                      label={t(`proposalStatus${proposal.status}`)}
                    />
                    {proposal.isSample ? <Badge status="info" label={t('sampleLabel')} /> : null}
                  </div>
                  <p className="text-xs text-[var(--sc-text-secondary)]">
                    {t('proposalRules', { count: proposal.summary.rules })}
                    {' · '}
                    {proposal.expectedSavingPct === null
                      ? t('proposalNoSaving')
                      : t('proposalSaving', { value: proposal.expectedSavingPct.toFixed(2) })}
                    {' · '}
                    {new Date(proposal.createdAt).toLocaleString()}
                  </p>
                </div>
                {proposal.status !== 'APPROVED' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="softDanger"
                    disabled={isBusy}
                    onClick={() => void handleDelete(proposal.id)}
                    onBlur={() => setConfirmDeleteId(null)}
                  >
                    {confirmDeleteId === proposal.id
                      ? t('proposalDeleteConfirm')
                      : t('proposalDelete')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={selected?.id === proposal.id}
                  aria-controls={`rate-proposal-detail-${proposal.id}`}
                  onClick={() => void handleSelect(proposal.id)}
                >
                  {selected?.id === proposal.id ? t('proposalHideDetail') : t('proposalDetail')}
                </Button>
              </div>
              {selected?.id === proposal.id ? (
                <div id={`rate-proposal-detail-${proposal.id}`}>{renderDetail(selected)}</div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
