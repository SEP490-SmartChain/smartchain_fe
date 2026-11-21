import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  inventoryWorkflowApi,
  type CountPlanOptions,
  type EvidenceDigest,
  type InventoryWorkflowCommandInput,
  type PutbackOptions,
} from '../api/inventoryWorkflowApi';
export type WorkflowAction = {
  kind:
    | 'countPlan'
    | 'countAssign'
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
  skuCodes: z.string().max(2000),
  windowStart: z.string().max(32),
  windowEnd: z.string().max(32),
});
type Form = z.infer<typeof schema>;

type WorkflowCommand = { path: string; body: InventoryWorkflowCommandInput };

/**
 * Blind counting may observe a physical zero; every disposal/putback movement must move at
 * least one whole unit. Exported as a pure rule so the Node regression suite can pin it.
 */
export function isWorkflowQuantityValid(
  kind: WorkflowAction['kind'],
  qty: number,
  maxQty?: number,
): boolean {
  if (!Number.isInteger(qty) || qty < 0) return false;
  if (qty > (maxQty ?? 1000000)) return false;
  return kind === 'observe' || qty >= 1;
}

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
    [pending, setPending] = useState<WorkflowCommand | null>(null);
  const running = useRef(false);
  const [options, setOptions] = useState<PutbackOptions | null>(null);
  const putbackPlan = ['putbackRequest', 'putbackRetarget'].includes(action.kind);
  const countPlan = action.kind === 'countPlan';
  const countAssign = action.kind === 'countAssign';
  const [planOptions, setPlanOptions] = useState<CountPlanOptions | null>(null);
  const [bins, setBins] = useState<string[]>([]);
  useEffect(() => {
    if (!putbackPlan && !countPlan && !countAssign) return;
    const abort = new AbortController();
    const request =
      countPlan || countAssign
        ? inventoryWorkflowApi.countOptions(warehouseId, abort.signal).then((value) => {
            if (!abort.signal.aborted) setPlanOptions(value);
          })
        : inventoryWorkflowApi.putbackOptions(warehouseId, abort.signal).then((value) => {
            if (!abort.signal.aborted) setOptions(value);
          });
    void request.catch(() => {
      if (!abort.signal.aborted) setError('failed');
    });
    return () => abort.abort();
  }, [warehouseId, putbackPlan, countPlan, countAssign]);
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
      skuCodes: '',
      windowStart: '',
      windowEnd: '',
    },
  });
  const review = ['countReview', 'disposalReview', 'resnapshot'].includes(action.kind),
    scans = ['execute', 'putbackConfirm', 'observe'].includes(action.kind),
    quantity = ['observe', 'disposalRequest', 'putbackRequest'].includes(action.kind),
    reason =
      review ||
      ['disposalRequest', 'putbackRequest', 'putbackRetarget', 'countPlan', 'countAssign'].includes(
        action.kind,
      ),
    image = ['observe', 'execute'].includes(action.kind);
  // The frozen wire request types require real UUID references and a positive CAS version.
  // Validate those here, before a request can be built, and keep the exact same body for retry.
  function targetId(): string {
    return z.uuid().parse(action.id);
  }
  function commandBase() {
    return {
      operationId,
      expectedVersion: z.number().int().positive().parse(action.version),
    };
  }
  async function signEvidence(): Promise<EvidenceDigest> {
    if (!file) throw new Error('EVIDENCE_REQUIRED');
    const path =
      action.kind === 'observe'
        ? `counts/${targetId()}/evidence?lineId=${z.uuid().parse(action.lineId)}`
        : `disposals/${targetId()}/evidence`;
    return inventoryWorkflowApi.evidence(warehouseId, path, file);
  }
  async function submit(values: Form) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      let command = pending;
      if (!command) {
        if (reason && values.reason.trim().length < 3) throw new Error('REASON_REQUIRED');
        if (quantity && !isWorkflowQuantityValid(action.kind, values.qty, action.maxQty)) {
          throw new Error('INVALID_QUANTITY');
        }
        if (scans && [values.binScan, values.skuScan, values.lotScan].some((v) => !v)) {
          throw new Error('SCAN_REQUIRED');
        }
        switch (action.kind) {
          case 'countPlan': {
            const skuCodes = values.skuCodes
              .split(/[\s,]+/)
              .map((v) => v.trim())
              .filter(Boolean);
            if (!bins.length && !skuCodes.length) throw new Error('SELECTION_REQUIRED');
            if (!!values.windowStart !== !!values.windowEnd) throw new Error('INVALID_WINDOW');
            command = {
              path: 'counts',
              body: {
                operationId,
                ...(bins.length ? { binIds: bins } : {}),
                ...(skuCodes.length ? { skuCodes } : {}),
                ...(values.windowStart
                  ? {
                      countWindowStart: new Date(values.windowStart).toISOString(),
                      countWindowEnd: new Date(values.windowEnd).toISOString(),
                    }
                  : {}),
                assigneeId: z.uuid().parse(values.assigneeId),
                reason: values.reason,
              },
            };
            break;
          }
          case 'countAssign':
            command = {
              path: `counts/${targetId()}/assignment`,
              body: {
                ...commandBase(),
                assigneeId: z.uuid().parse(values.assigneeId),
                reason: values.reason,
              },
            };
            break;
          case 'observe':
            command = {
              path: `counts/${targetId()}/observation`,
              body: {
                ...commandBase(),
                lineId: z.uuid().parse(action.lineId),
                observedQty: values.qty,
                binScan: values.binScan,
                skuScan: values.skuScan,
                lotScan: values.lotScan,
                evidence: await signEvidence(),
              },
            };
            break;
          case 'countReview':
          case 'resnapshot':
            command = {
              path: `counts/${targetId()}/${action.kind === 'resnapshot' ? 'resnapshot' : 'review'}`,
              body: { ...commandBase(), reason: values.reason, decision: values.decision },
            };
            break;
          case 'post':
            command = { path: `counts/${targetId()}/post`, body: commandBase() };
            break;
          case 'disposalRequest':
            command = {
              path: 'disposals',
              body: {
                operationId,
                stockId: z.uuid().parse(action.stockId),
                qty: values.qty,
                reason: values.reason,
                authorizationMode: 'CONSENT',
              },
            };
            break;
          case 'disposalReview':
            command = {
              path: `disposals/${targetId()}/review`,
              body: { ...commandBase(), reason: values.reason, decision: values.decision },
            };
            break;
          case 'revoke':
            command = { path: `disposals/${targetId()}/revoke`, body: commandBase() };
            break;
          case 'execute':
            command = {
              path: `disposals/${targetId()}/execute`,
              body: {
                ...commandBase(),
                binScan: values.binScan,
                skuScan: values.skuScan,
                lotScan: values.lotScan,
                evidence: await signEvidence(),
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
              path: `putbacks/${targetId()}/retarget`,
              body: {
                ...commandBase(),
                reason: values.reason,
                toBinId: z.uuid().parse(values.toBinId),
                assigneeId: z.uuid().parse(values.assigneeId),
              },
            };
            break;
          case 'putbackConfirm':
            command = {
              path: `putbacks/${targetId()}/confirm`,
              body: {
                ...commandBase(),
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
      <form
        className="space-y-4"
        onSubmit={handleSubmit(
          (v) => void submit(v),
          () => notifyInvalidForm(),
        )}
      >
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
          {reason && (
            <Input
              label={t('reason')}
              maxLength={1000}
              {...register('reason')}
              error={errors?.reason?.message}
            />
          )}
          {review && action.kind !== 'resnapshot' && (
            <Select
              label={t('decision')}
              {...register('decision')}
              error={errors?.decision?.message}
              options={[
                { value: 'APPROVE', label: t('approve') },
                { value: 'REJECT', label: t('reject') },
              ]}
            />
          )}
          {scans && (
            <>
              <Input
                label={t('binScan')}
                {...register('binScan')}
                error={errors?.binScan?.message}
              />
              <Input
                label={t('skuScan')}
                {...register('skuScan')}
                error={errors?.skuScan?.message}
              />
              <Input
                label={t('lotScan')}
                {...register('lotScan')}
                error={errors?.lotScan?.message}
              />
            </>
          )}
          {countPlan && (
            <>
              <fieldset className="space-y-1">
                <legend>{t('bins')}</legend>
                {(planOptions?.bins ?? []).map((b) => (
                  <label key={b.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={b.id}
                      checked={bins.includes(b.id)}
                      onChange={(e) =>
                        setBins((current) =>
                          e.target.checked
                            ? [...current, b.id]
                            : current.filter((id) => id !== b.id),
                        )
                      }
                    />
                    <span>{b.code}</span>
                  </label>
                ))}
              </fieldset>
              <Input
                label={t('skuFilter')}
                placeholder={t('skuFilterHint')}
                {...register('skuCodes')}
                error={errors?.skuCodes?.message}
              />
              <Input
                type="datetime-local"
                label={t('windowStart')}
                {...register('windowStart')}
                error={errors?.windowStart?.message}
              />
              <Input
                type="datetime-local"
                label={t('windowEnd')}
                {...register('windowEnd')}
                error={errors?.windowEnd?.message}
              />
              <Select
                label={t('assigneeId')}
                required
                options={(planOptions?.staff ?? []).map((s) => ({
                  value: s.id,
                  label: s.fullName,
                }))}
                {...register('assigneeId')}
                error={errors?.assigneeId?.message}
              />
            </>
          )}
          {countAssign && (
            <Select
              label={t('assigneeId')}
              required
              options={(planOptions?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
              {...register('assigneeId')}
              error={errors?.assigneeId?.message}
            />
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
                  error={errors?.pickConfirmationId?.message}
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
                error={errors?.toBinId?.message}
              />
              <Select
                label={t('assigneeId')}
                required
                options={(options?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
                {...register('assigneeId')}
                error={errors?.assigneeId?.message}
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
