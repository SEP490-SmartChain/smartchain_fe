import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useForm, useController } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, CardHeader, Checkbox, PageHeader } from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import {
  assignmentSchema,
  platformStaffApi,
  type PlatformStaff,
  type StaffWarehouseOption,
} from '../api/platformStaffApi';

import type { z } from 'zod';

interface AssignmentEditorProps {
  staff: PlatformStaff;
  onClose: () => void;
  onSaved: (staff: PlatformStaff) => void;
}

function AssignmentEditor({ staff, onClose, onSaved }: AssignmentEditorProps) {
  const t = useTranslations('PlatformStaff');
  const unavailableDescriptionId = useId();
  const [options, setOptions] = useState<StaffWarehouseOption[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasLoadedOptions, setHasLoadedOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { warehouseIds: staff.warehouseIds },
  });

  const { field } = useController({ control, name: 'warehouseIds' });
  const toggle = (id: string, checked: boolean) =>
    field.onChange(checked ? [...field.value, id] : field.value.filter((value) => value !== id));
  const load = useCallback(
    async (next?: string) => {
      const signal = controller.current?.signal;
      setLoading(true);
      setError(null);
      try {
        const page = await platformStaffApi.warehouseOptions(next, signal);
        if (signal?.aborted) return;
        setOptions((current) => (next ? [...current, ...page.items] : page.items));
        setCursor(page.pagination.nextCursor);
        setHasLoadedOptions(true);
      } catch (failure) {
        if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t('loadError'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [t],
  );
  useEffect(() => {
    const pending = new AbortController();
    controller.current = pending;
    void load();
    return () => pending.abort();
  }, [load]);

  const save = handleSubmit(async (values) => {
    const signal = controller.current?.signal;
    setError(null);
    try {
      const saved = await platformStaffApi.replace(staff.userId, values, signal);
      if (!signal?.aborted) onSaved(saved);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t('saveError'));
    }
  });
  const missingIds = staff.warehouseIds.filter((id) => !options.some((option) => option.id === id));
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={t('editTitle', { name: staff.fullName })}
      width="600px"
    >
      <form onSubmit={save} className="space-y-4">
        <p className="m-0 text-sm leading-5 text-[var(--sc-text-secondary)]">{t('hint')}</p>
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset
          disabled={isSubmitting || loading}
          className="rounded-xl border border-[var(--sc-border-default)] px-3 pb-3 pt-1"
        >
          <legend className="px-1 text-sm font-medium">{t('warehouses')}</legend>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
            <Badge
              status={field.value.length ? 'success' : 'warning'}
              label={t('selectedCount', { count: field.value.length })}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!field.value.length || isSubmitting}
              onClick={() => field.onChange([])}
            >
              {t('clearAll')}
            </Button>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {options.map((option) => (
              <div
                key={option.id}
                className="rounded-lg px-2 py-2 transition-colors hover:bg-[var(--sc-bg-secondary)]"
              >
                <Checkbox
                  value={option.id}
                  label={`${option.code} — ${option.name}`}
                  checked={field.value.includes(option.id)}
                  onChange={(event) => toggle(option.id, event.target.checked)}
                />
              </div>
            ))}
            {hasLoadedOptions && missingIds.length > 0 && (
              <div className="rounded-lg border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] px-2 py-2">
                <Checkbox
                  value="unlisted-assignments"
                  label={t('unlisted', { count: missingIds.length })}
                  checked={missingIds.every((id) => field.value.includes(id))}
                  aria-describedby={unavailableDescriptionId}
                  onChange={(event) => {
                    const missingSet = new Set(missingIds);
                    field.onChange(
                      event.target.checked
                        ? [...new Set([...field.value, ...missingIds])]
                        : field.value.filter((id) => !missingSet.has(id)),
                    );
                  }}
                />
                <p
                  id={unavailableDescriptionId}
                  className="mb-0 ml-6 mt-1 text-xs leading-4 text-[var(--sc-warning-dark)]"
                >
                  {t(cursor ? 'unlistedMoreHelp' : 'unlistedFinalHelp')}
                </p>
              </div>
            )}
            {hasLoadedOptions && options.length === 0 && missingIds.length === 0 && (
              <p className="m-0 px-2 py-2 text-sm text-[var(--sc-text-secondary)]">
                {t('noWarehouses')}
              </p>
            )}
          </div>
        </fieldset>
        {errors.warehouseIds && <Alert variant="error">{t('invalidSelection')}</Alert>}
        {loading && <p role="status">{t('loading')}</p>}
        {cursor && (
          <Button
            type="button"
            variant="outline"
            disabled={loading || isSubmitting}
            onClick={() => void load(cursor)}
          >
            {t('loadMore')}
          </Button>
        )}
        {error && (
          <Button
            type="button"
            variant="outline"
            disabled={loading || isSubmitting}
            onClick={() => void load()}
          >
            {t('retry')}
          </Button>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={loading} isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StaffDirectory() {
  const t = useTranslations('PlatformStaff');
  const [items, setItems] = useState<PlatformStaff[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState<PlatformStaff | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (next?: string) => {
      const signal = controller.current?.signal;
      setLoading(true);
      setError(null);
      try {
        const page = await platformStaffApi.list(next, signal);
        if (signal?.aborted) return;
        setItems((current) => (next ? [...current, ...page.items] : page.items));
        setCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t('loadError'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [t],
  );
  useEffect(() => {
    const pending = new AbortController();
    controller.current = pending;
    void load();
    return () => pending.abort();
  }, [load]);

  const columns: ColumnDef<PlatformStaff>[] = [
    {
      key: 'staff',
      label: t('staffColumn'),
      render: (staff) => (
        <div className="min-w-[180px]">
          <p className="m-0 font-medium">{staff.fullName}</p>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{staff.email}</p>
        </div>
      ),
    },
    {
      key: 'warehouseIds',
      label: t('assignedWarehousesColumn'),
      render: (staff) => (
        <span className="whitespace-nowrap tabular-nums">
          {t('assignedCount', { count: staff.warehouseIds.length })}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t('actionsColumn'),
      render: (staff) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setSuccess(false);
              setEditing(staff);
            }}
          >
            {t('assign')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{t('saved')}</Alert>}
      <Card padding="none">
        <CardHeader
          title={t('directoryTitle')}
          className="mb-0 border-b border-[var(--sc-border-default)] px-4 py-3 sm:px-5"
          action={
            <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
              {t('retry')}
            </Button>
          }
        />
        <DataTable
          ariaLabel={t('tableLabel')}
          columns={columns}
          data={items}
          getRowKey={(staff) => staff.userId}
          isLoading={loading}
          emptyMessage={t('empty')}
        />
        {cursor && (
          <div className="border-t border-[var(--sc-border-default)] p-4">
            <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>
              {t('loadMore')}
            </Button>
          </div>
        )}
      </Card>
      {editing && (
        <AssignmentEditor
          key={editing.userId}
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((current) =>
              current.map((item) => (item.userId === saved.userId ? saved : item)),
            );
            setEditing(null);
            setSuccess(true);
          }}
        />
      )}
    </div>
  );
}

export function PlatformStaffAssignments() {
  const user = useAuthStore((state) => state.user);
  const { can } = useAccess();
  if (!can('iam.warehouses.assign')) return null;
  // Unmount on identity/grant changes, aborting requests and clearing staff data.
  return <StaffDirectory key={`${user?.userId}:${user?.actorScope}:${user?.roles.join(',')}`} />;
}
