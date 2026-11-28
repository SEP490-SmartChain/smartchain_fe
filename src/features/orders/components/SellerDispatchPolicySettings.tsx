import { useEffect, useId, useRef, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';

import { Alert, Button, Card, Switch } from '@/components/Common';
import { ApiError } from '@/services/apiClient';

import {
  sellerDispatchPolicyApi,
  sellerDispatchPolicyFormSchema,
  type SellerDispatchPolicy,
} from '../api/sellerDispatchPolicyApi';

export function SellerDispatchPolicySettings() {
  const t = useTranslations('OrderPolicy');
  const hintId = useId();
  const request = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [policy, setPolicy] = useState<SellerDispatchPolicy | null>(null);
  const [error, setError] = useState<'loadError' | 'dispatchSaveError' | 'dispatchStale' | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const { control, register, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(sellerDispatchPolicyFormSchema),
    defaultValues: { autoConfirm: true },
  });
  const { isDirty, isSubmitting, dirtyFields } = formState;
  const draft = useWatch({ control, name: 'autoConfirm' });
  // Subscribe to field dirtiness so a reload can preserve an unconfirmed edit.
  const canSave =
    isDirty &&
    dirtyFields.autoConfirm &&
    !loading &&
    !error &&
    policy &&
    draft !== policy.autoConfirm;

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setSaved(false);
    void sellerDispatchPolicyApi
      .read(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setPolicy(value);
        reset({ autoConfirm: value.autoConfirm }, { keepDirtyValues: true });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('loadError');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, reset]);

  const handleSave = handleSubmit(async ({ autoConfirm }) => {
    const signal = request.current?.signal;
    if (!policy || !canSave || saving.current || !signal || signal.aborted) return;
    saving.current = true;
    try {
      const updated = await sellerDispatchPolicyApi.save(
        { autoConfirm, expectedVersion: policy.version },
        signal,
      );
      if (signal.aborted) return;
      setPolicy(updated);
      reset({ autoConfirm: updated.autoConfirm });
      setSaved(true);
    } catch (caught) {
      if (!signal.aborted) {
        setError(
          caught instanceof ApiError && caught.status === 409
            ? 'dispatchStale'
            : 'dispatchSaveError',
        );
      }
    } finally {
      saving.current = false;
    }
  });

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t('dispatchTitle')}</h2>
      {error && (
        <Alert variant="error">
          {t(error)}
          <Button type="button" variant="ghost" onClick={() => setReload((value) => value + 1)}>
            {t('reloadPolicy')}
          </Button>
        </Alert>
      )}
      {saved && !isDirty && (
        <Alert variant="success" role="status">
          {t('dispatchSaved')}
        </Alert>
      )}
      {loading ? (
        <p role="status">{t('loading')}</p>
      ) : (
        policy && (
          <form className="space-y-4" onSubmit={handleSave} onChange={() => setSaved(false)}>
            <div className="space-y-2">
              <Switch
                label={t('dispatchAutomatic')}
                role="switch"
                aria-describedby={hintId}
                disabled={isSubmitting}
                {...register('autoConfirm')}
              />
              <p id={hintId} className="text-sm text-[var(--sc-text-secondary)]">
                {t('dispatchHint')}
              </p>
            </div>
            <Button type="submit" disabled={!canSave} isLoading={isSubmitting}>
              {t('save')}
            </Button>
          </form>
        )
      )}
    </Card>
  );
}
