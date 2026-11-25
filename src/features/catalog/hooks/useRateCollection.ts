import { useCallback, useEffect, useMemo, useState } from 'react';

import { useIsRealtimeConnected, useRealtimeSync } from '@/features/realtime-notifications';

import { carrierAccountApi, type CarrierAccount } from '../api/carrierAccountApi';
import { freightTariffApi } from '../api/freightTariffApi';
import { rateIntelligenceApi, type RateCollectionJob } from '../api/rateIntelligenceApi';

import type { TariffService } from '../schemas/freightTariffSchema';

const POLL_INTERVAL_MS = 5000;

export async function loadRateCollectionAccounts(signal?: AbortSignal): Promise<CarrierAccount[]> {
  const accounts: CarrierAccount[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await carrierAccountApi.list({ environment: 'SANDBOX', cursor }, signal);
    accounts.push(...page.items.filter((account) => account.status === 'CONNECTED'));
    if (!page.hasMore) return accounts;
    if (!page.nextCursor || seen.has(page.nextCursor)) {
      throw new Error('Invalid account pagination');
    }
    cursor = page.nextCursor;
    seen.add(cursor);
  } while (!signal?.aborted);
  return [];
}

/**
 * Carrier services, connected carrier accounts and price collection jobs shared by the
 * carrier price and automatic carrier selection tabs. Polls while a collection job runs.
 */
export function useRateCollection() {
  const [services, setServices] = useState<TariffService[]>([]);
  const [accounts, setAccounts] = useState<CarrierAccount[]>([]);
  const [jobs, setJobs] = useState<RateCollectionJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const isRealtimeConnected = useIsRealtimeConnected();

  const refresh = useCallback(async (isQuiet = false, signal?: AbortSignal) => {
    if (!isQuiet) {
      setIsLoading(true);
      setHasLoadError(false);
    }
    try {
      const [serviceRows, jobRows, accountRows] = await Promise.all([
        freightTariffApi.services(signal),
        rateIntelligenceApi.jobs(signal),
        loadRateCollectionAccounts(signal),
      ]);
      if (signal?.aborted) return;
      setServices(serviceRows);
      setJobs(jobRows);
      setAccounts(accountRows);
      setHasLoadError(false);
    } catch {
      if (!signal?.aborted) setHasLoadError(true);
    } finally {
      if (!isQuiet && !signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(false, controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const hasRunningJob = jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING');
  useRealtimeSync(['rates.collection'], () => {
    void refresh(true);
  });
  useEffect(() => {
    if (!hasRunningJob || isRealtimeConnected) return undefined;
    const controller = new AbortController();
    const timer = window.setInterval(() => void refresh(true, controller.signal), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hasRunningJob, isRealtimeConnected, refresh]);

  /** Changes whenever a price update starts or finishes, so dependent tables reload. */
  const refreshToken = jobs.map((job) => `${job.id}:${job.status}`).join('|') || 'none';

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

  return { services, accounts, jobs, carriers, isLoading, hasLoadError, refresh, refreshToken };
}
