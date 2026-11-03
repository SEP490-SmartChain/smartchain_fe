import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useLocaleStore } from '@/stores/localeStore';

import { ClaimPhotoUpload } from './ClaimPhotoUpload';
import { ClaimReviewForm } from './ClaimReviewForm';
import { claimsApi, type Claim, type ClaimScope } from '../api/claimsApi';
import { useClaimSignal } from '../useClaimSignal';

export function ClaimDetail({
  id,
  scope,
  parentSignal,
  onChanged,
  refreshKey,
}: {
  id: string;
  scope: ClaimScope;
  parentSignal: AbortSignal;
  onChanged: () => void;
  refreshKey: number;
}) {
  const t = useTranslations('Claims'),
    signal = useClaimSignal(parentSignal);
  if (!signal || signal.aborted) return <p role="status">{t('loading')}</p>;
  return (
    <ClaimDetailContent
      key={id}
      id={id}
      scope={scope}
      signal={signal}
      onChanged={onChanged}
      refreshKey={refreshKey}
    />
  );
}
function ClaimDetailContent({
  id,
  scope,
  signal,
  onChanged,
  refreshKey,
}: {
  id: string;
  scope: ClaimScope;
  signal: AbortSignal;
  onChanged: () => void;
  refreshKey: number;
}) {
  const t = useTranslations('Claims'),
    locale = useLocaleStore((s) => s.locale),
    { can } = useAccess();
  const [claim, setClaim] = useState<Claim | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadIntent = useRef<{ file: File; id: string } | null>(null);
  const fail = (failure: unknown) => {
    if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
      setClaim(null);
      setPreview(null);
    }
    const code =
      failure instanceof ApiError
        ? failure.code.replace(/^(CLAIM|UPLOAD)\./, '')
        : failure instanceof Error
          ? failure.message.replace(/^(CLAIM|UPLOAD)\./, '')
          : '';
    if (code === 'EVIDENCE_EXPIRED') {
      uploadIntent.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
  };
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), 300000);
    return () => clearTimeout(timer);
  }, [preview]);
  useEffect(() => {
    const current = new AbortController(),
      abort = () => current.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    claimsApi
      .get(id, scope, current.signal)
      .then((result) => {
        if (!current.signal.aborted) {
          if (
            uploadIntent.current &&
            result.evidence.some(
              (photo) => photo.id === uploadIntent.current?.id && photo.verifiedAt,
            )
          ) {
            uploadIntent.current = null;
            if (fileInput.current) fileInput.current.value = '';
            setError('');
          }
          setClaim(result);
        }
      })
      .catch((e) => {
        if (!current.signal.aborted) fail(e);
      });
    return () => {
      current.abort();
      signal.removeEventListener('abort', abort);
    };
    // Authentication and warehouse changes remount this boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scope.warehouseId, signal, tick, refreshKey]);
  useEffect(() => {
    if (claim?.creditState !== 'PENDING') return;
    const timer = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(timer);
  }, [claim?.creditState]);
  const refresh = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      if (!signal.aborted) refresh();
    } catch (e) {
      if (!signal.aborted) {
        fail(e);
        refresh();
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };
  const upload = (file: File) => {
    if (!claim) return;
    if (uploadIntent.current?.file !== file) uploadIntent.current = { file, id: createUuid() };
    const evidenceId = uploadIntent.current.id;
    void action(async () => {
      await claimsApi.upload(id, claim.version, file, evidenceId, scope, signal);
      uploadIntent.current = null;
      if (fileInput.current) fileInput.current.value = '';
    });
  };
  if (!claim) {
    return (
      <Card className="p-5">
        {error ? <Alert variant="error">{error}</Alert> : <p role="status">{t('loading')}</p>}
        <Button variant="ghost" onClick={refresh}>
          {t('refresh')}
        </Button>
      </Card>
    );
  }
  const money = (value: string | null) =>
    value === null ? '—' : `${new Intl.NumberFormat(locale).format(BigInt(value))} ₫`;
  return (
    <Card className="space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {claim.orderReference} · #{claim.sequenceNo}
          </h2>
          <p className="text-sm text-[var(--sc-text-secondary)]">
            {claim.warehouseName} · {claim.sku ?? claim.productName ?? t('item')}
          </p>
        </div>
        <Badge
          status={
            claim.status === 'CREDITED'
              ? 'success'
              : claim.status === 'REJECTED'
                ? 'error'
                : 'warning'
          }
          label={t(`statuses.${claim.status}`)}
        />
      </header>
      {error && <Alert variant="error">{error}</Alert>}
      {!claim.fulfillmentItemId && <Alert variant="info">{t('legacy')}</Alert>}
      <p className="whitespace-pre-wrap text-sm">{claim.description}</p>
      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-[var(--sc-bg-page)] p-4 text-sm sm:grid-cols-3">
        {[
          [t('incident'), claim.incidentType ? t(`incidents.${claim.incidentType}`) : '—'],
          [t('affectedQty'), String(claim.affectedQty)],
          [
            t('responsibility'),
            claim.responsibility ? t(`liability.${claim.responsibility}`) : t('unclassified'),
          ],
          [t('declaredCost'), money(claim.declaredCostVnd)],
          [t('contractCap'), money(claim.contractCapVnd)],
          [t('maximumCredit'), money(claim.maximumCreditVnd)],
          [t('approvedAmount'), money(claim.approvedAmountVnd)],
          [t('credit'), t(`creditStates.${claim.creditState}`)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[var(--sc-text-secondary)]">{label}</dt>
            <dd className="mt-1 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {claim.declaredCostSource && (
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {t(`source.${claim.declaredCostSource}`)}
        </p>
      )}
      {claim.creditState === 'PENDING' && <Alert variant="info">{t('creditPending')}</Alert>}
      {claim.carrierDisputeId && (
        <Alert variant="info">
          <p>{t('carrierLinked')}</p>
          <p className="mt-1 font-medium">{t('carrierRecoveryIndependent')}</p>
        </Alert>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">{t('evidence')}</h3>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('evidenceHint')}</p>
        {claim.evidence.length === 0 && <Alert variant="warning">{t('missingEvidence')}</Alert>}
        <ul className="space-y-2">
          {claim.evidence.map((photo, index) => (
            <li
              key={photo.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] p-3"
            >
              <span className="text-sm">
                {t('photo', { number: index + 1 })} ·{' '}
                {t(photo.verifiedAt ? 'verified' : 'unverified')}
              </span>
              <div className="flex flex-wrap gap-2">
                {photo.verifiedAt ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const url = await claimsApi.download(id, photo.id, scope, signal);
                        if (!signal.aborted) setPreview(url);
                      })
                    }
                  >
                    {t('viewPhoto')}
                  </Button>
                ) : photo.canConfirm && can('claims.evidence.add') ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          claimsApi.confirm(id, photo.id, claim.version, scope, signal),
                        )
                      }
                    >
                      {t('confirmPhoto')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void action(() => claimsApi.cancel(id, photo.id, scope, signal))
                      }
                    >
                      {t('cancelPhoto')}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {claim.investigationCompletedAt && claim.canAddEvidence && can('claims.evidence.add') && (
          <Alert variant="warning">{t('additionalEvidenceWarning')}</Alert>
        )}
        {claim.canAddEvidence && can('claims.evidence.add') && (
          <ClaimPhotoUpload
            id={`claim-photo-${id}`}
            inputRef={fileInput}
            busy={busy}
            fileName={uploadIntent.current?.file.name ?? null}
            onFile={upload}
            onRetry={
              uploadIntent.current
                ? () => {
                    const intent = uploadIntent.current;
                    if (intent) upload(intent.file);
                  }
                : undefined
            }
          />
        )}
      </section>
      {preview && (
        <figure className="rounded-xl border border-[var(--sc-border-default)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <figcaption className="text-sm font-medium">{t('photoPreview')}</figcaption>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              {t('closePreview')}
            </Button>
          </div>
          <img
            src={preview}
            alt={t('photoPreview')}
            referrerPolicy="no-referrer"
            className="mx-auto max-h-[520px] max-w-full rounded-lg object-contain"
            onError={() => {
              setPreview(null);
              setError(t('errors.EVIDENCE_NOT_FOUND'));
            }}
          />
        </figure>
      )}
      {claim.decisionNote && (
        <section>
          <h3 className="font-semibold">{t('accountantDecision')}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">{claim.decisionNote}</p>
        </section>
      )}
      <ClaimReviewForm
        claim={claim}
        mode="investigate"
        scope={scope}
        signal={signal}
        onChanged={refresh}
      />
      <ClaimReviewForm
        claim={claim}
        mode="decide"
        scope={scope}
        signal={signal}
        onChanged={refresh}
      />
      <section className="border-t border-[var(--sc-border-default)] pt-4">
        <h3 className="font-semibold">{t('history')}</h3>
        <ol className="mt-3 space-y-3">
          {claim.history.map((event) => (
            <li key={event.operationId} className="text-sm">
              <p className="font-medium">
                {t(`actions.${event.kind}`)} · {new Date(event.createdAt).toLocaleString(locale)}
              </p>
              <p className="whitespace-pre-wrap text-[var(--sc-text-secondary)]">{event.note}</p>
            </li>
          ))}
        </ol>
      </section>
    </Card>
  );
}
