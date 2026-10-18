import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import { serviceTariffApi } from '../api/serviceTariffApi';
import { serviceTariffCommandSchema, type ServiceTariff } from '../schemas/serviceTariffSchema';

import type { z } from 'zod';

export function ServiceTariffCommand({
  row,
  mode,
  onClose,
  onSaved,
}: {
  row: ServiceTariff;
  mode: 'publish' | 'close';
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('ServiceTariffs');
  const abort = useRef(new AbortController());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => controller.abort();
  }, []);
  const form = useForm<z.infer<typeof serviceTariffCommandSchema>>({
    resolver: zodResolver(serviceTariffCommandSchema),
    defaultValues: { reason: '', effectiveTo: '' },
  });
  const submit = form.handleSubmit(async (input) => {
    if (
      mode === 'close' &&
      (!input.effectiveTo ||
        new Date(input.effectiveTo) <= new Date() ||
        new Date(input.effectiveTo) <= new Date(row.effectiveFrom))
    ) {
      form.setError('effectiveTo', { message: 'invalid' });
      return;
    }
    setError(null);
    try {
      if (mode === 'publish') {
        await serviceTariffApi.publish(row, input.reason, abort.current.signal);
      } else {
        await serviceTariffApi.close(row, input.effectiveTo, input.reason, abort.current.signal);
      }
      if (!abort.current.signal.aborted) onSaved();
    } catch (failure) {
      if (!abort.current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('saveError'));
      }
    }
  });
  return (
    <Modal
      isOpen
      title={t(mode)}
      onClose={() => {
        if (!form.formState.isSubmitting) onClose();
      }}
      width="520px"
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">
          {t(mode === 'publish' ? 'publishConfirm' : 'closeHelp', {
            code: row.code,
            version: row.versionNo,
          })}
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        {mode === 'close' && (
          <Input
            label={t('toUtc')}
            required
            error={form.formState.errors.effectiveTo ? t('invalid') : undefined}
            {...form.register('effectiveTo')}
          />
        )}
        <Input
          label={t('reason')}
          required
          error={form.formState.errors.reason ? t('invalid') : undefined}
          {...form.register('reason')}
        />
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={form.formState.isSubmitting}
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            {t(mode)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
