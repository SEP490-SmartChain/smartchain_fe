import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Badge, Button, Card, CardContent, Input, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { PutawayBinOverridePanel } from './PutawayBinOverridePanel';
import { PutawayPreparationPanel } from './PutawayPreparationPanel';
import { PutawayTaskCard, PutawayWaitingActions } from './PutawayWorkCards';
import { RelocationWorkspace } from './RelocationWorkspace';
import {
  putawayApi,
  putawayConfirmationSchema,
  type PutawayTask,
  type PutawayConfirmation,
  type PutawayAssignment,
  type PutawayWaitingItem,
} from '../api/putawayApi';

import type { InboundWarehouseScope } from '../types/inboundWarehouse.types';
type User = ReturnType<typeof useAuthStore.getState>['user'];
interface Scope {
  owner: User;
  warehouse: string;
  items: PutawayTask[];
  cursor: string | null;
  waiting: PutawayWaitingItem[];
  waitingCursor: string | null;
  staff: { id: string; fullName: string }[];
}
export function PutawayWorkspace({ warehouse, onNavigationLockChange }: InboundWarehouseScope) {
  const t = useTranslations('Putaway'),
    locale = useLocale(),
    user = useAuthStore((s) => s.user),
    { can } = useAccess();
  const [page, setPage] = useState<Scope | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [waitingCursor, setWaitingCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<PutawayTask | null>(null),
    [preparation, setPreparation] = useState<PutawayWaitingItem | null>(null),
    [preparationLocked, setPreparationLocked] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [taskLocked, setTaskLocked] = useState(false),
    [relocationLocked, setRelocationLocked] = useState(false),
    [overrideLocked, setOverrideLocked] = useState(false);
  const locked = taskLocked || relocationLocked || overrideLocked || preparationLocked;
  const reload = useCallback(() => {
    setCursor(null);
    setRefresh((value) => value + 1);
  }, []);
  const manager = can('warehouse.asn.review'),
    current = warehouse.id,
    visible = page?.owner === user && page.warehouse === current ? page : null;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  useEffect(() => {
    onNavigationLockChange(locked);
    return () => onNavigationLockChange(false);
  }, [locked, onNavigationLockChange]);
  useEffect(() => {
    setCursor(null);
    setWaitingCursor(null);
    setSelected(null);
    setPreparation(null);
    setPreparationLocked(false);
    setPage(null);
    setTaskLocked(false);
    setRelocationLocked(false);
    setOverrideLocked(false);
  }, [user, current]);
  useEffect(() => {
    if (preparationLocked) {
      setLoading(false);
      return;
    }
    if (!current) return;
    const c = new AbortController();
    setLoading(true);
    setSelected(null);
    void Promise.all([
      putawayApi.list(current, cursor, c.signal),
      manager ? putawayApi.staff(current, c.signal) : Promise.resolve([]),
      putawayApi.waiting(current, waitingCursor, c.signal),
    ])
      .then(([data, staff, waiting]) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setPage({
            owner: user,
            warehouse: current,
            items: data.items,
            cursor: data.nextCursor,
            waiting: waiting.items,
            waitingCursor: waiting.nextCursor,
            staff,
          });
          setPreparation((previous) =>
            previous
              ? (waiting.items.find(
                  (item) => item.receivingRecordId === previous.receivingRecordId,
                ) ?? null)
              : null,
          );
          setError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setPage(null);
          setError(e instanceof ApiError ? e.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [current, cursor, waitingCursor, user, manager, refresh, t, preparationLocked]);
  useEffect(() => {
    if (!visible?.waiting.length || selected || locked || loading) return;
    const update = () => setRefresh((value) => value + 1);
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [visible?.waiting.length, selected, locked, loading]);
  return (
    <div className="space-y-6" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
            {t(manager ? 'managerDescription' : 'description')}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => setRefresh((v) => v + 1)}
          isLoading={loading}
          disabled={loading || locked}
        >
          {!loading && <RefreshCw size={16} aria-hidden="true" />}
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && !visible ? (
        <p role="status">{t('loading')}</p>
      ) : (
        visible && (
          <>
            {(visible.waiting.length > 0 || waitingCursor) && (
              <Card padding="none" className="min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-4">
                  <h3 className="text-base font-semibold">{t('waitingTitle')}</h3>
                  <Badge
                    status="warning"
                    label={`${visible.waiting.length}${visible.waitingCursor ? '+' : ''}`}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table
                    aria-label={t('waitingTitle')}
                    className="w-full min-w-[640px] text-left text-sm"
                  >
                    <thead className="bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          {t('waitingProduct')}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                          {t('waitingQuantity')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          {t('waitingLoad')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          {t('waitingState')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          {t('actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.waiting.map((row) => (
                        <tr
                          key={row.receivingRecordId}
                          className="border-t border-[var(--sc-border-default)] align-top"
                        >
                          <th scope="row" className="max-w-xs px-4 py-4 font-normal">
                            <p className="font-medium">{row.productName}</p>
                            <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                              {row.sku}
                              {row.fromBinCode
                                ? ` · ${t('waitingSource', { bin: row.fromBinCode })}`
                                : ''}
                            </p>
                            <details className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                              <summary className="cursor-pointer">{t('waitingReferences')}</summary>
                              <p className="mt-2 break-all">{row.asnCode}</p>
                              <p className="mt-1 break-all">{row.lotCode}</p>
                            </details>
                          </th>
                          <td className="px-4 py-4 text-right font-semibold tabular-nums">
                            {format.format(row.quantity)}
                          </td>
                          <td className="px-4 py-4 tabular-nums">
                            <span className="whitespace-nowrap">
                              {format.format(Number(row.weightG) / 1000)} kg
                            </span>
                            <span className="mt-1 block whitespace-nowrap text-[var(--sc-text-secondary)]">
                              {format.format(Number(row.volumeM3))} m³
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              status={
                                row.reason === 'PLANNING' || row.reason === 'STOCK_REQUIRED'
                                  ? 'info'
                                  : 'warning'
                              }
                              label={t(`waitingReason.${row.reason}`)}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <PutawayWaitingActions
                              reason={row.reason}
                              disabled={locked || loading}
                              onPrepare={() => {
                                setSelected(null);
                                setPreparation(row);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] px-4 py-3">
                  <p className="text-xs text-[var(--sc-text-secondary)]">{t('waitingHint')}</p>
                  {(waitingCursor || visible.waitingCursor) && (
                    <div className="flex gap-2">
                      {waitingCursor && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || loading}
                          onClick={() => setWaitingCursor(null)}
                        >
                          {t('firstPage')}
                        </Button>
                      )}
                      {visible.waitingCursor && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || loading}
                          onClick={() => setWaitingCursor(visible.waitingCursor)}
                        >
                          {t('nextPage')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
            {preparation && manager && (
              <PutawayPreparationPanel
                warehouse={warehouse}
                item={preparation}
                locked={locked}
                loading={loading}
                onEditingChange={setPreparationLocked}
                onRefresh={reload}
                onClose={() => setPreparation(null)}
              />
            )}
            {visible.items.length > 0 && (
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                {visible.items.map((task) => (
                  <PutawayTaskCard
                    key={task.id}
                    task={task}
                    staff={visible.staff}
                    selected={selected?.id === task.id}
                    disabled={locked || loading}
                    onOpen={() => {
                      setPreparation(null);
                      setSelected(task);
                    }}
                  />
                ))}
              </div>
            )}
            {visible.items.length === 0 && visible.waiting.length === 0 && !waitingCursor && (
              <p>{t('empty')}</p>
            )}
            {(cursor || visible.cursor) && (
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
                    disabled={locked || loading}
                    onClick={() => setCursor(visible.cursor)}
                  >
                    {t('nextPage')}
                  </Button>
                )}
              </div>
            )}
            {selected && visible.items.some((i) => i.id === selected.id) && (
              <div id={`putaway-task-${selected.id}`} className="space-y-4">
                <PutawayTaskForm
                  key={`${current}:${selected.id}:${user?.userId}`}
                  warehouse={current}
                  task={selected}
                  staff={visible.staff}
                  manager={manager}
                  onLock={setTaskLocked}
                  disabled={relocationLocked || overrideLocked || preparationLocked}
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
                    disabled={taskLocked || relocationLocked || preparationLocked}
                    onLock={setOverrideLocked}
                    onSaved={() => {
                      setCursor(null);
                      setRefresh((v) => v + 1);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )
      )}
      {current && can('warehouse.putaway.relocate') && (
        <RelocationWorkspace
          warehouse={current}
          disabled={taskLocked || overrideLocked || preparationLocked}
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
    controller = useRef<AbortController | null>(null),
    titleRef = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PutawayConfirmation>({
    resolver: zodResolver(
      putawayConfirmationSchema.refine((v) => v.qty === task.qty, { path: ['qty'] }),
    ),
    defaultValues: {
      operationKey: createUuid(),
      expectedVersion: task.version,
      fromBinScan: '',
      toBinScan: '',
      skuScan: '',
      lotScan: '',
      qty: 0,
    },
  });
  useEffect(() => {
    titleRef.current?.focus();
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
        <h2 ref={titleRef} tabIndex={-1} className="break-words text-lg font-semibold">
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
                          operationKey: createUuid(),
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
