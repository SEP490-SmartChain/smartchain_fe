import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { type z } from 'zod';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  PageHeader,
  Select,
} from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  pickingApi,
  type PickPending,
  type PickWave,
  type PickDetail,
  type PickLine,
} from '../api/pickingApi';
import { pickScanSchema, pickWaveFormSchema } from '../schemas/pickingSchema';

export function PickingWorkspace() {
  const user = useAuthStore((s) => s.user),
    revision = useAuthStore((s) => s.revision);
  return <PickingScope key={`${user?.userId}:${revision}`} />;
}
function PickingScope() {
  const locale = useLocale();
  const t = useTranslations('Picking'),
    { can } = useAccess();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]),
    [warehouse, setWarehouse] = useState(''),
    [waves, setWaves] = useState<PickWave[]>([]),
    [waveId, setWaveId] = useState(''),
    [detail, setDetail] = useState<PickDetail | null>(null),
    [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0),
    [pending, setPending] = useState<PickPending | null>(null),
    [waveRequest, setWaveRequest] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    abort = useRef(new AbortController());
  const manager = can('warehouse.picking.manage');
  useEffect(() => {
    mounted.current = true;
    abort.current = new AbortController();
    return () => {
      mounted.current = false;
      abort.current.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    void pickingApi
      .warehouses(c.signal)
      .then((data) => {
        if (!c.signal.aborted) {
          setWarehouses(data);
          if (data.length === 1 && data[0]) setWarehouse(data[0].id);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [t]);
  useEffect(() => {
    setWaveId('');
    setDetail(null);
    setWaves([]);
    setCursor(null);
    setPending(null);
    setWaveRequest(null);
    setNotice('');
    setError('');
  }, [warehouse]);
  useEffect(() => {
    if (!warehouse) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      pickingApi.waves(warehouse, cursor, c.signal),
      manager ? pickingApi.staff(warehouse, c.signal) : Promise.resolve([]),
    ])
      .then(([page, options]) => {
        if (!c.signal.aborted) {
          setWaves(page.items);
          setNext(page.nextCursor);
          setStaff(options);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [warehouse, cursor, manager, refresh, t]);
  useEffect(() => {
    setDetail(null);
    if (!warehouse || !waveId) return;
    const c = new AbortController();
    void pickingApi
      .detail(warehouse, waveId, c.signal)
      .then((data) => {
        if (!c.signal.aborted) setDetail(data);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [warehouse, waveId, refresh, t]);
  useEffect(() => {
    if (!waveRequest || !warehouse) return;
    const c = new AbortController();
    let running = false;
    const read = async () => {
      if (running) return;
      running = true;
      try {
        const result = await pickingApi.requestStatus(warehouse, waveRequest, c.signal);
        if (c.signal.aborted) return;
        if (result.status === 'COMPLETED' && result.waveId) {
          setWaveRequest(null);
          setWaveId(result.waveId);
          setNotice(t('confirmed'));
          setRefresh((x) => x + 1);
        } else if (result.status === 'FAILED') {
          setWaveRequest(null);
          setError(t('waveFailed'));
        }
      } catch {
        if (!c.signal.aborted) setError(t('loadError'));
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => {
      void read();
    }, 2000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [warehouse, waveRequest, t]);
  async function execute(command: PickPending) {
    if (busy) return;
    setBusy(true);
    setPending(command);
    setError('');
    setNotice('');
    try {
      const result = await pickingApi.execute(warehouse, command, abort.current.signal);
      if (!mounted.current) return;
      setPending(null);
      if (result.status === 'PROCESSING' && result.requestId) {
        setWaveRequest(result.requestId);
        setNotice(t('waveProcessing'));
      } else setNotice(t('confirmed'));
      setRefresh((x) => x + 1);
      if (result.waveId) setWaveId(result.waveId);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        setPending(null);
        const code = cause.code.split('.').at(-1) ?? '';
        setError(
          code === 'ORDER_BLOCKED'
            ? t('parentBlocked')
            : t.has(`errors.${code}`)
              ? t(`errors.${code}`)
              : t('rejected'),
        );
      } else setError(t('unknown'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Select
            label={t('warehouse')}
            value={warehouse}
            disabled={!!pending || busy}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
            onChange={(e) => setWarehouse(e.target.value)}
            placeholder={t('chooseWarehouse')}
          />
        </div>
        <Button
          variant="outline"
          disabled={!!pending || busy || !!waveRequest}
          onClick={() => setRefresh((x) => x + 1)}
        >
          {t('reload')}
        </Button>
      </div>
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" role="status">
          {notice}
        </Alert>
      )}
      {pending && !busy && (
        <Alert variant="warning">
          <p>{t('unknown')}</p>
          <Button onClick={() => void execute(pending)}>{t('retrySame')}</Button>
        </Alert>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && !warehouses.length && <Alert>{t('noWarehouse')}</Alert>}
      {warehouse && manager && (
        <WaveForm
          staff={staff}
          disabled={!!pending || busy || !!waveRequest}
          onSubmit={(values) =>
            void execute({
              path: 'waves',
              payload: {
                ...values,
                cutoffAt: new Date(values.cutoffAt).toISOString(),
                clientScanId: createUuid(),
              },
            })
          }
        />
      )}
      {warehouse && (
        <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardContent>
              <h2 className="mb-3 font-semibold">{t('waves')}</h2>
              {!loading && !waves.length && <p>{t('empty')}</p>}
              <div className="space-y-2">
                {waves.map((w) => (
                  <Button
                    key={w.id}
                    variant={w.id === waveId ? 'primary' : 'outline'}
                    className="w-full min-h-14 justify-between"
                    disabled={!!pending || busy}
                    onClick={() => setWaveId(w.id)}
                  >
                    <span className="truncate">
                      {new Date(w.cutoffAt).toLocaleString(locale, {
                        timeZone: 'Asia/Ho_Chi_Minh',
                      })}
                    </span>
                    <span>{t(`statuses.${w.status}`)}</span>
                  </Button>
                ))}
              </div>
              {next && (
                <Button
                  variant="ghost"
                  disabled={!!pending || busy}
                  onClick={() => setCursor(next)}
                >
                  {t('next')}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {!waveId ? (
                <p>{t('chooseWave')}</p>
              ) : !detail ? (
                <p role="status">{t('loading')}</p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold">{t('pickList')}</h2>
                    <Badge
                      label={t(`statuses.${detail.status}`)}
                      status={detail.status === 'EXCEPTION' ? 'warning' : 'info'}
                    />
                  </div>
                  <p className="mb-4 text-sm text-[var(--sc-text-secondary)]">{t('scanHint')}</p>
                  <div className="space-y-3">
                    {detail.lines.map((line) => (
                      <PickLineCard
                        warehouseId={warehouse}
                        key={`${line.id}:${line.version}`}
                        line={line}
                        disabled={!!pending || busy}
                        manager={manager}
                        execute={execute}
                        canConfirm={
                          can('warehouse.picking.confirm') &&
                          line.id ===
                            detail.lines.find((item) => item.remainingQty > 0 && !item.shortage)?.id
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
function WaveForm({
  staff,
  disabled,
  onSubmit,
}: {
  staff: { id: string; fullName: string }[];
  disabled: boolean;
  onSubmit: (v: z.infer<typeof pickWaveFormSchema>) => void;
}) {
  const t = useTranslations('Picking');
  const f = useForm<z.infer<typeof pickWaveFormSchema>>({
    resolver: zodResolver(pickWaveFormSchema),
    defaultValues: { assigneeId: '', cutoffAt: '' },
  });
  return (
    <Card>
      <CardContent>
        <form onSubmit={f.handleSubmit(onSubmit)} className="grid items-end gap-3 md:grid-cols-3">
          <Input
            type="datetime-local"
            label={t('cutoff')}
            required
            {...f.register('cutoffAt')}
            disabled={disabled}
            error={f.formState.errors.cutoffAt ? t('required') : undefined}
          />
          <Select
            label={t('assignee')}
            required
            options={staff.map((s) => ({ value: s.id, label: s.fullName }))}
            {...f.register('assigneeId')}
            disabled={disabled}
            error={f.formState.errors.assigneeId ? t('required') : undefined}
          />
          <Button type="submit" disabled={disabled}>
            {t('createWave')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
function PickLineCard({
  line,
  disabled,
  canConfirm,
  execute,
}: {
  warehouseId: string;
  line: PickLine;
  disabled: boolean;
  manager: boolean;
  canConfirm: boolean;
  execute: (c: PickPending) => Promise<void>;
}) {
  const t = useTranslations('Picking');
  const f = useForm<z.infer<typeof pickScanSchema>>({
    resolver: zodResolver(pickScanSchema),
    defaultValues: { qty: 1 },
  });
  useEffect(() => {
    if (canConfirm && !disabled && line.remainingQty > 0) f.setFocus('binScan');
  }, [f, canConfirm, disabled, line.remainingQty]);
  return (
    <section className="rounded-xl border border-[var(--sc-border-default)] p-4">
      <h3>
        {line.productName} · {line.sku}
      </h3>
      <p>{t('progress', { picked: line.pickedQty, remaining: line.remainingQty })}</p>
      <p>
        {t('bin')}: {line.binCode} · {t('lot')}: {line.lotCode}
      </p>
      {line.remainingQty > 0 && canConfirm && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={f.handleSubmit((v) =>
            execute({
              path: `pick-lines/${line.id}/confirm`,
              payload: { ...v, expectedVersion: line.version, clientScanId: createUuid() },
            }),
          )}
        >
          {(['binScan', 'skuScan', 'lotScan'] as const).map((name) => (
            <Input key={name} label={t(name)} {...f.register(name)} required disabled={disabled} />
          ))}
          <Input
            type="number"
            label={t('qty')}
            {...f.register('qty', { valueAsNumber: true })}
            min={1}
            max={line.remainingQty}
            required
            disabled={disabled}
          />
          <Button type="submit" disabled={disabled}>
            {t('confirmScan')}
          </Button>
        </form>
      )}
    </section>
  );
}
