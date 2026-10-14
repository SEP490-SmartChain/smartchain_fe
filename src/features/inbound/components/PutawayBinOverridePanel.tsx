import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Card, CardContent, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  putawayBinOverrideApi,
  putawayBinOverrideSchema,
  type PutawayBinOverrideInput,
  type PutawayBinOverrideResult,
} from '../api/putawayBinOverrideApi';

import type { PutawayTask } from '../api/putawayApi';

export function PutawayBinOverridePanel({
  warehouse,
  task,
  disabled,
  onLock,
  onSaved,
}: {
  warehouse: string;
  task: PutawayTask;
  disabled: boolean;
  onLock: (locked: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('PutawayBinOverride'),
    user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [bins, setBins] = useState<{ id: string; code: string }[]>([]),
    [history, setHistory] = useState<PutawayBinOverrideResult[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState<PutawayBinOverrideInput | null>(null);
  const eligible = ['OPEN', 'ASSIGNED'].includes(task.status) && task.confirmedQty === 0;
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<PutawayBinOverrideInput>({
    resolver: zodResolver(putawayBinOverrideSchema),
    defaultValues: {
      operationKey: crypto.randomUUID(),
      expectedVersion: task.version,
      toBinId: '',
      reason: '',
    },
  });
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    const g = ++generation.current;
    return () => {
      generation.current = g + 1;
      c.abort();
    };
  }, [warehouse, task.id, user]);
  useEffect(() => {
    onLock(busy || attempt !== null);
    return () => onLock(false);
  }, [onLock, busy, attempt]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setBins([]);
    resetField('toBinId');
    void Promise.all([
      eligible
        ? putawayBinOverrideApi.options(warehouse, task, query, c.signal)
        : Promise.resolve({ items: [], moreBins: false }),
      putawayBinOverrideApi.history(warehouse, task.id, c.signal),
    ])
      .then(([options, rows]) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setBins(options.items);
          setMore(options.moreBins);
          setHistory(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof ApiError ? e.message : t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [warehouse, task, query, user, t, resetField, eligible]);
  async function send(command: PutawayBinOverrideInput) {
    if (!eligible || disabled || busy || user !== useAuthStore.getState().user) return;
    const g = generation.current;
    setBusy(true);
    setError('');
    try {
      await putawayBinOverrideApi.overrideBin(
        warehouse,
        task,
        user?.userId ?? '',
        command,
        controller.current?.signal,
      );
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setAttempt(null);
      toast.success(t('success'));
      onSaved();
    } catch (e) {
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setError(e instanceof ApiError ? e.message : t('saveError'));
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        setAttempt(null);
        onSaved();
      } else setAttempt(command);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  const locked = disabled || busy || attempt !== null;
  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        {error && <Alert variant="error">{error}</Alert>}
        {!eligible ? (
          <p className="text-sm">{t('completedReadOnly')}</p>
        ) : attempt ? (
          <>
            <Alert variant="warning">{t('unknown')}</Alert>
            <Button disabled={busy || disabled} onClick={() => void send(attempt)}>
              {t('retry')}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  label={t('search')}
                  value={search}
                  maxLength={64}
                  disabled={locked || loading}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={locked || loading}
                onClick={() => setQuery(search)}
              >
                {t('find')}
              </Button>
            </div>
            {loading ? (
              <p>{t('loading')}</p>
            ) : (
              <>
                {more && <Alert variant="info">{t('more')}</Alert>}
                {bins.length === 0 ? (
                  <p>{t('empty')}</p>
                ) : (
                  <form className="space-y-4" onSubmit={handleSubmit((input) => void send(input))}>
                    <fieldset disabled={locked} className="space-y-4">
                      <Select
                        label={t('bin')}
                        options={bins.map((b) => ({ value: b.id, label: b.code }))}
                        {...register('toBinId')}
                        error={errors.toBinId ? t('binRequired') : undefined}
                      />
                      <Input
                        label={t('reason')}
                        required
                        maxLength={500}
                        {...register('reason')}
                        error={errors.reason ? t('reasonRequired') : undefined}
                      />
                    </fieldset>
                    <Button type="submit" disabled={locked}>
                      {t('save')}
                    </Button>
                  </form>
                )}
              </>
            )}
          </>
        )}
        <h3 className="text-base font-semibold">{t('history')}</h3>
        {history.length === 0 ? (
          <p className="text-sm">{t('noHistory')}</p>
        ) : (
          <ul className="space-y-3">
            {history.map((row) => (
              <li
                key={row.id}
                className="space-y-1 border-t border-[var(--sc-border-default)] pt-3 text-sm break-words"
              >
                <p className="font-semibold">
                  {row.fromBinCode} → {row.toBinCode}
                </p>
                <p>{row.reason}</p>
                <p>
                  {t('audit', {
                    actor: row.actorId === user?.userId ? user.fullName : row.actorId,
                    date: new Date(row.createdAt).toLocaleString(),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
