import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

import {
  commercialApi,
  type CommercialPlan,
  type OnboardingInvoice,
  type SellerCommercialState,
} from '../api/commercialApi';

export function useSellerCommercial() {
  const revision = useAuthStore((state) => state.revision);
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [state, setState] = useState<SellerCommercialState | null>(null);
  const [invoices, setInvoices] = useState<OnboardingInvoice[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; revision: number } | null>(null);
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
        setState(next);
        setInvoices(bills);
        setError(null);
        if (
          next.signingRequests.some(
            (request) =>
              request.contractId === next.currentContractId && request.status === 'COMPLETED',
          )
        ) {
          setSigningUrl(null);
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

  const start = async (plan: CommercialPlan) => {
    if (busy || !plan.agreementId || !plan.agreementVersionRef) return;
    setBusy(true);
    setError(null);
    if (operation.current?.agreementId !== plan.agreementId) {
      operation.current = { agreementId: plan.agreementId, key: crypto.randomUUID() };
    }
    try {
      await commercialApi.start(
        plan.agreementId,
        plan.agreementVersionRef,
        operation.current.key,
        controller.current?.signal,
      );
      await reload(controller.current?.signal);
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.START_FAILED'));
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const open = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await commercialApi.session(id, controller.current?.signal);
      if (isCurrent()) setSigningUrl(session.signingUrl);
    } catch (failure) {
      if (isCurrent()) {
        setError(failure instanceof Error ? failure : new Error('COMMERCIAL.SESSION_FAILED'));
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
  const openArtifact = async (get: () => Promise<{ downloadUrl: string }>) => {
    setError(null);
    try {
      const result = await get();
      if (isCurrent()) setPdf({ url: result.downloadUrl, revision });
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
    loading,
    busy,
    error,
    signingUrl,
    pdfUrl: pdf?.revision === revision ? pdf.url : null,
    closePdf,
    start,
    open,
    download,
    preview: (id: string | null) =>
      id
        ? openArtifact(() => commercialApi.preview(id, controller.current?.signal))
        : Promise.resolve(),
    original: (id: string) =>
      openArtifact(() => commercialApi.originalPdf(id, controller.current?.signal)),
    contractPdf: (tenantId: string, id: string) =>
      openArtifact(() => commercialApi.contractPdf(tenantId, id, controller.current?.signal)),
    close: () => setSigningUrl(null),
    reload: () => reload(controller.current?.signal),
  };
}
