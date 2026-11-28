import { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Checkbox, Input, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError, apiClient, type ApiResponse } from '@/services/apiClient';

import { InboundScanButton } from './InboundScanButton';

import type { ReceivingState } from '../api/receivingApi';

const status = z.enum([
  'REINSPECT',
  'MANUAL_REQUIRED',
  'APPLIED',
  'RELABEL_REQUIRED',
  'RELABEL_VERIFIED',
]);
const history = z.array(
  z.object({
    id: z.uuid(),
    productId: z.uuid(),
    reason: z.string(),
    status,
    createdAt: z.string(),
  }),
);

type PolicyDraft = {
  trackLot: boolean;
  trackExpiry: boolean;
  manufactureRequired: boolean;
  shelfLifeDays: string;
  minInboundShelfLifePct: string;
  minOutboundDays: string;
  nearExpiryDays: string;
};

function policyDraft(line: ReceivingState['lines'][number]): PolicyDraft {
  return {
    trackLot: line.trackLot,
    trackExpiry: line.trackExpiry,
    manufactureRequired: line.manufactureRequired,
    shelfLifeDays: line.shelfLifeDays?.toString() ?? '',
    minInboundShelfLifePct: line.minInboundShelfLifePct.toString(),
    minOutboundDays: line.minOutboundDays?.toString() ?? '',
    nearExpiryDays: line.nearExpiryDays?.toString() ?? '',
  };
}

export function ReceiptPolicyAdjustment({
  warehouseId,
  receipt,
  disabled,
  onPendingChange,
  onChanged,
}: {
  warehouseId: string;
  receipt: ReceivingState;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('Receiving');
  const lines = useMemo(
    () =>
      Array.from(
        new Map(
          receipt.lines.filter((line) => line.productId).map((line) => [line.productId, line]),
        ).values(),
      ),
    [receipt.lines],
  );
  const [productId, setProductId] = useState('');
  const line = lines.find((item) => item.productId === productId);
  const [draft, setDraft] = useState<PolicyDraft>();
  const [reason, setReason] = useState('');
  const [physical, setPhysical] = useState(false);
  const [lotId, setLotId] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [manufacturedOn, setManufacturedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [verifiedCodes, setVerifiedCodes] = useState<Record<string, string>>({});
  const [items, setItems] = useState<z.infer<typeof history>>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const pending = useRef<{ payload: string; operationKey: string } | undefined>(undefined);
  const base = `/v1/warehouses/${encodeURIComponent(warehouseId)}/asns/${encodeURIComponent(receipt.asnId)}/receiving/policy-adjustments`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void apiClient
      .get<ApiResponse<unknown>>(base, { signal: controller.signal, silent: true })
      .then(({ data }) => {
        if (!controller.signal.aborted) setItems(history.parse(data));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('adjustmentFailure'));
      });
    return () => controller.abort();
  }, [base, open, revision, t]);

  function selectSku(id: string) {
    const selected = lines.find((item) => item.productId === id);
    setProductId(id);
    setDraft(selected ? policyDraft(selected) : undefined);
    setLotId('');
    setPhysical(false);
  }

  async function submit() {
    if (!line?.productId || !draft || disabled || busy || reason.trim().length < 3) return;
    const payload = {
      productId: line.productId,
      expectedVersion: receipt.version,
      reason: reason.trim(),
      policy: {
        trackLot: draft.trackLot,
        trackExpiry: draft.trackExpiry,
        manufactureRequired: draft.manufactureRequired,
        shelfLifeDays: draft.shelfLifeDays === '' ? null : Number(draft.shelfLifeDays),
        minInboundShelfLifePct: Number(draft.minInboundShelfLifePct),
        minOutboundDays: Number(draft.minOutboundDays),
        nearExpiryDays: Number(draft.nearExpiryDays),
      },
      ...(physical
        ? {
            correction: {
              lotId,
              lotCode: lotCode.trim(),
              manufacturedOn: manufacturedOn || null,
              expiresOn: expiresOn || null,
              evidenceId: evidenceId.trim(),
            },
          }
        : {}),
    };
    const serialized = JSON.stringify(payload);
    pending.current =
      pending.current?.payload === serialized
        ? pending.current
        : { payload: serialized, operationKey: createUuid() };
    setBusy(true);
    onPendingChange(true);
    setError('');
    try {
      await apiClient.post(
        base,
        { ...payload, operationKey: pending.current.operationKey },
        { silent: true },
      );
      pending.current = undefined;
      setReason('');
      setRevision((value) => value + 1);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('adjustmentFailure'));
    } finally {
      setBusy(false);
      onPendingChange(false);
    }
  }

  async function verify(id: string) {
    if (disabled || busy || !verifiedCodes[id]?.trim()) return;
    setBusy(true);
    onPendingChange(true);
    setError('');
    try {
      await apiClient.post(
        `${base}/${encodeURIComponent(id)}/relabel-verification`,
        { lotCode: verifiedCodes[id].trim() },
        { silent: true },
      );
      setRevision((value) => value + 1);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('adjustmentFailure'));
    } finally {
      setBusy(false);
      onPendingChange(false);
    }
  }

  const lots = receipt.lines
    .filter((item) => item.productId === productId)
    .flatMap((item) => item.count?.lots ?? []);
  const fieldDisabled = disabled || busy;
  return (
    <details
      className="space-y-4 rounded-xl border border-[var(--sc-border-default)] p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">{t('adjustmentTitle')}</summary>
      {error && <Alert variant="error">{error}</Alert>}
      <Select
        label={t('adjustmentSku')}
        value={productId}
        disabled={fieldDisabled}
        onChange={(event) => selectSku(event.target.value)}
        options={lines.map((item) => ({ value: item.productId ?? '', label: item.sku }))}
      />
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['trackLot', 'adjustmentTrackLot'],
                ['trackExpiry', 'adjustmentTrackExpiry'],
                ['manufactureRequired', 'adjustmentManufacture'],
              ] as const
            ).map(([key, label]) => (
              <Checkbox
                key={key}
                label={t(label)}
                checked={draft[key]}
                disabled={fieldDisabled}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['shelfLifeDays', 'adjustmentShelfLife', 1, 36500],
                ['minInboundShelfLifePct', 'adjustmentMinimum', 0, 100],
                ['minOutboundDays', 'adjustmentOutbound', 0, 36500],
                ['nearExpiryDays', 'adjustmentNearExpiry', 0, 36500],
              ] as const
            ).map(([key, label, min, max]) => (
              <Input
                key={key}
                label={t(label)}
                type="number"
                min={min}
                max={max}
                step={key === 'minInboundShelfLifePct' ? 0.01 : 1}
                required={key !== 'shelfLifeDays'}
                value={draft[key]}
                disabled={fieldDisabled}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            ))}
          </div>
          <Input
            label={t('adjustmentReason')}
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            disabled={fieldDisabled}
            onChange={(event) => setReason(event.target.value)}
          />
          {lots.length > 0 && (
            <Checkbox
              label={t('adjustmentLotData')}
              checked={physical}
              disabled={fieldDisabled}
              onChange={(event) => setPhysical(event.target.checked)}
            />
          )}
          {physical && lots.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t('adjustmentLot')}
                required
                value={lotId}
                disabled={fieldDisabled}
                onChange={(event) => {
                  const lot = lots.find((item) => item.lotId === event.target.value);
                  setLotId(event.target.value);
                  setLotCode(lot?.lotCode ?? '');
                  setManufacturedOn(lot?.manufacturedOn ?? '');
                  setExpiresOn(lot?.expiresOn ?? '');
                }}
                options={lots.map((lot) => ({ value: lot.lotId, label: lot.lotCode }))}
              />
              <Input
                label={t('adjustmentLotCode')}
                value={lotCode}
                required
                maxLength={120}
                disabled={fieldDisabled}
                onChange={(event) => setLotCode(event.target.value)}
              />
              <Input
                label={t('adjustmentManufacturedOn')}
                value={manufacturedOn}
                type="date"
                disabled={fieldDisabled}
                onChange={(event) => setManufacturedOn(event.target.value)}
              />
              <Input
                label={t('adjustmentExpiresOn')}
                value={expiresOn}
                type="date"
                disabled={fieldDisabled}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
              <Input
                label={t('adjustmentEvidence')}
                required
                value={evidenceId}
                maxLength={36}
                disabled={fieldDisabled}
                onChange={(event) => setEvidenceId(event.target.value)}
              />
            </div>
          )}
          <Button type="submit" disabled={fieldDisabled}>
            {t('adjustmentPost')}
          </Button>
        </form>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">{t('adjustmentHistory')}</h3>
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id}>
                <p>
                  {lines.find((sku) => sku.productId === item.productId)?.sku} ·{' '}
                  {t(`adjustmentStatus.${item.status}`)}
                </p>
                <p className="break-words text-sm">{item.reason}</p>
                {item.status === 'RELABEL_REQUIRED' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      label={t('adjustmentRelabel')}
                      value={verifiedCodes[item.id] ?? ''}
                      disabled={fieldDisabled}
                      onChange={(event) =>
                        setVerifiedCodes({ ...verifiedCodes, [item.id]: event.target.value })
                      }
                    />
                    <InboundScanButton
                      label={t('adjustmentRelabel')}
                      disabled={fieldDisabled}
                      onScan={(value) => setVerifiedCodes({ ...verifiedCodes, [item.id]: value })}
                    />
                    <Button
                      type="button"
                      disabled={fieldDisabled || !verifiedCodes[item.id]?.trim()}
                      onClick={() => void verify(item.id)}
                    >
                      {t('adjustmentVerify')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
