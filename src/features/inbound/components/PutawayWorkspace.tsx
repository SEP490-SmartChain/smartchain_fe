import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Card, CardContent, Input, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { PutawayBinOverridePanel } from './PutawayBinOverridePanel';
import { RelocationWorkspace } from './RelocationWorkspace';
import {
  putawayApi,
  putawayConfirmationSchema,
  type PutawayTask,
  type PutawayConfirmation,
  type PutawayAssignment,
} from '../api/putawayApi';
import { receivingApi, type ReceivingWarehouse } from '../api/receivingApi';
type User = ReturnType<typeof useAuthStore.getState>['user'];
interface Scope {
  owner: User;
  warehouse: string;
  items: PutawayTask[];
  cursor: string | null;
  staff: { id: string; fullName: string }[];
}
export function PutawayWorkspace() {
  const t = useTranslations('Putaway'),
    user = useAuthStore((s) => s.user),
    { can } = useAccess();
  const [directory, setDirectory] = useState<{ owner: User; items: ReceivingWarehouse[] } | null>(
      null,
    ),
    [warehouse, setWarehouse] = useState(''),
    [page, setPage] = useState<Scope | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<PutawayTask | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [taskLocked, setTaskLocked] = useState(false),
    [relocationLocked, setRelocationLocked] = useState(false),
    [overrideLocked, setOverrideLocked] = useState(false);
  const locked = taskLocked || relocationLocked || overrideLocked;
  const manager = can('warehouse.asn.review'),
    warehouses = directory?.owner === user ? directory.items : [],
    current = warehouses.some((w) => w.id === warehouse) ? warehouse : '',
    visible = page?.owner === user && page.warehouse === current ? page : null;
  useEffect(() => {
    const c = new AbortController();
    setDirectory(null);
    setWarehouse('');
    setPage(null);
    setSelected(null);
    setError('');
    void receivingApi
      .warehouses(c.signal)
      .then((items) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setDirectory({ owner: user, items });
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [user, t]);
  useEffect(() => {
    setCursor(null);
    setSelected(null);
    setPage(null);
    setTaskLocked(false);
    setRelocationLocked(false);
    setOverrideLocked(false);
  }, [user, current]);
  useEffect(() => {
    if (!current) return;
    const c = new AbortController();
    setLoading(true);
    setSelected(null);
    void Promise.all([
      putawayApi.list(current, cursor, c.signal),
      manager ? putawayApi.staff(current, c.signal) : Promise.resolve([]),
    ])
      .then(([data, staff]) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setPage({
            owner: user,
            warehouse: current,
            items: data.items,
            cursor: data.nextCursor,
            staff,
          });
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
  }, [current, cursor, user, manager, refresh, t]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Select
            label={t('warehouse')}
            value={current}
            disabled={locked}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setRefresh((v) => v + 1)}
          disabled={loading || locked}
        >
          {t('refresh')}
        </Button>
      </div>
      {loading ? (
        <p>{t('loading')}</p>
      ) : (
        visible && (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              {visible.items.map((task) => (
                <Card key={task.id} className="min-w-0">
                  <CardContent className="space-y-3">
                    <p className="font-semibold break-words">
                      {task.sku} — {task.lotCode}
                    </p>
                    <p className="text-sm break-words">{task.productName}</p>
                    <p className="text-sm break-words">
                      {task.fromBinCode} → {task.toBinCode}
                    </p>
                    <p className="text-sm">
                      {t('taskSummary', {
                        quantity: task.qty,
                        confirmed: task.confirmedQty,
                        status: t(`status.${task.status}`),
                      })}
                    </p>
                    {(['OPEN', 'ASSIGNED'].includes(task.status) ||
                      can('warehouse.putaway.overrideBin')) && (
                      <Button variant="outline" disabled={locked} onClick={() => setSelected(task)}>
                        {t('openTask')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {visible.items.length === 0 && <p>{t('empty')}</p>}
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={!cursor || loading || locked}
                onClick={() => setCursor(null)}
              >
                {t('firstPage')}
              </Button>
              {visible.cursor && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => setCursor(visible.cursor)}
                >
                  {t('nextPage')}
                </Button>
              )}
            </div>
            {selected && visible.items.some((i) => i.id === selected.id) && (
              <>
                <PutawayTaskForm
                  key={`${current}:${selected.id}:${user?.userId}`}
                  warehouse={current}
                  task={selected}
                  staff={visible.staff}
                  manager={manager}
                  onLock={setTaskLocked}
                  disabled={relocationLocked || overrideLocked}
                  onSaved={() => {
                    setCursor(null);
                    setRefresh((v) => v + 1);
                  }}
                />
                {can('warehouse.putaway.overrideBin') && (
                  <PutawayBinOverridePanel
                    key={`override:${current}:${selected.id}:${selected.version}:${user?.userId}`}
                    warehouse={current}
                    task={selected}
                    disabled={taskLocked || relocationLocked}
                    onLock={setOverrideLocked}
                    onSaved={() => {
                      setCursor(null);
                      setRefresh((v) => v + 1);
                    }}
                  />
                )}
              </>
            )}
          </>
        )
      )}
      {current && can('warehouse.putaway.relocate') && (
        <RelocationWorkspace
          warehouse={current}
          disabled={taskLocked || overrideLocked}
          onLock={setRelocationLocked}
        />
      )}
    </div>
  );
}
function PutawayTaskForm({
  warehouse,
  task,
  staff,
  manager,
  onSaved,
  onLock,
  disabled,
}: {
  warehouse: string;
  task: PutawayTask;
  staff: { id: string; fullName: string }[];
  manager: boolean;
  onSaved: () => void;
  onLock: (locked: boolean) => void;
  disabled: boolean;
}) {
  const t = useTranslations('Putaway'),
    user = useAuthStore((s) => s.user),
    { can } = useAccess(),
    [assignee, setAssignee] = useState(task.assigneeId ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState<
      | { kind: 'ASSIGN'; input: PutawayAssignment }
      | { kind: 'CONFIRM'; input: PutawayConfirmation }
      | null
    >(null);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PutawayConfirmation>({
    resolver: zodResolver(
      putawayConfirmationSchema.refine((v) => v.qty === task.qty, { path: ['qty'] }),
    ),
    defaultValues: {
      operationKey: crypto.randomUUID(),
      expectedVersion: task.version,
      fromBinScan: '',
      toBinScan: '',
      skuScan: '',
      lotScan: '',
      qty: 0,
    },
  });
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    const g = ++generation.current;
    setAttempt(null);
    setError('');
    setBusy(false);
    return () => {
      generation.current = g + 1;
      c.abort();
    };
  }, [warehouse, task.id, user]);
  useEffect(() => {
    onLock(busy || attempt !== null);
    return () => onLock(false);
  }, [busy, attempt, onLock]);
  const confirmAllowed =
    can('warehouse.putaway.confirm') &&
    task.status === 'ASSIGNED' &&
    task.assigneeId === user?.userId;
  async function send(command: NonNullable<typeof attempt>) {
    if (disabled || busy || user !== useAuthStore.getState().user) return;
    const g = generation.current;
    setBusy(true);
    setError('');
    try {
      if (command.kind === 'ASSIGN') {
        await putawayApi.assign(warehouse, task, command.input, controller.current?.signal);
      } else {
        await putawayApi.confirm(
          warehouse,
          task,
          user?.userId ?? '',
          command.input,
          controller.current?.signal,
        );
      }
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setAttempt(null);
      toast.success(t(command.kind === 'ASSIGN' ? 'assignmentSuccess' : 'confirmSuccess'));
      onSaved();
    } catch (e: unknown) {
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setError(e instanceof ApiError ? e.message : t('saveError'));
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        setAttempt(null);
        toast.error(e.message);
        onSaved();
      } else setAttempt(command);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="break-words text-lg font-semibold">
          {t('taskTitle', { sku: task.sku, lot: task.lotCode })}
        </h2>
        <p className="break-words text-sm">
          {t('expected', { from: task.fromBinCode, to: task.toBinCode, qty: task.qty })}
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        {attempt ? (
          <>
            <Alert variant="warning">{t('unknown')}</Alert>
            <Button disabled={busy || disabled} onClick={() => void send(attempt)}>
              {t('retry')}
            </Button>
          </>
        ) : (
          <>
            {can('warehouse.putaway.assign') &&
              ['OPEN', 'ASSIGNED'].includes(task.status) &&
              (manager || task.status === 'OPEN') && (
                <div className="flex flex-wrap items-end gap-3">
                  {manager && (
                    <div className="min-w-0 flex-1">
                      <Select
                        aria-required
                        label={t('assignee')}
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        options={staff.map((s) => ({ value: s.id, label: s.fullName }))}
                      />
                    </div>
                  )}
                  <Button
                    disabled={busy || disabled || (manager && !assignee)}
                    onClick={() =>
                      void send({
                        kind: 'ASSIGN',
                        input: {
                          operationKey: crypto.randomUUID(),
                          expectedVersion: task.version,
                          assigneeId: manager ? assignee : (user?.userId ?? ''),
                        },
                      })
                    }
                  >
                    {t(manager ? 'assign' : 'claim')}
                  </Button>
                </div>
              )}
            {confirmAllowed ? (
              <form
                className="space-y-4"
                onSubmit={handleSubmit((input) => void send({ kind: 'CONFIRM', input }))}
              >
                <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2" disabled={busy || disabled}>
                  <Input
                    label={t('fromScan')}
                    required
                    {...register('fromBinScan')}
                    error={errors.fromBinScan ? t('scanRequired') : undefined}
                  />
                  <Input
                    label={t('toScan')}
                    required
                    {...register('toBinScan')}
                    error={errors.toBinScan ? t('scanRequired') : undefined}
                  />
                  <Input
                    label={t('skuScan')}
                    required
                    {...register('skuScan')}
                    error={errors.skuScan ? t('scanRequired') : undefined}
                  />
                  <Input
                    label={t('lotScan')}
                    required
                    {...register('lotScan')}
                    error={errors.lotScan ? t('scanRequired') : undefined}
                  />
                  <Input
                    label={t('quantity')}
                    required
                    type="number"
                    min={1}
                    max={task.qty}
                    {...register('qty', { valueAsNumber: true })}
                    error={errors.qty ? t('quantityRequired') : undefined}
                  />
                </fieldset>
                <Button type="submit" disabled={busy || disabled}>
                  {t('confirm')}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-[var(--sc-text-secondary)]">
                {t(manager ? 'managerReadOnly' : 'claimFirst')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
