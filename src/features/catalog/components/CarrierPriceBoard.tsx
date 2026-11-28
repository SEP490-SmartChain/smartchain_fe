import { useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Tabs } from '@/components/Common/Tabs/Tabs';

import { FreightMarkupSettings } from './FreightMarkupSettings';
import { RatePriceUpdateCard } from './RatePriceUpdateCard';
import { RateQuoteComparisonTable } from './RateQuoteComparison';
import { RateSnapshotsTable } from './RateSnapshotsTable';
import { RateUpdateHistory } from './RateUpdateHistory';
import { rateIntelligenceApi, type RateSnapshot } from '../api/rateIntelligenceApi';
import { useRateCollection } from '../hooks/useRateCollection';
import type { FreightMarkup } from '../schemas/freightMarkupSchema';
import { latestPriceUpdate } from '../utils/rateDisplay';

type ViewId = 'matrix' | 'bands' | 'history';

/** Carrier API prices, collection status and the ORCA freight markup. */
export function CarrierPriceBoard() {
  const t = useTranslations('RateIntelligence');
  const { accounts, jobs, carriers, isLoading, hasLoadError, refresh, refreshToken } =
    useRateCollection();
  const [view, setView] = useState<ViewId>('matrix');
  const [freightMarkup, setFreightMarkup] = useState<FreightMarkup | null>(null);
  const [snapshots, setSnapshots] = useState<RateSnapshot[]>([]);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [hasSnapshotError, setHasSnapshotError] = useState(false);
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const [carrierId, setCarrierId] = useState('');
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (view !== 'bands') return undefined;
    const controller = new AbortController();
    setIsSnapshotLoading(true);
    setHasSnapshotError(false);
    void rateIntelligenceApi
      .snapshots(carrierId || undefined, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setSnapshots(rows.filter((row) => row.source !== 'CONTRACT_IMPORT'));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setHasSnapshotError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSnapshotLoading(false);
      });
    return () => controller.abort();
  }, [view, carrierId, refreshToken, snapshotRetry]);

  const updateAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        carrierCode: account.orcaCarrier.code,
        carrierName: account.orcaCarrier.name,
      })),
    [accounts],
  );
  const lastUpdatedAt = useMemo(() => latestPriceUpdate(jobs), [jobs]);

  const handleUpdate = async (accountIds: string[]) => {
    setBusyAccountId(accountIds.length > 1 ? 'all' : (accountIds[0] ?? null));
    setError('');
    setNotice('');
    try {
      for (const accountId of accountIds) {
        await rateIntelligenceApi.collect(accountId, crypto.randomUUID());
      }
      setNotice(t('updateQueued'));
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setBusyAccountId(null);
    }
  };

  return (
    <div className="space-y-5">
      <FreightMarkupSettings onLoaded={setFreightMarkup} />
      {hasLoadError ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('loadError')}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()}>
              {t('reload')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {isLoading && jobs.length === 0 ? (
        <div className="h-28 animate-pulse rounded-2xl bg-[var(--sc-bg-secondary)]" aria-hidden />
      ) : (
        <RatePriceUpdateCard
          accounts={updateAccounts}
          jobs={jobs}
          lastUpdatedAt={lastUpdatedAt}
          busyAccountId={busyAccountId}
          notice={notice}
          error={error}
          onUpdate={(ids) => void handleUpdate(ids)}
        />
      )}

      <Tabs
        variant="pills"
        label={t('pricesViewLabel')}
        activeId={view}
        onChange={(id) => setView(id as ViewId)}
        tabs={[
          { id: 'matrix', label: t('viewMatrix') },
          { id: 'bands', label: t('viewBands') },
          { id: 'history', label: t('viewHistory') },
        ]}
      />

      {view === 'matrix' ? (
        <RateQuoteComparisonTable
          refreshToken={refreshToken}
          markupVnd={freightMarkup?.markupVnd}
        />
      ) : null}
      {view === 'bands' && hasSnapshotError ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('loadError')}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setSnapshotRetry((value) => value + 1)}
            >
              {t('reload')}
            </Button>
          </div>
        </Alert>
      ) : view === 'bands' ? (
        <RateSnapshotsTable
          snapshots={snapshots}
          carriers={carriers}
          selectedCarrierId={carrierId}
          isLoading={isSnapshotLoading}
          onCarrierChange={setCarrierId}
        />
      ) : null}
      {view === 'history' ? <RateUpdateHistory jobs={jobs} /> : null}
    </div>
  );
}
