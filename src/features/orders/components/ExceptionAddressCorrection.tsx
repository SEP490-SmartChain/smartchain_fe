import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';

import {
  exceptionCorrectionFormSchema,
  operationsExceptionApi,
  type ExceptionCorrectionSource,
} from '../api/operationsExceptionApi';
import {
  beginExceptionCommand,
  completeExceptionCommand,
  pendingExceptionCommand,
} from '../lib/exceptionPending';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import { orderScope } from '../lib/orderScope';

import type { z } from 'zod';

type Values = z.infer<typeof exceptionCorrectionFormSchema>;
export function ExceptionAddressCorrection({
  id,
  onCompleted,
  onCancel,
}: {
  id: string;
  onCompleted: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('OperationsExceptions');
  const pending = pendingExceptionCommand(id);
  const scope = orderScope();
  const [source, setSource] = useState<ExceptionCorrectionSource | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const alive = useRef(true),
    request = useRef<AbortController | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(exceptionCorrectionFormSchema),
    defaultValues: {
      recipientAddress: pending?.correction?.recipientAddress ?? '',
      toProvinceCode: pending?.correction?.toProvinceCode ?? '',
      toWardCode: pending?.correction?.toWardCode ?? '',
      note: pending?.note ?? '',
    },
  });
  const province = form.watch('toProvinceCode');
  const { reset, getValues } = form;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (pendingExceptionCommand(id)?.correction) return;
    const controller = new AbortController();
    setSource(null);
    void operationsExceptionApi
      .correctionSource(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && orderScope() === scope) {
          setSource(data);
          reset({
            recipientAddress: data.recipientAddress,
            toProvinceCode: data.toProvinceCode,
            toWardCode: data.toWardCode,
            note: getValues('note'),
          });
          setError((current) => (['stale', 'rejected'].includes(current) ? current : ''));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && orderScope() === scope) setError('correctionLoadError');
      });
    return () => controller.abort();
  }, [id, scope, reload, reset, getValues]);
  async function send(values?: Values) {
    if (busy || (!pending?.correction && (!values || !source))) return;
    const command = pending?.correction
      ? pending
      : values && source
        ? beginExceptionCommand(id, {
            kind: 'RETRY',
            expectedVersion: source.exceptionVersion,
            note: values.note,
            correction: {
              expectedOrderVersion: source.orderVersion,
              recipientAddress: values.recipientAddress,
              toProvinceCode: values.toProvinceCode,
              toWardCode: values.toWardCode,
            },
          })
        : null;
    if (!command) return;
    setBusy(true);
    setError('');
    request.current = new AbortController();
    try {
      await operationsExceptionApi.command(id, command, request.current.signal);
      if (alive.current && orderScope() === scope) {
        completeExceptionCommand(id);
        onCompleted();
      }
    } catch (caught) {
      if (!alive.current || orderScope() !== scope) return;
      if (isRejectedOperation(caught)) {
        completeExceptionCommand(id);
        setError(
          caught instanceof ApiError && caught.code.endsWith('STALE_VERSION')
            ? 'stale'
            : 'rejected',
        );
        setReload((value) => value + 1);
      } else setError('uncertain');
    } finally {
      if (alive.current && orderScope() === scope) setBusy(false);
    }
  }
  const provinceRegistration = form.register('toProvinceCode');
  return (
    <section className="space-y-3" aria-label={t('correctAddress')}>
      <h3 className="font-semibold">{t('correctAddress')}</h3>
      <Alert variant="info">{t('correctionHint')}</Alert>
      {error && (
        <Alert variant="error" role="alert">
          {t(error)}
        </Alert>
      )}
      {pending?.correction ? (
        <>
          <Alert variant="warning">{t('pendingHint')}</Alert>
          <p className="break-words whitespace-pre-wrap">{pending.correction.recipientAddress}</p>
          <Button disabled={busy} onClick={() => void send()}>
            {busy ? t('saving') : t('checkPending')}
          </Button>
        </>
      ) : source ? (
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => send(values))}>
          <Select
            label={t('province')}
            disabled={busy}
            options={source.locations
              .filter((row) => row.type === 'PROVINCE')
              .map((row) => ({ value: row.code, label: row.name }))}
            {...provinceRegistration}
            onChange={(event) => {
              void provinceRegistration.onChange(event);
              form.setValue('toWardCode', '');
            }}
            error={form.formState.errors.toProvinceCode ? t('invalidInput') : undefined}
          />
          <Select
            label={t('ward')}
            disabled={busy}
            options={source.locations
              .filter((row) => row.type === 'WARD' && row.parentCode === province)
              .map((row) => ({ value: row.code, label: row.name }))}
            {...form.register('toWardCode')}
            error={form.formState.errors.toWardCode ? t('invalidInput') : undefined}
          />
          <Input
            label={t('recipientAddress')}
            required
            disabled={busy}
            maxLength={500}
            {...form.register('recipientAddress')}
            error={form.formState.errors.recipientAddress ? t('invalidAddress') : undefined}
          />
          <Input
            label={t('note')}
            required
            disabled={busy}
            maxLength={2000}
            {...form.register('note')}
            error={form.formState.errors.note ? t('invalidNote') : undefined}
          />
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('correctAndRetry')}
          </Button>
        </form>
      ) : !error ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
          {t('refresh')}
        </Button>
      )}
      <Button variant="outline" disabled={busy || !!pending} onClick={onCancel}>
        {t('backToInvestigation')}
      </Button>
    </section>
  );
}
