import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button, Checkbox, Input, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  assertAcceptedPackaging,
  packagingAcceptanceSchema,
  packagingAiApi,
  type PackagingAcceptance,
  type PackagingRequest,
  type PackagingScope,
  type PackagingSuggestion,
} from '../api/packagingAiApi';

import type { ReceiptSkuPolicy } from '../schemas/receiptCountSchema';

interface Props {
  warehouseId: string;
  asnId: string;
  scope: PackagingScope;
  policy: ReceiptSkuPolicy;
  onPendingChange: (key: string, locked: boolean) => void;
  onClose: () => void;
  onAccepted: (value: NonNullable<PackagingSuggestion['accepted']>) => void;
}
/** A separate form keeps physical counts locked while a single lot is reviewed. */
export function ReceiptPackagingPanel({
  warehouseId,
  asnId,
  scope,
  policy,
  onPendingChange,
  onClose,
  onAccepted,
}: Props) {
  const t = useTranslations('PackagingAI');
  const owner = useAuthStore((state) => state.user);
  const [images, setImages] = useState<
    Array<{ id: string; createdAt: string; note: string | null }>
  >([]);
  const [image, setImage] = useState(''),
    [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [request, setRequest] = useState<PackagingRequest | null>(null),
    [suggestion, setSuggestion] = useState<PackagingSuggestion | null>(null);
  const [acceptance, setAcceptance] = useState<PackagingAcceptance | null>(null);
  const [lot, setLot] = useState(''),
    [manufacture, setManufacture] = useState(''),
    [expiry, setExpiry] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const abort = useRef<AbortController | null>(null),
    sending = useRef(false);
  const isCurrent = () => !abort.current?.signal.aborted && owner === useAuthStore.getState().user;
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    onPendingChange('packaging', true);
    void packagingAiApi
      .availability(warehouseId, asnId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || owner !== useAuthStore.getState().user) return;
        setEnabled(result.enabled);
        setImages(result.images);
        setImage(result.images[0]?.id ?? '');
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && owner === useAuthStore.getState().user) {
          setError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      onPendingChange('packaging', false);
    };
  }, [warehouseId, asnId, owner, onPendingChange, t]);
  function receive(value: PackagingSuggestion) {
    setSuggestion(value);
    if (value.state === 'READY') {
      setLot(value.lotText ?? '');
      setExpiry('');
      setConfirmed(false);
    }
    if (value.state === 'ACCEPTED' && acceptance) {
      assertAcceptedPackaging(value, acceptance);
      if (value.accepted) onAccepted(value.accepted);
    }
  }
  async function run(kind: 'request' | 'check' | 'accept', command?: PackagingAcceptance) {
    if (sending.current || !isCurrent()) return;
    const attempt = request ?? {
      operationKey: createUuid(),
      expectedVersion: scope.receiptVersion,
      inboundLineId: scope.inboundLineId,
      evidenceId: image,
    };
    if (!attempt.evidenceId) return;
    setRequest(attempt);
    setError('');
    sending.current = true;
    setBusy(true);
    if (command) setAcceptance(command);
    try {
      if (kind === 'request') {
        const result = await packagingAiApi.request(
          warehouseId,
          asnId,
          attempt,
          scope,
          abort.current?.signal,
        );
        if (!isCurrent()) return;
        if (result.outcome === 'DISABLED') {
          setEnabled(false);
          setRequest(null);
        } else receive(result.suggestion);
      } else if (kind === 'check') {
        const result = await packagingAiApi.get(
          warehouseId,
          asnId,
          attempt,
          scope,
          abort.current?.signal,
        );
        if (!isCurrent()) return;
        receive(result);
      } else if (command) {
        const result = await packagingAiApi.accept(
          warehouseId,
          asnId,
          attempt,
          scope,
          command,
          abort.current?.signal,
        );
        if (isCurrent() && result.accepted) onAccepted(result.accepted);
      }
    } catch (reason: unknown) {
      if (isCurrent()) {
        setError(reason instanceof ApiError ? reason.message : t('uncertain'));
        if (kind === 'accept' && reason instanceof ApiError && [400, 422].includes(reason.status)) {
          setAcceptance(null);
        }
      }
    } finally {
      sending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return (
    <section
      className="mt-4 space-y-4 rounded-lg border border-[var(--sc-border-default)] p-4"
      aria-label={t('title')}
    >
      <h3 className="font-semibold text-[var(--sc-text-primary)]">{t('title')}</h3>
      <Alert variant="info" title={t('humanReview')}>
        {t('help')}
      </Alert>
      {error && <Alert variant="error" title={error} />}
      {loading ? (
        <p role="status">{t('loading')}</p>
      ) : !enabled ? (
        <Alert variant="info" title={t('disabled')} />
      ) : (
        <>
          {!request && (
            <>
              {images.length === 0 ? (
                <Alert variant="info" title={t('noPhotos')} />
              ) : (
                <>
                  <Select
                    label={t('photo')}
                    required
                    value={image}
                    disabled={busy}
                    onChange={(event) => setImage(event.target.value)}
                    options={images.map((photo, index) => ({
                      value: photo.id,
                      label: `${index + 1}. ${photo.note || photo.createdAt}`,
                    }))}
                  />
                  <Button
                    type="button"
                    isLoading={busy}
                    disabled={!image}
                    onClick={() => void run('request')}
                  >
                    {t('request')}
                  </Button>
                </>
              )}
            </>
          )}
          {request && (!suggestion || suggestion.state === 'RUNNING') && (
            <>
              <Alert variant="info" title={suggestion ? t('running') : t('uncertain')} />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run('check')}
                >
                  {t('check')}
                </Button>
                {!suggestion && (
                  <Button
                    type="button"
                    variant="outline"
                    isLoading={busy}
                    onClick={() => void run('request')}
                  >
                    {t('retry')}
                  </Button>
                )}
              </div>
            </>
          )}
          {suggestion?.state === 'FALLBACK' && (
            <Alert
              variant="info"
              title={t(suggestion.reason === 'QUOTA_EXCEEDED' ? 'quota' : 'unavailable')}
            />
          )}
          {suggestion?.state === 'READY' && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (acceptance) {
                  void run('accept', acceptance);
                  return;
                }
                const result = packagingAcceptanceSchema.safeParse({
                  confirmed,
                  ...(lot.trim() ? { lotCode: lot.trim() } : {}),
                  ...(manufacture ? { manufacturedOn: manufacture } : {}),
                  ...(expiry ? { expiresOn: expiry } : {}),
                });
                if (!result.success) {
                  setError(t('invalid'));
                  return;
                }
                void run('accept', result.data);
              }}
            >
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium">{t('rawLot')}</dt>
                  <dd className="break-words">{suggestion.lotText || t('notRead')}</dd>
                </div>
                <div>
                  <dt className="font-medium">{t('rawExpiry')}</dt>
                  <dd className="break-words">{suggestion.expiryText || t('notRead')}</dd>
                </div>
              </dl>
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('dateHelp')}</p>
              <fieldset
                disabled={busy || acceptance !== null}
                className="grid gap-3 sm:grid-cols-2"
              >
                <Input
                  label={t('lot')}
                  value={lot}
                  maxLength={100}
                  onChange={(event) => {
                    setLot(event.target.value);
                    setConfirmed(false);
                  }}
                />
                {(policy.trackExpiry || policy.manufactureRequired) && (
                  <Input
                    label={t('manufacture')}
                    type="date"
                    required={
                      policy.manufactureRequired || (policy.trackExpiry && !policy.shelfLifeDays)
                    }
                    value={manufacture}
                    onChange={(event) => {
                      setManufacture(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                )}
                {policy.trackExpiry && (
                  <Input
                    label={t('expiry')}
                    type="date"
                    required={!manufacture || !policy.shelfLifeDays}
                    value={expiry}
                    onChange={(event) => {
                      setExpiry(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                )}
                <Checkbox
                  required
                  label={t('confirm')}
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={busy} disabled={!confirmed && !acceptance}>
                  {t(acceptance ? 'retryAccept' : 'accept')}
                </Button>
                {acceptance && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run('check')}
                  >
                    {t('check')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </>
      )}
      <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
        {t('manual')}
      </Button>
    </section>
  );
}
