import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { inventoryWorkflowApi, type PutbackOptions } from '../api/inventoryWorkflowApi';
export type WorkflowAction = {
  kind:
    | 'observe'
    | 'countReview'
    | 'resnapshot'
    | 'post'
    | 'disposalRequest'
    | 'disposalReview'
    | 'revoke'
    | 'execute'
    | 'putbackRequest'
    | 'putbackConfirm'
    | 'putbackRetarget';
  id?: string;
  lineId?: string;
  version?: number;
  stockId?: string;
  maxQty?: number;
};
const schema = z.object({
  qty: z.number().int().min(0).max(1000000),
  reason: z.string().max(1000),
  decision: z.enum(['APPROVE', 'REJECT']),
  binScan: z.string().max(160),
  skuScan: z.string().max(160),
  lotScan: z.string().max(160),
  pickConfirmationId: z.string(),
  toBinId: z.string(),
  assigneeId: z.string(),
});
type Form = z.infer<typeof schema>;
export function InventoryWorkflowAction({
  warehouseId,
  action,
  onClose,
  onAccepted,
}: {
  warehouseId: string;
  action: WorkflowAction;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = useTranslations('InventoryWorkflows');
  const revision = useAuthStore((state) => state.revision);
  const [operationId] = useState(createUuid);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<'failed' | 'tariff' | null>(null),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState<{ path: string; body: unknown } | null>(null);
  const running = useRef(false);
  const [options, setOptions] = useState<PutbackOptions | null>(null);
  const putbackPlan = ['putbackRequest', 'putbackRetarget'].includes(action.kind);
  useEffect(() => {
    if (!putbackPlan) return;
    const abort = new AbortController();
    void inventoryWorkflowApi
      .putbackOptions(warehouseId, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setOptions(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('failed');
      });
    return () => abort.abort();
  }, [warehouseId, putbackPlan]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      qty: 1,
      reason: '',
      decision: 'APPROVE',
      binScan: '',
      skuScan: '',
      lotScan: '',
      pickConfirmationId: '',
      toBinId: '',
      assigneeId: '',
    },
  });
  const review = ['countReview', 'disposalReview', 'resnapshot'].includes(action.kind),
    scans = ['execute', 'putbackConfirm'].includes(action.kind),
    quantity = ['observe', 'disposalRequest', 'putbackRequest'].includes(action.kind),
    reason =
      review || ['disposalRequest', 'putbackRequest', 'putbackRetarget'].includes(action.kind),
    image = ['observe', 'execute'].includes(action.kind);
  async function submit(values: Form) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      let command = pending;
      if (!command) {
        if (reason && values.reason.trim().length < 3) throw new Error('REASON_REQUIRED');
        if (
          quantity &&
          (values.qty > (action.maxQty ?? 1000000) || (action.kind !== 'observe' && values.qty < 1))
        ) {
          throw new Error('INVALID_QUANTITY');
        }
        if (scans && [values.binScan, values.skuScan, values.lotScan].some((v) => !v)) {
          throw new Error('SCAN_REQUIRED');
        }
        const common = { operationId, expectedVersion: action.version };
        let evidence;
        if (image) {
          if (!file) throw new Error('EVIDENCE_REQUIRED');
          evidence = await inventoryWorkflowApi.evidence(
            warehouseId,
            action.kind === 'observe'
              ? `counts/${action.id}/evidence?lineId=${action.lineId}`
              : `disposals/${action.id}/evidence`,
            file,
          );
        }
        switch (action.kind) {
          case 'observe':
            command = {
              path: `counts/${action.id}/observation`,
              body: { ...common, lineId: action.lineId, observedQty: values.qty, evidence },
            };
            break;
          case 'countReview':
          case 'resnapshot':
            command = {
              path: `counts/${action.id}/${action.kind === 'resnapshot' ? 'resnapshot' : 'review'}`,
              body: { ...common, reason: values.reason, decision: values.decision },
            };
            break;
          case 'post':
            command = { path: `counts/${action.id}/post`, body: common };
            break;
          case 'disposalRequest':
            command = {
              path: 'disposals',
              body: {
                operationId,
                stockId: action.stockId,
                qty: values.qty,
                reason: values.reason,
                authorizationMode: 'CONSENT',
              },
            };
            break;
          case 'disposalReview':
            command = {
              path: `disposals/${action.id}/review`,
              body: { ...common, reason: values.reason, decision: values.decision },
            };
            break;
          case 'revoke':
            command = { path: `disposals/${action.id}/revoke`, body: common };
            break;
          case 'execute':
            command = {
              path: `disposals/${action.id}/execute`,
              body: {
                ...common,
                binScan: values.binScan,
                skuScan: values.skuScan,
                lotScan: values.lotScan,
                evidence,
              },
            };
            break;
          case 'putbackRequest':
            command = {
              path: 'putbacks',
              body: {
                operationId,
                qty: values.qty,
                reason: values.reason,
                pickConfirmationId: z.uuid().parse(values.pickConfirmationId),
                toBinId: z.uuid().parse(values.toBinId),
                assigneeId: z.uuid().parse(values.assigneeId),
              },
            };
            break;
          case 'putbackRetarget':
            command = {
              path: `putbacks/${action.id}/retarget`,
              body: {
                ...common,
                reason: values.reason,
                toBinId: z.uuid().parse(values.toBinId),
                assigneeId: z.uuid().parse(values.assigneeId),
              },
            };
            break;
          case 'putbackConfirm':
            command = {
              path: `putbacks/${action.id}/confirm`,
              body: {
                ...common,
                binScan: values.binScan,
                skuScan: values.skuScan,
                lotScan: values.lotScan,
              },
            };
            break;
        }
        setPending(command);
      }
      if (useAuthStore.getState().revision !== revision) return;
      await inventoryWorkflowApi.command(warehouseId, command.path, command.body);
      if (useAuthStore.getState().revision !== revision) return;
      onAccepted();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'INVENTORY.DISPOSAL_TARIFF_REQUIRED'
          ? 'tariff'
          : 'failed',
      );
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t(action.kind)}
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => void submit(v))}>
        {error && (
          <Alert
            variant="error"
            title={t(error === 'tariff' ? 'tariffRequired' : 'commandError')}
          />
        )}
        <p>{t(`${action.kind}Hint`)}</p>
        <fieldset disabled={busy || !!pending} className="space-y-3">
          {quantity && (
            <Input
              type="number"
              min={action.kind === 'observe' ? 0 : 1}
              max={action.maxQty ?? 1000000}
              label={t('qty')}
              {...register('qty', { valueAsNumber: true })}
              error={errors.qty ? t('invalid') : undefined}
            />
          )}
          {reason && <Input label={t('reason')} maxLength={1000} {...register('reason')} />}
          {review && action.kind !== 'resnapshot' && (
            <Select
              label={t('decision')}
              {...register('decision')}
              options={[
                { value: 'APPROVE', label: t('approve') },
                { value: 'REJECT', label: t('reject') },
              ]}
            />
          )}
          {scans && (
            <>
              <Input label={t('binScan')} {...register('binScan')} />
              <Input label={t('skuScan')} {...register('skuScan')} />
              <Input label={t('lotScan')} {...register('lotScan')} />
            </>
          )}
          {putbackPlan && (
            <>
              {action.kind === 'putbackRequest' && (
                <Select
                  label={t('pickConfirmationId')}
                  required
                  options={(options?.sources ?? [])
                    .filter((s) => s.qty > 0)
                    .map((s) => ({ value: s.id, label: `${s.sku} · ${s.lotCode} (${s.qty})` }))}
                  {...register('pickConfirmationId')}
                />
              )}
              <Select
                label={t('toBinId')}
                required
                options={(options?.bins ?? []).map((b) => ({
                  value: b.id,
                  label: `${b.code} · ${t(b.zoneType === 'QUARANTINE' ? 'quarantine' : 'storage')}`,
                }))}
                {...register('toBinId')}
              />
              <Select
                label={t('assigneeId')}
                required
                options={(options?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
                {...register('assigneeId')}
              />
            </>
          )}
          {image && (
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              label={t('evidence')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {t(pending ? 'retry' : 'confirm')}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
