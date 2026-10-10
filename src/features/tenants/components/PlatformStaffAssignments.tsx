import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm, useController } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Card, CardContent, Checkbox } from '@/components/Common';
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
  const [options, setOptions] = useState<StaffWarehouseOption[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
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
      <form onSubmit={save} className="space-y-4 p-5">
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('hint')}</p>
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset
          disabled={isSubmitting || loading}
          className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-[var(--sc-border-default)] p-4"
        >
          <legend className="px-1 text-sm font-medium">{t('warehouses')}</legend>
          {options.map((option) => (
            <Checkbox
              key={option.id}
              value={option.id}
              label={`${option.code} — ${option.name}`}
              checked={field.value.includes(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
            />
          ))}
          {missingIds.map((id) => (
            <Checkbox
              key={id}
              value={id}
              label={t('unlisted', { id })}
              checked={field.value.includes(id)}
              onChange={(event) => toggle(id, event.target.checked)}
            />
          ))}
          {!loading && options.length === 0 && missingIds.length === 0 && (
            <p className="text-sm">{t('noWarehouses')}</p>
          )}
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
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{t('saved')}</Alert>}
      <Card>
        <CardContent className="space-y-4 p-5">
          {loading && <p role="status">{t('loading')}</p>}
          {!loading && !error && items.length === 0 && <p>{t('empty')}</p>}
          <ul className="m-0 list-none divide-y divide-[var(--sc-border-default)] p-0">
            {items.map((staff) => (
              <li
                key={staff.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="m-0 font-medium">{staff.fullName}</p>
                  <p className="my-1 text-sm text-[var(--sc-text-secondary)]">{staff.email}</p>
                  <p className="m-0 text-sm">
                    {t('assignedCount', { count: staff.warehouseIds.length })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setSuccess(false);
                    setEditing(staff);
                  }}
                >
                  {t('assign')}
                </Button>
              </li>
            ))}
          </ul>
          {cursor && (
            <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>
              {t('loadMore')}
            </Button>
          )}
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            {t('retry')}
          </Button>
        </CardContent>
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
