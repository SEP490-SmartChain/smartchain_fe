import { useCallback, useEffect, useRef, useState } from 'react';

import {
  subscribeUiSync,
  useCommercialLiveSync,
  useIsRealtimeConnected,
} from '@/features/realtime-notifications';
import { createUuid } from '@/lib/uuid';
import { apiClient, ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  commercialApi,
  type CommercialPlan,
  type ContractBusinessProfile,
  type OnboardingInvoice,
  type SellerCommercialState,
} from '../api/commercialApi';
import { launchSigningSession, shouldUseSigningWindow } from '../lib/signingPresentation';
import {
  buildWarehouseSelectionFingerprint,
  normalizeWarehouseIds,
} from '../lib/warehouseSelection';

export function useSellerCommercial() {
  const revision = useAuthStore((state) => state.revision);
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [state, setState] = useState<SellerCommercialState | null>(null);
  const [invoices, setInvoices] = useState<OnboardingInvoice[]>([]);
  const [configured, setConfigured] = useState(false);
  const [warehouseSelectionEnabled, setWarehouseSelectionEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [signingNotice, setSigningNotice] = useState<{
    requestId: string;
    revision: number;
    message: string;
  } | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [pdf, setPdf] = useState<{
    url: string;
    revision: number;
    kind: 'sample' | 'prepared';
  } | null>(null);
  const operation = useRef<{ fingerprint: string; key: string; uncertain: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const isRealtimeConnected = useIsRealtimeConnected();
  const closePdf = useCallback(() => setPdf(null), []);
  const isCurrent = useCallback(
    () => mounted.current && revision === useAuthStore.getState().revision,
    [revision],
  );

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const catalog = await commercialApi.plans(signal);
        const next = await commercialApi.contracts(undefined, signal);
        const bills = await commercialApi.invoices(signal);
        if (!isCurrent() || signal?.aborted) return;
        setPlans(catalog.plans);
        setConfigured(catalog.signingConfigured);
        setWarehouseSelectionEnabled(catalog.warehouseSelectionEnabled);
        setState(next);
        const user = useAuthStore.getState().user;
        if (user && user.serviceStatus !== next.serviceStatus) {
          useAuthStore.getState().setUser({ ...user, serviceStatus: next.serviceStatus });
        }
        setInvoices(bills);
        setError(null);
        if (
          next.signingRequests.some(
            (request) =>
              request.contractId === next.currentContractId && request.status === 'COMPLETED',
          )
        ) {
          setSigningUrl(null);
          setPopupBlocked(false);
        }
      } catch (failure) {
        if (isCurrent() && !signal?.aborted) {
          setError(failure instanceof Error ? failure : new Error('COMMERCIAL.LOAD_FAILED'));
        }
      } finally {
        if (isCurrent() && !signal?.aborted) setLoading(false);
      }
    },
    [isCurrent],
  );

  const handleSigningCompleted = useCallback(() => {
    setSigningUrl(null);
    setPopupBlocked(false);
    setSigningNotice(null);
  }, []);

  const handleRefreshUser = useCallback(async () => {
    await apiClient.currentUser();
    await reload(controller.current?.signal);
  }, [reload]);

  const live = useCommercialLiveSync({
    subscribeUiSync,
    onRefetchCommercial: () => reload(controller.current?.signal),
    onRefreshUser: handleRefreshUser,
    onSigningCompleted: handleSigningCompleted,
  });

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    controller.current = abort;
    void reload(abort.signal);
    if (isRealtimeConnected) {
      return () => {
        mounted.current = false;
        abort.abort();
        controller.current = null;
      };
    }
    // Fallback poll runs only while realtime SSE is disconnected.
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await reload(abort.signal);
      if (!abort.signal.aborted) {
        timer = setTimeout(() => {
          void poll();
        }, 10000);
      }
    };
    timer = setTimeout(() => {
      void poll();
    }, 10000);
    return () => {
      mounted.current = false;
      abort.abort();
      clearTimeout(timer);
      controller.current = null;
    };
  }, [isRealtimeConnected, reload]);

  const start = async (
    plan: CommercialPlan,
    businessProfile?: ContractBusinessProfile,
    warehouseIds?: string[],
  ): Promise<boolean> => {
    if (busy || !plan.agreementId || !plan.agreementVersionRef) return false;
    setBusy(true);
    setError(null);
    const previousContractId = state?.currentContractId;
    const normalizedWarehouseIds =
      warehouseIds === undefined ? undefined : normalizeWarehouseIds(warehouseIds);
    const fingerprint = buildWarehouseSelectionFingerprint(
      plan.agreementId,
      normalizedWarehouseIds,
    );
    if (operation.current?.uncertain && operation.current.fingerprint !== fingerprint) {
      try {
        await commercialApi.contracts(undefined, controller.current?.signal);
      } catch {
        // Proceed with fresh key if pre-check itself cannot reach backend.
      }
    }
    if (operation.current?.fingerprint !== fingerprint) {
      operation.current = { fingerprint, key: createUuid(), uncertain: false };
    }
    try {
      const request = await commercialApi.start(
        plan.agreementId,
        plan.agreementVersionRef,
        operation.current.key,
        controller.current?.signal,
        businessProfile,
        normalizedWarehouseIds,
      );
      if (request.contractId !== previousContractId) {
        operation.current = null;
      } else if (operation.current) {
        operation.current.uncertain = false;
      }
      await reload(controller.current?.signal);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        operation.current = null;
      } else if (operation.current) {
        operation.current.uncertain = true;
      }
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.START_FAILED'));
      }
      return false;
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const open = async (id: string, separateWindow = true) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await launchSigningSession(
        separateWindow || shouldUseSigningWindow(window.location.origin)
          ? () => window.open('about:blank', '_blank')
          : undefined,
        () => commercialApi.session(id, controller.current?.signal),
        isCurrent,
      );
      if (session && isCurrent()) {
        setSigningUrl(session.signingUrl);
        setPopupBlocked(session.popupBlocked);
      }
    } catch (failure) {
      if (isCurrent()) {
        if (
          failure instanceof ApiError &&
          [
            'COMMERCIAL.SIGNING_WAITING_FOR_ADMIN',
            'COMMERCIAL.SIGNING_WAITING_FOR_VERIFICATION',
          ].includes(failure.code)
        ) {
          setSigningNotice({ requestId: id, revision, message: failure.message });
          setSigningUrl(null);
          setPopupBlocked(false);
        } else {
          setError(failure instanceof Error ? failure : new Error('COMMERCIAL.SESSION_FAILED'));
        }
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const download = async (id: string) => {
    try {
      const evidence = await commercialApi.evidence(id, controller.current?.signal);
      if (isCurrent()) window.open(evidence.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.EVIDENCE_FAILED'));
      }
    }
  };
  const openArtifact = async (
    get: () => Promise<{ downloadUrl: string }>,
    kind: 'sample' | 'prepared',
  ) => {
    setError(null);
    try {
      const result = await get();
      if (isCurrent()) setPdf({ url: result.downloadUrl, revision, kind });
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.EVIDENCE_FAILED'));
      }
    }
  };
  return {
    plans,
    state,
    invoices,
    configured,
    warehouseSelectionEnabled,
    loading,
    busy,
    error,
    signingNotice: signingNotice?.revision === revision ? signingNotice : null,
    signingUrl,
    popupBlocked,
    pdfUrl: pdf?.revision === revision ? pdf.url : null,
    pdfKind: pdf?.kind ?? 'sample',
    closePdf,
    start,
    open,
    download,
    preview: (id: string | null) =>
      id
        ? openArtifact(() => commercialApi.preview(id, controller.current?.signal), 'sample')
        : Promise.resolve(),
    original: (id: string) =>
      openArtifact(() => commercialApi.originalPdf(id, controller.current?.signal), 'prepared'),
    contractPdf: (tenantId: string, id: string) =>
      openArtifact(
        () => commercialApi.contractPdf(tenantId, id, controller.current?.signal),
        'prepared',
      ),
    close: () => {
      setSigningUrl(null);
      setPopupBlocked(false);
    },
    reload: () => reload(controller.current?.signal),
    live,
  };
}
