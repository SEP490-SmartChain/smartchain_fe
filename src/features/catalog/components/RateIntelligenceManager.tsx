import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Tabs } from '@/components/Common/Tabs/Tabs';

import { RateContractImport } from './RateContractImport';
import { RatePriceUpdateCard } from './RatePriceUpdateCard';
import { RateProposalPanel } from './RateProposalPanel';
import { RateQuoteComparisonTable } from './RateQuoteComparison';
import { RateSnapshotsTable } from './RateSnapshotsTable';
import { RateUpdateHistory } from './RateUpdateHistory';
import { RateWatchedRoutes, type RateRouteInput } from './RateWatchedRoutes';
import { RateWorkflowGuide } from './RateWorkflowGuide';
import { adminDivisionApi, type AdminDivision } from '../api/adminDivisionApi';
import { carrierAccountApi, type CarrierAccount } from '../api/carrierAccountApi';
import { freightTariffApi } from '../api/freightTariffApi';
import {
  rateIntelligenceApi,
  type RateCollectionJob,
  type RateScenario,
  type RateSnapshot,
} from '../api/rateIntelligenceApi';

type SectionId = 'overview' | 'quotes' | 'history' | 'advanced';

const POLL_INTERVAL_MS = 5000;

interface RateIntelligenceManagerProps {
  /** Opens the purchase tariff list, which lives on another tab of the page. */
  onOpenTariffs?: () => void;
}

export function RateIntelligenceManager({ onOpenTariffs }: RateIntelligenceManagerProps = {}) {
  const t = useTranslations('RateIntelligence');
  const [section, setSection] = useState<SectionId>('overview');
  const [isContractOpen, setIsContractOpen] = useState(false);
  const [services, setServices] = useState<Awaited<ReturnType<typeof freightTariffApi.services>>>(
    [],
  );
  const [jobs, setJobs] = useState<RateCollectionJob[]>([]);
  const [snapshots, setSnapshots] = useState<RateSnapshot[]>([]);
  const [routes, setRoutes] = useState<RateScenario[]>([]);
  const [accounts, setAccounts] = useState<CarrierAccount[]>([]);
  const [provinces, setProvinces] = useState<AdminDivision[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async (carrierId?: string, isQuiet = false) => {
    if (!isQuiet) setIsLoading(true);
    setHasLoadError(false);
    try {
      const [serviceRows, jobRows, snapshotRows, routeRows, accountPage] = await Promise.all([
        freightTariffApi.services(),
        rateIntelligenceApi.jobs(),
        rateIntelligenceApi.snapshots(carrierId),
        rateIntelligenceApi.scenarios(),
        carrierAccountApi.list({ environment: 'SANDBOX' }),
      ]);
      setServices(serviceRows);
      setJobs(jobRows);
      setSnapshots(snapshotRows);
      setRoutes(routeRows);
      setAccounts(accountPage.items.filter((account) => account.status === 'CONNECTED'));
    } catch {
      if (!isQuiet) setHasLoadError(true);
    } finally {
      if (!isQuiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(selectedCarrierId || undefined);
  }, [refresh, selectedCarrierId]);

  useEffect(() => {
    const controller = new AbortController();
    void adminDivisionApi
      .provinces(controller.signal)
      .then(setProvinces)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const hasRunningJob = jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING');
  useEffect(() => {
    if (!hasRunningJob) return undefined;
    const timer = window.setInterval(
      () => void refresh(selectedCarrierId || undefined, true),
      POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [hasRunningJob, refresh, selectedCarrierId]);

  const carriers = useMemo(() => {
    const unique = new Map<string, { id: string; code: string; name: string }>();
    for (const service of services) {
      if (!unique.has(service.carrierId)) {
        unique.set(service.carrierId, {
          id: service.carrierId,
          code: service.carrier.code,
          name: service.carrier.name,
        });
      }
    }
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [services]);

  const updateAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        carrierCode: account.orcaCarrier.code,
        carrierName: account.orcaCarrier.name,
      })),
    [accounts],
  );

  const serviceOptions = useMemo(() => {
    const connected = new Set(accounts.map((account) => account.carrierId));
    return services
      .filter((service) => connected.has(service.carrierId))
      .map((service) => ({ id: service.id, label: `${service.carrier.name} · ${service.name}` }));
  }, [accounts, services]);

  const handleUpdate = async (accountIds: string[]) => {
    setBusyAccountId(accountIds.length > 1 ? 'all' : (accountIds[0] ?? null));
    setError('');
    setNotice('');
    try {
      for (const accountId of accountIds) {
        await rateIntelligenceApi.collect(accountId, crypto.randomUUID());
      }
      setNotice(t('updateQueued'));
      await refresh(selectedCarrierId || undefined, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleToggleRoute = async (route: RateScenario) => {
    setIsSavingRoute(true);
    setError('');
    try {
      await rateIntelligenceApi.setScenarioActive(route.id, !route.isActive, route.updatedAt);
      await refresh(selectedCarrierId || undefined, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setIsSavingRoute(false);
    }
  };

  const handleCreateRoute = async (input: RateRouteInput): Promise<boolean> => {
    setIsSavingRoute(true);
    setError('');
    setNotice('');
    try {
      await rateIntelligenceApi.createScenario({
        ...input,
        receiverArea: 'WARD',
        declaredValueVnd: 0,
        codValueVnd: 0,
      });
      setNotice(t('routeSaved'));
      await refresh(selectedCarrierId || undefined, true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
      return false;
    } finally {
      setIsSavingRoute(false);
    }
  };

  const latestJob = jobs[0];
  const refreshToken = latestJob ? `${latestJob.id}:${latestJob.status}` : 'none';

  return (
    <div className="space-y-5">
      <Tabs
        variant="pills"
        label={t('tabsLabel')}
        activeId={section}
        onChange={(id) => setSection(id as SectionId)}
        tabs={[
          { id: 'overview', label: t('tabOverview') },
          { id: 'quotes', label: t('tabQuotes') },
          { id: 'history', label: t('tabHistory') },
          { id: 'advanced', label: t('tabAdvanced') },
        ]}
      />

      {hasLoadError ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('loadError')}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void refresh(selectedCarrierId || undefined)}
            >
              {t('reload')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {section === 'overview' ? (
        <>
          <RateWorkflowGuide
            routes={routes}
            jobs={jobs}
            refreshToken={refreshToken}
            onOpenRoutes={() => setSection('advanced')}
            onOpenQuotes={() => setSection('quotes')}
            {...(onOpenTariffs ? { onOpenTariffs } : {})}
          />
          <RatePriceUpdateCard
            accounts={updateAccounts}
            jobs={jobs}
            busyAccountId={busyAccountId}
            notice={notice}
            error={error}
            onUpdate={(ids) => void handleUpdate(ids)}
          />
          <RateProposalPanel refreshToken={refreshToken} />
        </>
      ) : null}

      {section === 'quotes' ? <RateQuoteComparisonTable refreshToken={refreshToken} /> : null}

      {section === 'history' ? <RateUpdateHistory jobs={jobs} /> : null}

      {section === 'advanced' ? (
        <>
          {error ? <Alert variant="error">{error}</Alert> : null}
          {notice ? <Alert variant="success">{notice}</Alert> : null}
          <RateWatchedRoutes
            routes={routes}
            serviceOptions={serviceOptions}
            provinces={provinces}
            isSaving={isSavingRoute}
            onToggle={(route) => void handleToggleRoute(route)}
            onCreate={handleCreateRoute}
          />
          <Card>
            <CardHeader
              title={t('advancedContractTitle')}
              description={t('advancedContractHint')}
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsContractOpen((open) => !open)}
                >
                  {isContractOpen ? t('routeAddClose') : t('advancedContractOpen')}
                </Button>
              }
            />
          </Card>
          {isContractOpen ? (
            <>
              <RateContractImport
                carriers={carriers}
                onImported={async (carrierId) => {
                  setSelectedCarrierId(carrierId);
                  await refresh(carrierId, true);
                }}
              />
              <RateSnapshotsTable
                snapshots={snapshots}
                carriers={carriers}
                selectedCarrierId={selectedCarrierId}
                isLoading={isLoading}
                onCarrierChange={setSelectedCarrierId}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
