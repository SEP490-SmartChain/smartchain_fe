import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { adminDivisionApi, type AdminDivision } from '../api/adminDivisionApi';
import { carrierZoneApi } from '../api/carrierZoneApi';
import {
  carrierZoneFormSchema,
  type CarrierZone,
  type CarrierZoneForm,
} from '../schemas/carrierZoneSchema';

export function CarrierZonePanel({ carrierId }: { carrierId: string }) {
  const { can } = useAccess();
  const actor = useAuthStore((state) => state.user);
  const revision = useAuthStore((state) => state.revision);
  if (!can('platform.carriers.manage') || !actor) return null;
  return <ZonePanel key={`${actor.userId}:${revision}:${carrierId}`} carrierId={carrierId} />;
}

function ZonePanel({ carrierId }: { carrierId: string }) {
  const t = useTranslations('CarrierZones');
  const [rows, setRows] = useState<CarrierZone[]>([]);
  const [provinces, setProvinces] = useState<AdminDivision[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CarrierZone | null | undefined>();
  const form = useForm<CarrierZoneForm>({
    resolver: zodResolver(carrierZoneFormSchema),
    defaultValues: { fromProvince: '', toProvince: '', zone: '', etaDays: 1 },
  });
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setRows([]);
    setNext(null);
    void Promise.all([
      carrierZoneApi.list(carrierId, cursor, abort.signal),
      adminDivisionApi.provinces(abort.signal),
    ])
      .then(([page, directory]) => {
        if (abort.signal.aborted) return;
        setRows(page.items);
        setNext(page.pagination.nextCursor);
        setProvinces(directory);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [carrierId, cursor, reload, t]);
  function edit(row: CarrierZone | null) {
    form.reset(row ?? { fromProvince: '', toProvince: '', zone: '', etaDays: 1 });
    setError('');
    setEditing(row);
  }
  const submit = form.handleSubmit(async (values) => {
    const actor = useAuthStore.getState().user;
    const revision = useAuthStore.getState().revision;
    if (actor?.actorScope !== 'PLATFORM' || !actor.roles.includes('ORCA_ADMIN')) return;
    setError('');
    try {
      await carrierZoneApi.save(carrierId, values, editing ?? undefined);
      if (revision !== useAuthStore.getState().revision || actor !== useAuthStore.getState().user) {
        return;
      }
      setEditing(undefined);
      setReload((n) => n + 1);
    } catch (failure) {
      if (revision !== useAuthStore.getState().revision || actor !== useAuthStore.getState().user) {
        return;
      }
      const codes: Record<string, string> = {
        'CATALOG.ZONE_ROUTE_DUPLICATE': 'duplicate',
        'CATALOG.ZONE_STALE_UPDATE': 'stale',
        'CATALOG.ZONE_IN_USE': 'inUse',
        'CATALOG.PROVINCE_NOT_FOUND': 'provinceMissing',
      };
      setError(t(failure instanceof ApiError ? (codes[failure.code] ?? 'saveError') : 'saveError'));
    }
  });
  const provinceOptions = provinces.map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }));
  const provinceName = (code: string) => provinces.find((p) => p.code === code)?.name ?? code;
  return (
    <section className="space-y-4 border-t border-[var(--sc-border-default)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{t('title')}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || form.formState.isSubmitting}
            onClick={() => setReload((n) => n + 1)}
          >
            {t('reload')}
          </Button>
          <Button disabled={loading || form.formState.isSubmitting} onClick={() => edit(null)}>
            {t('add')}
          </Button>
        </div>
      </div>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('hint')}</p>
      {error && <Alert variant="error">{error}</Alert>}
      {editing !== undefined && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-lg border border-[var(--sc-border-default)] p-4"
        >
          <h4 className="font-medium">{t(editing ? 'edit' : 'add')}</h4>
          <fieldset disabled={form.formState.isSubmitting} className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('from')}
              options={provinceOptions}
              {...form.register('fromProvince')}
              disabled={!!editing || form.formState.isSubmitting}
              error={form.formState.errors.fromProvince ? t('invalid') : undefined}
            />
            <Select
              label={t('to')}
              options={provinceOptions}
              {...form.register('toProvince')}
              disabled={!!editing || form.formState.isSubmitting}
              error={form.formState.errors.toProvince ? t('invalid') : undefined}
            />
            <Input
              label={t('zone')}
              {...form.register('zone')}
              helperText={t('zoneHint')}
              error={form.formState.errors.zone ? t('invalid') : undefined}
            />
            <Input
              label={t('eta')}
              type="number"
              min={1}
              max={60}
              {...form.register('etaDays', { valueAsNumber: true })}
              error={form.formState.errors.etaDays ? t('invalid') : undefined}
            />
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={form.formState.isSubmitting}
              onClick={() => setEditing(undefined)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" isLoading={form.formState.isSubmitting}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
      <DataTable
        ariaLabel={t('title')}
        data={rows}
        isLoading={loading}
        emptyMessage={error ? t('loadError') : t('empty')}
        getRowKey={(row) => row.id}
        columns={[
          {
            key: 'fromProvince',
            label: t('from'),
            render: (row) => provinceName(row.fromProvince),
          },
          { key: 'toProvince', label: t('to'), render: (row) => provinceName(row.toProvince) },
          { key: 'zone', label: t('zone') },
          { key: 'etaDays', label: t('eta') },
          {
            key: 'actions',
            label: t('actions'),
            render: (row) => (
              <Button
                variant="outline"
                size="sm"
                disabled={form.formState.isSubmitting}
                onClick={() => edit(row)}
              >
                {t('edit')}
              </Button>
            ),
          },
        ]}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!cursor || loading || form.formState.isSubmitting}
          onClick={() => setCursor(undefined)}
        >
          {t('first')}
        </Button>
        <Button
          variant="outline"
          disabled={!next || loading || form.formState.isSubmitting}
          onClick={() => setCursor(next ?? undefined)}
        >
          {t('next')}
        </Button>
      </div>
    </section>
  );
}
