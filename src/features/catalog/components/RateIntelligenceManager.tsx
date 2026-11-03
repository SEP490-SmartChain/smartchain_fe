import { useCallback, useEffect, useMemo, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';

import { freightTariffApi } from '../api/freightTariffApi';
import {
  rateIntelligenceApi,
  type RateCollectionJob,
  type RateImportPreview,
  type RateSnapshot,
} from '../api/rateIntelligenceApi';

const importSchema = z.object({
  carrierId: z.string().uuid('Select a carrier.'),
  file: z.custom<FileList>(
    (value) => typeof FileList !== 'undefined' && value instanceof FileList && value.length === 1,
    'Choose one CSV file.',
  ),
  isSample: z.boolean(),
});
type ImportForm = z.infer<typeof importSchema>;

function formatAmount(value: string | number) {
  return new Intl.NumberFormat('vi-VN').format(Number(value));
}

export function RateIntelligenceManager() {
  const t = useTranslations('RateIntelligence');
  const [services, setServices] = useState<Awaited<ReturnType<typeof freightTariffApi.services>>>(
    [],
  );
  const [jobs, setJobs] = useState<RateCollectionJob[]>([]);
  const [snapshots, setSnapshots] = useState<RateSnapshot[]>([]);
  const [preview, setPreview] = useState<RateImportPreview | null>(null);
  const [importKey, setImportKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<ImportForm>({
    resolver: zodResolver(importSchema),
    defaultValues: { carrierId: '', isSample: true },
  });
  const selectedCarrierId = watch('carrierId');

  const carriers = useMemo(() => {
    const unique = new Map<string, { id: string; code: string; name: string }>();
    for (const service of services) {
      if (!unique.has(service.carrierId)) {
        unique.set(service.carrierId, {
          id: service.carrierId,
          code: service.carrier.code,
          name: service.carrier.name,
        });
      }
    }
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [services]);

  const refresh = useCallback(async (carrierId?: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const [serviceRows, jobRows, snapshotRows] = await Promise.all([
        freightTariffApi.services(),
        rateIntelligenceApi.jobs(),
        rateIntelligenceApi.snapshots(carrierId),
      ]);
      setServices(serviceRows);
      setJobs(jobRows);
      setSnapshots(snapshotRows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(selectedCarrierId || undefined);
  }, [refresh, selectedCarrierId]);

  const clearPreview = () => {
    setPreview(null);
    setImportKey(null);
    setActionError('');
    setNotice('');
  };

  const onPreview = handleSubmit(async (values) => {
    clearPreview();
    const file = values.file[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setActionError(t('csvOnly'));
      return;
    }
    setBusy(true);
    try {
      const carrier = carriers.find((item) => item.id === values.carrierId);
      if (!carrier) throw new Error(t('selectCarrier'));
      setPreview(await rateIntelligenceApi.preview(file, carrier.code, values.isSample));
      setImportKey(crypto.randomUUID());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  });

  const onImport = handleSubmit(async (values) => {
    const file = values.file[0];
    const carrier = carriers.find((item) => item.id === values.carrierId);
    if (!file || !carrier || !preview || !importKey || preview.issues.length > 0) return;
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      await rateIntelligenceApi.import(file, carrier.code, values.isSample, importKey);
      setNotice(t('importSuccess'));
      setPreview(null);
      setImportKey(null);
      resetField('file');
      await refresh(values.carrierId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('actionError'));
    } finally {
      setSaving(false);
    }
  });

  const fileRegistration = register('file');
  const carrierRegistration = register('carrierId', { onChange: clearPreview });
  const sampleRegistration = register('isSample', { onChange: clearPreview });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t('title')} description={t('description')} />
        <form
          className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.3fr)_auto] lg:items-end"
          onSubmit={onPreview}
        >
          <Select
            label={t('carrier')}
            options={carriers.map((carrier) => ({
              value: carrier.id,
              label: `${carrier.name} (${carrier.code})`,
            }))}
            placeholder={t('selectCarrier')}
            error={errors.carrierId?.message ? t('selectCarrier') : undefined}
            {...carrierRegistration}
          />
          <div>
            <label
              className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
              htmlFor="rate-csv"
            >
              {t('csvFile')}
            </label>
            <input
              id="rate-csv"
              type="file"
              accept=".csv,text/csv"
              className="block min-h-[42px] w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2 text-sm text-[var(--sc-text-primary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--sc-primary-alpha-08)] file:px-3 file:py-1 file:font-medium file:text-[var(--sc-primary-dark)]"
              {...fileRegistration}
              onChange={(event) => {
                fileRegistration.onChange(event);
                clearPreview();
              }}
            />
            {errors.file?.message && (
              <p className="mt-1 text-xs text-[var(--sc-error)]">{t('chooseCsv')}</p>
            )}
          </div>
          <Button type="submit" isLoading={busy || isSubmitting}>
            {t('previewImport')}
          </Button>
          <label className="flex items-center gap-2 text-sm text-[var(--sc-text-secondary)] lg:col-span-3">
            <input
              type="checkbox"
              className="size-4 accent-[var(--sc-primary)]"
              {...sampleRegistration}
            />
            {t('sampleData')}
          </label>
        </form>
        <p className="mt-3 text-xs text-[var(--sc-text-secondary)]">{t('csvColumns')}</p>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-[var(--sc-error)]">
            {actionError}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm text-[var(--sc-success)]">
            {notice}
          </p>
        )}
      </Card>

      {preview && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">
                {t('previewTitle')}
              </h3>
              <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
                {t('previewCount', { valid: preview.validCount, total: preview.rowCount })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={clearPreview}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                isLoading={saving}
                disabled={preview.issues.length > 0 || preview.validCount === 0}
                onClick={onImport}
              >
                {t('confirmImport')}
              </Button>
            </div>
          </div>
          {preview.isSample && (
            <div className="mt-3">
              <Badge status="warning" label={t('sampleLabel')} />
            </div>
          )}
          {preview.issues.length > 0 && (
            <ul
              className="mt-4 space-y-1 text-sm text-[var(--sc-error)]"
              aria-label={t('validationIssues')}
            >
              {preview.issues.map((issue) => (
                <li key={`${issue.row}-${issue.field}-${issue.message}`}>
                  {t('rowIssue', { row: issue.row, field: issue.field, message: issue.message })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card padding="none">
        <div className="border-b border-[var(--sc-border-default)] p-5">
          <CardHeader title={t('snapshotsTitle')} description={t('snapshotsDescription')} />
          <div className="max-w-sm">
            <Select
              label={t('filterCarrier')}
              value={selectedCarrierId}
              options={carriers.map((carrier) => ({
                value: carrier.id,
                label: `${carrier.name} (${carrier.code})`,
              }))}
              placeholder={t('allCarriers')}
              isPlaceholderDisabled={false}
              onChange={(event) => {
                setValue('carrierId', event.target.value || '', { shouldValidate: false });
                clearPreview();
              }}
            />
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('loading')}</p>
        ) : loadError ? (
          <div className="p-6">
            <p role="alert" className="text-sm text-[var(--sc-error)]">
              {t('loadError')}
            </p>
            <Button className="mt-3" variant="secondary" onClick={() => void refresh()}>
              {t('reload')}
            </Button>
          </div>
        ) : snapshots.length === 0 ? (
          <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('emptySnapshots')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-[var(--sc-border-default)] text-left text-sm"
              aria-label={t('snapshotsTitle')}
            >
              <thead className="bg-[var(--sc-bg-secondary)] text-xs uppercase tracking-wide text-[var(--sc-text-secondary)]">
                <tr>
                  {[
                    'carrier',
                    'service',
                    'route',
                    'area',
                    'weight',
                    'basePrice',
                    'stepPrice',
                    'effective',
                    'version',
                    'source',
                  ].map((key) => (
                    <th key={key} scope="col" className="whitespace-nowrap px-4 py-3">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-[var(--sc-bg-secondary)]">
                    <td className="whitespace-nowrap px-4 py-3">{snapshot.carrier.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">{snapshot.service.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {snapshot.originZone} → {snapshot.destZone}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {t(snapshot.receiverArea === 'WARD' ? 'ward' : 'commune')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {snapshot.weightMinG}–{snapshot.weightMaxG} g
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatAmount(snapshot.basePriceVnd)} / {snapshot.baseWeightG} g
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      +{formatAmount(snapshot.stepPriceVnd)} / {snapshot.stepWeightG} g
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(snapshot.effectiveFrom).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">v{snapshot.version}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span>{t('contractImport')}</span>
                      {snapshot.isSample && (
                        <span className="ml-2">
                          <Badge status="warning" label={t('sampleLabel')} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="border-b border-[var(--sc-border-default)] p-5">
          <CardHeader title={t('jobsTitle')} description={t('jobsDescription')} />
        </div>
        {jobs.length === 0 ? (
          <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('emptyJobs')}</p>
        ) : (
          <ul className="divide-y divide-[var(--sc-border-default)]">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-[var(--sc-text-primary)]">
                    {job.carrier.name} · {job.recordCount} {t('records')}
                  </p>
                  <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                    {new Date(job.startedAt).toLocaleString()} ·{' '}
                    {job.source === 'CONTRACT_IMPORT' ? t('contractImport') : job.environment}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    status={
                      job.status === 'SUCCEEDED'
                        ? 'success'
                        : job.status === 'PARTIAL'
                          ? 'warning'
                          : 'error'
                    }
                    label={t(`status_${job.status}`)}
                  />
                  {job.isSample && <Badge status="warning" label={t('sampleLabel')} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
