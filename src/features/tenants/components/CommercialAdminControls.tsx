import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAuthStore } from '@/stores/authStore';

import { CommercialDisclosure } from './CommercialDisclosure';
import { commercialApi, type SellerCommercialState } from '../api/commercialApi';
import { launchSigningSession } from '../lib/signingPresentation';

const serviceSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const reconcileSchema = z.object({ documentId: z.string().regex(/^[a-f0-9]{40}$/i) });
export function CommercialAdminControls({
  tenantId,
  state,
  onChanged,
}: {
  tenantId: string;
  state: SellerCommercialState;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('CommercialAdmin');
  const revision = useAuthStore((value) => value.revision);
  const contract = state.contracts.find((item) => item.id === state.currentContractId);
  const canManageService =
    state.serviceStatus === 'ACTIVE' ||
    state.serviceStatus === 'SUSPENDED' ||
    (state.serviceStatus === 'PENDING_ACTIVATION' &&
      (contract?.status === 'ACCEPTED' || contract?.status === 'CONFIRMED'));
  const serviceAction =
    state.serviceStatus === 'ACTIVE'
      ? 'suspendService'
      : state.serviceStatus === 'SUSPENDED'
        ? 'reactivateService'
        : 'activateService';
  const closure = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { reason: '' },
  });
  const service = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { reason: '' },
  });
  const reconcile = useForm<z.infer<typeof reconcileSchema>>({
    resolver: zodResolver(reconcileSchema),
    defaultValues: { documentId: '' },
  });
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signingRequest = state.signingRequests.find(
    (item) => item.contractId === state.currentContractId && item.canSignAsOrcaAdmin,
  );
  const request = state.signingRequests.find(
    (item) =>
      item.contractId === state.currentContractId &&
      ['UNKNOWN', 'FAILED', 'CANCELLED', 'COMPLETED'].includes(item.status),
  );
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => {
      abort.abort();
    };
  }, []);
  const current = () =>
    !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
  const countersign = async () => {
    if (!signingRequest) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const session = await launchSigningSession(
        () => window.open('about:blank', '_blank'),
        () => commercialApi.session(signingRequest.id, controller.current?.signal),
        current,
      );
      if (session?.popupBlocked) setError(t('signingPopupBlocked'));
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  };
  const setStatus = service.handleSubmit(async (input) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.serviceStatus(
        tenantId,
        state.serviceStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
        state.serviceVersion,
        input.reason,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('serviceChanged'));
        await onChanged();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const verify = reconcile.handleSubmit(async (input) => {
    if (!request) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.reconcile(
        tenantId,
        request.id,
        input.documentId,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('reconcileQueued'));
        await onChanged();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const close = closure.handleSubmit(async (input) => {
    if (!contract) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.finalizeClosure(
        tenantId,
        contract.version,
        input.reason,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('closureFinalized'));
        await onChanged();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {canManageService && (
        <CommercialDisclosure title={t(serviceAction)}>
          <form onSubmit={setStatus} className="space-y-3">
            <Input
              label={t('serviceChangeReason')}
              isRequired
              error={service.formState.errors.reason ? t('invalid') : undefined}
              {...service.register('reason')}
            />
            <Button type="submit" variant="outline" isLoading={busy}>
              {t(serviceAction)}
            </Button>
          </form>
        </CommercialDisclosure>
      )}
      {contract?.status === 'TERMINATING' && (
        <form onSubmit={close} className="space-y-3">
          <h3 className="text-base font-semibold">{t('finalizeClosure')}</h3>
          <p className="text-sm">{t('closureGuardHint')}</p>
          <Input
            label={t('closureReason')}
            isRequired
            error={closure.formState.errors.reason ? t('invalid') : undefined}
            {...closure.register('reason')}
          />
          <Button type="submit" isLoading={busy}>
            {t('finalizeClosure')}
          </Button>
        </form>
      )}
      {signingRequest && (
        <Button type="button" onClick={() => void countersign()} isLoading={busy}>
          {t('signAsOrca')}
        </Button>
      )}
      {request && (
        <CommercialDisclosure
          title={t(request.status === 'COMPLETED' ? 'retryInitialInvoice' : 'reconcileSigning')}
        >
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm">
              {t(request.status === 'COMPLETED' ? 'retryInitialInvoiceHint' : 'reconcileHint')}
            </p>
            <p className="break-all text-xs">ORCA-{request.id}</p>
            <Input
              label={t('providerDocument')}
              error={reconcile.formState.errors.documentId ? t('invalid') : undefined}
              {...reconcile.register('documentId')}
            />
            <Button type="submit" isLoading={busy}>
              {t('reconcile')}
            </Button>
          </form>
        </CommercialDisclosure>
      )}
    </div>
  );
}
