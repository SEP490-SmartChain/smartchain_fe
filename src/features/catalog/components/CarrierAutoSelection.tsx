import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';

import { RateProposalPanel } from './RateProposalPanel';
import { RateWatchedRoutes, type RateRouteInput } from './RateWatchedRoutes';
import { adminDivisionApi, type AdminDivision } from '../api/adminDivisionApi';
import { rateIntelligenceApi, type RateScenario } from '../api/rateIntelligenceApi';
import { useRateCollection } from '../hooks/useRateCollection';

/** Tier-scoped carrier proposals and the routes ORCA samples to build them. */
export function CarrierAutoSelection() {
  const t = useTranslations('RateIntelligence');
  const { services, accounts, hasLoadError, refresh, refreshToken } = useRateCollection();
  const [routes, setRoutes] = useState<RateScenario[]>([]);
  const [provinces, setProvinces] = useState<AdminDivision[]>([]);
  const [hasRouteError, setHasRouteError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadRoutes = useCallback(async (signal?: AbortSignal) => {
    setHasRouteError(false);
    try {
      const rows = await rateIntelligenceApi.scenarios(undefined, signal);
      if (!signal?.aborted) setRoutes(rows);
    } catch {
      if (!signal?.aborted) setHasRouteError(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRoutes(controller.signal);
    return () => controller.abort();
  }, [loadRoutes, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    void adminDivisionApi
      .provinces(controller.signal)
      .then(setProvinces)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const serviceOptions = useMemo(() => {
    const connected = new Set(accounts.map((account) => account.carrierId));
    return services
      .filter((service) => connected.has(service.carrierId))
      .map((service) => ({ id: service.id, label: `${service.carrier.name} · ${service.name}` }));
  }, [accounts, services]);

  const handleToggle = async (route: RateScenario) => {
    setIsSaving(true);
    setError('');
    try {
      await rateIntelligenceApi.setScenarioActive(route.id, !route.isActive, route.updatedAt);
      await loadRoutes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (input: RateRouteInput): Promise<boolean> => {
    setIsSaving(true);
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
      await loadRoutes();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {hasLoadError || hasRouteError ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('loadError')}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void refresh();
                void loadRoutes();
              }}
            >
              {t('reload')}
            </Button>
          </div>
        </Alert>
      ) : null}

      <RateProposalPanel refreshToken={refreshToken} />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      <RateWatchedRoutes
        routes={routes}
        serviceOptions={serviceOptions}
        provinces={provinces}
        isSaving={isSaving}
        onToggle={(route) => void handleToggle(route)}
        onCreate={handleCreate}
      />
    </div>
  );
}
