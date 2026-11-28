import { useEffect, useRef, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';

import { Alert, Button, Card, CardHeader, Input } from '@/components/Common';
import { ApiError } from '@/services/apiClient';

import { freightMarkupApi } from '../api/freightMarkupApi';
import { freightMarkupFormSchema, type FreightMarkup } from '../schemas/freightMarkupSchema';

interface FreightMarkupSettingsProps {
  onLoaded: (value: FreightMarkup | null) => void;
}

export function FreightMarkupSettings({ onLoaded }: FreightMarkupSettingsProps) {
  const t = useTranslations('RateIntelligence');
  const request = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [markup, setMarkup] = useState<FreightMarkup | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<'markupLoadError' | 'markupSaveError' | 'markupStale' | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const { control, register, reset, handleSubmit, formState } = useForm({
    resolver: zodResolver(freightMarkupFormSchema),
    defaultValues: { markupVnd: '' },
  });
  const { errors, isDirty, dirtyFields, isSubmitting } = formState;
  const draft = useWatch({ control, name: 'markupVnd' });
  // Subscribe to field dirtiness so a reload can preserve an unconfirmed edit.
  const canSave =
    isDirty &&
    dirtyFields.markupVnd &&
    !loading &&
    !error &&
    markup &&
    draft.trim() !== markup.markupVnd;

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setSaved(false);
    void freightMarkupApi
      .read(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setMarkup(value);
        onLoaded(value);
        reset({ markupVnd: value.markupVnd }, { keepDirtyValues: true });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('markupLoadError');
        onLoaded(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onLoaded, reload, reset]);

  const handleSave = handleSubmit(async ({ markupVnd }) => {
    const signal = request.current?.signal;
    if (!markup || !canSave || saving.current || !signal || signal.aborted) return;
    saving.current = true;
    try {
      const value = await freightMarkupApi.save(
        { markupVnd, expectedVersion: markup.version },
        signal,
      );
      if (signal.aborted) return;
      setMarkup(value);
      onLoaded(value);
      reset({ markupVnd: value.markupVnd });
      setSaved(true);
    } catch (caught) {
      if (signal.aborted) return;
      setError(
        caught instanceof ApiError && caught.status === 409 ? 'markupStale' : 'markupSaveError',
      );
      onLoaded(null);
    } finally {
      saving.current = false;
    }
  });

  return (
    <Card>
      <CardHeader title={t('markupTitle')} description={t('markupDescription')} />
      {error && (
        <Alert variant="error" className="mb-3">
          {t(error)}
          <Button type="button" variant="ghost" onClick={() => setReload((value) => value + 1)}>
            {t('reload')}
          </Button>
        </Alert>
      )}
      {saved && !isDirty && (
        <Alert className="mb-3" variant="success" role="status">
          {t('markupSaved')}
        </Alert>
      )}
      {loading ? (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      ) : (
        markup && (
          <form
            className="flex flex-wrap items-start gap-3"
            onSubmit={handleSave}
            onChange={() => setSaved(false)}
          >
            <div className="w-full sm:max-w-xs">
              <Input
                label={t('markupField')}
                inputMode="numeric"
                disabled={isSubmitting}
                error={errors.markupVnd ? t('markupInvalid') : undefined}
                {...register('markupVnd')}
              />
            </div>
            <Button className="sm:mt-6" type="submit" disabled={!canSave} isLoading={isSubmitting}>
              {t('markupSave')}
            </Button>
          </form>
        )
      )}
    </Card>
  );
}
