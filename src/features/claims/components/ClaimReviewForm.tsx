import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';

import { getPendingClaim, retryClaimCommand, sendClaimCommand } from '../api/claimCommands';
import { responsibilitySchema, type Claim, type ClaimScope } from '../api/claimsApi';

const schema = z.object({
  responsibility: z.union([responsibilitySchema, z.literal('')]),
  complete: z.boolean(),
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(5).max(2000),
});
type Values = z.infer<typeof schema>;
export function ClaimReviewForm({
  claim,
  mode,
  scope,
  signal,
  onChanged,
}: {
  claim: Claim;
  mode: 'investigate' | 'decide';
  scope: ClaimScope;
  signal: AbortSignal;
  onChanged: () => void;
}) {
  const t = useTranslations('Claims'),
    { can } = useAccess();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(() => getPendingClaim(mode, claim.id, scope)),
    [editing, setEditing] = useState(() => !claim.investigationNote),
    [reviewVersion, setReviewVersion] = useState(claim.version),
    [savedVersion, setSavedVersion] = useState<number | null>(null);
  const defaults: Values = {
    responsibility: claim.responsibility ?? '',
    complete: mode === 'investigate' && Boolean(claim.investigationCompletedAt),
    decision: 'REJECT',
    note: mode === 'investigate' ? (claim.investigationNote ?? '') : '',
  };
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const ready = Boolean(claim.investigationCompletedAt) && claim.evidence.some((e) => e.verifiedAt);
  const active = mode === 'investigate' ? claim.canInvestigate : claim.canDecide;
  const permitted = can(mode === 'investigate' ? 'claims.investigate' : 'claims.decide');
  const waiting = savedVersion !== null && claim.version < savedVersion;
  const stale = reviewVersion !== claim.version;
  const startEditing = () => {
    form.reset(defaults);
    setReviewVersion(claim.version);
    setError('');
    setEditing(true);
  };
  const saved = (version: number) => {
    setPending(undefined);
    setSavedVersion(version);
    setEditing(false);
    onChanged();
  };
  const fail = (failure: unknown) => {
    const code =
      failure instanceof ApiError
        ? failure.code.replace(/^(CLAIM|UPLOAD)\./, '')
        : failure instanceof Error
          ? failure.message.replace(/^(CLAIM|UPLOAD)\./, '')
          : '';
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
  };
  const submit = form.handleSubmit(async (values) => {
    if (stale) return;
    if (mode === 'investigate' && !values.responsibility) {
      form.setError('responsibility', { message: t('required') });
      return;
    }
    setBusy(true);
    setError('');
    try {
      let version: number;
      if (mode === 'investigate' && values.responsibility) {
        const result = await sendClaimCommand(
          {
            kind: 'investigate',
            id: claim.id,
            scope,
            input: {
              expectedVersion: reviewVersion,
              responsibility: values.responsibility,
              complete: values.complete,
              note: values.note,
            },
          },
          signal,
        );
        version = result.version;
      } else {
        const result = await sendClaimCommand(
          {
            kind: 'decide',
            id: claim.id,
            scope,
            input: { expectedVersion: reviewVersion, decision: values.decision, note: values.note },
          },
          signal,
        );
        version = result.version;
      }
      if (!signal.aborted) {
        saved(version);
      }
    } catch (e) {
      if (!signal.aborted) {
        fail(e);
        setPending(getPendingClaim(mode, claim.id, scope));
        onChanged();
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  });
  const retry = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const result = await retryClaimCommand(pending, signal, scope);
      if (!signal.aborted) {
        saved(result.version);
      }
    } catch (e) {
      if (!signal.aborted) {
        fail(e);
        setPending(getPendingClaim(mode, claim.id, scope));
        onChanged();
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };
  const summary = mode === 'investigate' && Boolean(claim.investigationNote);
  if (!summary && (!permitted || (!active && !pending))) return null;
  const showForm = permitted && active && !waiting && (mode === 'decide' || editing || pending);
  return (
    <section className="space-y-4 border-t border-[var(--sc-border-default)] pt-5">
      <h3 className="font-semibold">
        {t(mode === 'investigate' ? 'investigate' : 'accountantDecision')}
      </h3>
      {waiting && <p role="status">{t('updatingInvestigation')}</p>}
      {!waiting && summary && !showForm && (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap">{claim.investigationNote}</p>
          <p className="text-[var(--sc-text-secondary)]">
            {t(claim.investigationCompletedAt ? 'investigationComplete' : 'investigationPending')}
          </p>
          {claim.investigationCompletedAt && ['OPEN', 'INVESTIGATING'].includes(claim.status) && (
            <Alert variant="info">{t('awaitingAccountant')}</Alert>
          )}
          {permitted && active && (
            <Button type="button" variant="secondary" onClick={startEditing}>
              {t('editInvestigation')}
            </Button>
          )}
        </div>
      )}
      {error && !pending && <Alert variant="error">{error}</Alert>}
      {permitted && pending && (
        <Alert variant="warning">
          <p>{t('pendingRequest')}</p>
          <Button type="button" onClick={() => void retry()} isLoading={busy}>
            {t('retrySame')}
          </Button>
        </Alert>
      )}
      {showForm && (
        <form onSubmit={submit}>
          {stale && !pending && (
            <Alert variant="warning">
              <p>{t('reviewChanged')}</p>
              <Button type="button" variant="secondary" onClick={startEditing}>
                {t('reloadReview')}
              </Button>
            </Alert>
          )}
          <fieldset disabled={busy || Boolean(pending) || stale} className="space-y-4">
            {mode === 'investigate' ? (
              <>
                <Select
                  label={t('responsibility')}
                  placeholder={t('required')}
                  error={form.formState.errors.responsibility ? t('required') : undefined}
                  options={['ORCA_WAREHOUSE', 'CARRIER', 'SELLER'].map((value) => ({
                    value,
                    label: t(`liability.${value}`),
                  }))}
                  {...form.register('responsibility')}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...form.register('complete')}
                    disabled={!claim.evidence.some((e) => e.verifiedAt) || busy || Boolean(pending)}
                  />
                  {t('completeInvestigation')}
                </label>
              </>
            ) : (
              <>
                <Alert variant="info">{t('approvalHint')}</Alert>
                {!ready && <Alert variant="warning">{t('investigationPending')}</Alert>}
                <Select
                  label={t('decision')}
                  options={[
                    { value: 'REJECT', label: t('reject') },
                    {
                      value: 'APPROVE',
                      label: t('approve'),
                      disabled: claim.responsibility === 'SELLER',
                    },
                  ]}
                  {...form.register('decision')}
                />
              </>
            )}
            <label className="block text-sm font-medium">
              {t('reviewNote')}
              <textarea
                rows={3}
                maxLength={2000}
                className="mt-2 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3"
                {...form.register('note')}
              />
            </label>
            {form.formState.errors.note && (
              <p role="alert" className="text-sm text-[var(--sc-error)]">
                {t('noteLength')}
              </p>
            )}
            <Button type="submit" isLoading={busy} disabled={mode === 'decide' && !ready}>
              {t(mode === 'investigate' ? 'saveInvestigation' : 'submitDecision')}
            </Button>
          </fieldset>
          {mode === 'investigate' && summary && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || Boolean(pending)}
              onClick={() => {
                form.reset(defaults);
                setError('');
                setEditing(false);
              }}
            >
              {t('cancelInvestigationEdit')}
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
