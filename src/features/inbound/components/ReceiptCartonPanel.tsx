import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, Card, Input } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './ReceiptWorkspace.module.css';
import {
  cartonFormSchema,
  receiptCartonApi,
  type CartonFormValues,
  type CartonInput,
  type CartonState,
} from '../api/receiptCartonApi';

interface Props {
  warehouseId: string;
  asnId: string;
  receiptId: string;
  receiptVersion: number;
  canWrite: boolean;
  onPendingChange: (key: string, locked: boolean) => void;
  onSaved: () => void;
}

export function ReceiptCartonPanel({
  warehouseId,
  asnId,
  receiptId,
  receiptVersion,
  canWrite,
  onPendingChange,
  onSaved,
}: Props) {
  const t = useTranslations('ReceiptCartons');
  const locale = useLocale();
  const owner = useAuthStore((s) => s.user);
  const [state, setState] = useState<CartonState | null>(null);
  const [attempt, setAttempt] = useState<CartonInput | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(''),
    [commandError, setCommandError] = useState(''),
    [success, setSuccess] = useState(false),
    [refresh, setRefresh] = useState(0);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null),
    submitting = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CartonFormValues>({
    resolver: zodResolver(cartonFormSchema),
    defaultValues: { actualCartonCount: '', reason: '' },
  });
  const current = useCallback(
    (version: number) => version === generation.current && owner === useAuthStore.getState().user,
    [owner],
  );
  useEffect(() => {
    onPendingChange(`cartons:${asnId}`, busy || attempt !== null);
    return () => onPendingChange(`cartons:${asnId}`, false);
  }, [onPendingChange, asnId, busy, attempt]);
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    active.current = controller;
    submitting.current = false;
    setState(null);
    setAttempt(null);
    setBusy(false);
    setError('');
    setCommandError('');
    setSuccess(false);
    reset({ actualCartonCount: '', reason: '' });
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, receiptId, owner, reset]);
  useEffect(() => {
    const version = generation.current,
      controller = new AbortController();
    setLoading(true);
    void receiptCartonApi
      .get(warehouseId, asnId, receiptId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && current(version)) {
          setState(result);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && current(version)) {
          setState(null);
          setError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current(version)) setLoading(false);
      });
    return () => controller.abort();
  }, [warehouseId, asnId, receiptId, receiptVersion, owner, refresh, current, t]);
  async function send(command: CartonInput) {
    if (
      !canWrite ||
      submitting.current ||
      (!attempt && (!state?.canConfirm || state.receiptVersion !== receiptVersion))
    ) {
      return;
    }
    const version = generation.current;
    if (!current(version)) return;
    submitting.current = true;
    setBusy(true);
    setCommandError('');
    setSuccess(false);
    try {
      const confirmation = await receiptCartonApi.confirm(
        warehouseId,
        asnId,
        command,
        active.current?.signal,
      );
      if (!current(version)) return;
      setAttempt(null);
      setState((previous) => (previous ? { ...previous, canConfirm: false, confirmation } : null));
      setSuccess(true);
      reset({ actualCartonCount: '', reason: '' });
      onSaved();
    } catch (reason: unknown) {
      if (!current(version)) return;
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        setState(null);
        setCommandError(reason.message);
        setRefresh((v) => v + 1);
      } else {
        setAttempt(command);
        setCommandError(t('uncertain'));
      }
    } finally {
      if (current(version)) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <Card padding="none" className={styles.panel}>
      <div className={styles.actionPanelHeader}>
        <h2 className={styles.panelTitle}>{t('title')}</h2>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.copy}>{t('description')}</p>
        {loading && <p role="status">{t('loading')}</p>}
        {error && <Alert variant="error" title={error} />}
        {commandError && <Alert variant="error" title={commandError} />}
        {success && <Alert variant="success" title={t('saved')} />}
        {state?.confirmation && (
          <dl className={styles.record}>
            <dt>{t('count')}</dt>
            <dd>{state.confirmation.actualCartonCount.toLocaleString(locale)}</dd>
            <dt>{t('reason')}</dt>
            <dd className="[overflow-wrap:anywhere]">{state.confirmation.reason}</dd>
            <dt>{t('confirmedAt')}</dt>
            <dd>{new Date(state.confirmation.confirmedAt).toLocaleString(locale)}</dd>
          </dl>
        )}
        {attempt ? (
          <Button type="button" disabled={busy || !canWrite} onClick={() => void send(attempt)}>
            {t('retry')}
          </Button>
        ) : state?.canConfirm && canWrite ? (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={handleSubmit((values) =>
              send({
                operationKey: createUuid(),
                expectedVersion: state.receiptVersion,
                actualCartonCount: Number(values.actualCartonCount),
                reason: values.reason,
              }),
            )}
          >
            <Input
              label={t('count')}
              required
              inputMode="numeric"
              disabled={busy || loading}
              {...register('actualCartonCount')}
              error={errors.actualCartonCount ? t('countInvalid') : undefined}
              helperText={t('countHelp')}
            />
            <Input
              label={t('reason')}
              required
              maxLength={1000}
              disabled={busy || loading}
              {...register('reason')}
              error={errors.reason ? t('reasonInvalid') : undefined}
            />
            <Button type="submit" disabled={busy || loading}>
              {t(busy ? 'saving' : 'confirm')}
            </Button>
          </form>
        ) : (
          !state?.confirmation && !loading && <Alert variant="info" title={t('managerRequired')} />
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy || loading || attempt !== null}
          onClick={() => setRefresh((v) => v + 1)}
        >
          {t('reload')}
        </Button>
      </div>
    </Card>
  );
}
