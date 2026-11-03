import { useCallback, useEffect, useRef, useState } from 'react';

import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import {
  commercialApi,
  type CommercialPlan,
  type ContractBusinessProfile,
  type OnboardingInvoice,
  type SellerCommercialState,
} from '../api/commercialApi';
import { launchSigningSession, shouldUseSigningWindow } from '../lib/signingPresentation';

export function useSellerCommercial() {
  const revision = useAuthStore((state) => state.revision);
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [state, setState] = useState<SellerCommercialState | null>(null);
  const [invoices, setInvoices] = useState<OnboardingInvoice[]>([]);
  const [mockPaymentsEnabled, setMockPaymentsEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [pdf, setPdf] = useState<{
    url: string;
    revision: number;
    kind: 'sample' | 'prepared';
  } | null>(null);
  const operation = useRef<{ agreementId: string; key: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
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
        setMockPaymentsEnabled(catalog.mockPaymentsEnabled);
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

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    controller.current = abort;
    void reload(abort.signal);
    // Recursive timeout avoids overlapping polls when the API or provider is slow.
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
  }, [reload]);

  const start = async (
    plan: CommercialPlan,
    businessProfile?: ContractBusinessProfile,
  ): Promise<boolean> => {
    if (busy || !plan.agreementId || !plan.agreementVersionRef) return false;
    setBusy(true);
    setError(null);
    if (operation.current?.agreementId !== plan.agreementId) {
      operation.current = { agreementId: plan.agreementId, key: createUuid() };
    }
    try {
      await commercialApi.start(
        plan.agreementId,
        plan.agreementVersionRef,
        operation.current.key,
        controller.current?.signal,
        businessProfile,
      );
      await reload(controller.current?.signal);
      return true;
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.START_FAILED'));
      }
      return false;
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const open = async (id: string, separateWindow = false) => {
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
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.SESSION_FAILED'));
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const mockPayment = async (contractId: string) => {
    if (busy || !mockPaymentsEnabled) return;
    setBusy(true);
    setError(null);
    try {
      await commercialApi.mockPayment(contractId, controller.current?.signal);
      if (isCurrent()) await reload(controller.current?.signal);
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.MOCK_PAYMENT_FAILED'));
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
    mockPaymentsEnabled,
    mockPayment,
    loading,
    busy,
    error,
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
  };
}
