import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Dropzone, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { parseLocalDateTime } from '@/lib/dateValidation';
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
const schema = z
  .object({
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
    windowStart: z.string(),
    windowEnd: z.string(),
  })
  .superRefine(({ windowStart, windowEnd }, context) => {
    if (!windowStart && !windowEnd) return;
    if (!windowStart || !windowEnd) {
      context.addIssue({
        code: 'custom',
        path: [windowStart ? 'windowEnd' : 'windowStart'],
        message: 'timePair',
      });
      return;
    }
    const from = parseLocalDateTime(windowStart);
    const to = parseLocalDateTime(windowEnd);
    if (!from) {
      context.addIssue({ code: 'custom', path: ['windowStart'], message: 'invalidDateTime' });
    }
    if (!to) context.addIssue({ code: 'custom', path: ['windowEnd'], message: 'invalidDateTime' });
    if (from && to && to <= from) {
      context.addIssue({ code: 'custom', path: ['windowEnd'], message: 'timeOrder' });
    }
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
  const dateText = useTranslations('DateValidation');
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
  const [skuSearch, setSkuSearch] = useState('');
  const [skuOpen, setSkuOpen] = useState(false);
  const skuBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!skuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (skuBoxRef.current && !skuBoxRef.current.contains(event.target as Node)) {
        setSkuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [skuOpen]);
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
    watch,
    setValue,
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
  function windowError(message?: string): string | undefined {
    if (!message) return undefined;
    return dateText(
      message === 'timePair' || message === 'timeOrder' ? message : 'invalidDateTime',
    );
  }
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
      width={countPlan ? '720px' : '560px'}
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
        <p className="m-0 rounded-lg bg-[var(--sc-bg-secondary)] px-3 py-2.5 text-sm leading-6 text-[var(--sc-text-secondary)]">
          {t(`${action.kind}Hint`)}
        </p>
        <fieldset disabled={busy || !!pending} className="space-y-3">
          {quantity && (
            <Input
              type="number"
              required
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
              required
              maxLength={1000}
              {...register('reason')}
              error={errors?.reason?.message}
            />
          )}
          {review && action.kind !== 'resnapshot' && (
            <Select
              label={t('decision')}
              required
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
                required
                {...register('binScan')}
                error={errors?.binScan?.message}
              />
              <Input
                label={t('skuScan')}
                required
                {...register('skuScan')}
                error={errors?.skuScan?.message}
              />
              <Input
                label={t('lotScan')}
                required
                {...register('lotScan')}
                error={errors?.lotScan?.message}
              />
            </>
          )}
          {countPlan && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[var(--sc-text-primary)]">
                  {t('bins')}
                </legend>
                <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 sm:grid-cols-3">
                  {(planOptions?.bins ?? []).map((b) => {
                    const checked = bins.includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition ${
                          checked
                            ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                            : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-primary)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--sc-primary)]"
                          value={b.id}
                          checked={checked}
                          onChange={(e) =>
                            setBins((current) =>
                              e.target.checked
                                ? [...current, b.id]
                                : current.filter((id) => id !== b.id),
                            )
                          }
                        />
                        <span className="truncate">{b.code}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div ref={skuBoxRef} className="relative space-y-2">
                <label className="block text-sm font-medium text-[var(--sc-text-primary)]">
                  {t('skuFilter')}
                </label>
                {(() => {
                  const selectedSkus = watch('skuCodes')
                    .split(/[\s,]+/)
                    .map((v) => v.trim())
                    .filter(Boolean);
                  const query = skuSearch.trim().toUpperCase();
                  const matches = (planOptions?.skuCodes ?? []).filter((sku) =>
                    sku.toUpperCase().includes(query),
                  );
                  const visibleMatches = matches.slice(0, 25);
                  const toggleSku = (sku: string) => {
                    const next = selectedSkus.includes(sku)
                      ? selectedSkus.filter((v) => v !== sku)
                      : [...selectedSkus, sku];
                    setValue('skuCodes', next.join(', '), { shouldDirty: true });
                  };
                  return (
                    <>
                      {selectedSkus.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedSkus.map((sku) => (
                            <span
                              key={sku}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--sc-primary)] bg-[var(--sc-primary-lighter)] px-2 py-0.5 text-xs font-medium text-[var(--sc-primary-dark)]"
                            >
                              {sku}
                              <button
                                type="button"
                                aria-label={sku}
                                onClick={() => toggleSku(sku)}
                                className="ml-0.5 cursor-pointer leading-none hover:opacity-75"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        type="search"
                        value={skuSearch}
                        onFocus={() => setSkuOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setSkuOpen(false);
                        }}
                        onChange={(e) => {
                          setSkuSearch(e.target.value);
                          setSkuOpen(true);
                        }}
                        placeholder={t('skuFilterHint')}
                        className="h-10 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 text-sm text-[var(--sc-text-primary)] outline-none transition focus:border-[var(--sc-primary)]"
                      />
                      {skuOpen && !!planOptions?.skuCodes.length && (
                        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-1 shadow-lg">
                          {visibleMatches.length === 0 ? (
                            <p className="m-0 px-3 py-2 text-xs text-[var(--sc-text-secondary)]">
                              {t('empty')}
                            </p>
                          ) : (
                            visibleMatches.map((sku) => {
                              const active = selectedSkus.includes(sku);
                              return (
                                <button
                                  key={sku}
                                  type="button"
                                  onClick={() => toggleSku(sku)}
                                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                                    active
                                      ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                                      : 'text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]'
                                  }`}
                                >
                                  <span>{sku}</span>
                                  {active && <span>✓</span>}
                                </button>
                              );
                            })
                          )}
                          {matches.length > visibleMatches.length && (
                            <p className="m-0 border-t border-[var(--sc-border-default)] px-3 py-1.5 text-[11px] text-[var(--sc-text-secondary)]">
                              +{matches.length - visibleMatches.length} SKU
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="datetime-local"
                  label={t('windowStart')}
                  {...register('windowStart', { deps: ['windowEnd'] })}
                  error={windowError(errors.windowStart?.message)}
                />
                <Input
                  type="datetime-local"
                  label={t('windowEnd')}
                  {...register('windowEnd', { deps: ['windowStart'] })}
                  error={windowError(errors.windowEnd?.message)}
                />
              </div>
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
            <div className="space-y-1.5">
              <p className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
                {t('evidence')} <span className="text-[var(--sc-error)]">*</span>
              </p>
              <Dropzone
                files={file ? [file] : []}
                onFilesChange={(next) => setFile(next[0] ?? null)}
                accept="image/png,image/jpeg,image/webp"
                multiple={false}
                maxSizeMb={5}
                disabled={busy || !!pending}
                inputLabel={t('evidence')}
              />
            </div>
          )}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-[var(--sc-border-default)] pt-4">
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
