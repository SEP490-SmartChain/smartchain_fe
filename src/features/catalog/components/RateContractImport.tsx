import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';

import { rateIntelligenceApi, type RateImportPreview } from '../api/rateIntelligenceApi';

export interface RateImportCarrier {
  id: string;
  code: string;
  name: string;
}

interface RateContractImportProps {
  carriers: RateImportCarrier[];
  onImported: (carrierId: string) => Promise<void>;
}

const importSchema = z.object({
  carrierId: z.string().uuid('Chọn hãng.'),
  file: z.custom<FileList>(
    (value) => typeof FileList !== 'undefined' && value instanceof FileList && value.length === 1,
    'Chọn một file CSV.',
  ),
  isSample: z.boolean(),
});
type ImportForm = z.infer<typeof importSchema>;

export function RateContractImport({ carriers, onImported }: RateContractImportProps) {
  const t = useTranslations('RateIntelligence');
  const [preview, setPreview] = useState<RateImportPreview | null>(null);
  const [importKey, setImportKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<ImportForm>({
    resolver: zodResolver(importSchema),
    defaultValues: { carrierId: '', isSample: true },
  });

  const clearPreview = () => {
    setPreview(null);
    setImportKey(null);
    setError('');
    setNotice('');
  };

  const onPreview = handleSubmit(async (values) => {
    clearPreview();
    const file = values.file[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('importCsvOnly'));
      return;
    }
    setIsChecking(true);
    try {
      const carrier = carriers.find((item) => item.id === values.carrierId);
      if (!carrier) throw new Error(t('importChooseCarrier'));
      setPreview(await rateIntelligenceApi.preview(file, carrier.code, values.isSample));
      setImportKey(crypto.randomUUID());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setIsChecking(false);
    }
  });

  const onSave = handleSubmit(async (values) => {
    const file = values.file[0];
    const carrier = carriers.find((item) => item.id === values.carrierId);
    if (!file || !carrier || !preview || !importKey || preview.issues.length > 0) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      await rateIntelligenceApi.import(file, carrier.code, values.isSample, importKey);
      setNotice(t('importSuccess'));
      setPreview(null);
      setImportKey(null);
      resetField('file');
      await onImported(values.carrierId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setIsSaving(false);
    }
  });

  const fileRegistration = register('file');
  const carrierRegistration = register('carrierId', { onChange: clearPreview });
  const sampleRegistration = register('isSample', { onChange: clearPreview });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t('importTitle')} description={t('importDescription')} />
        <form
          className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.3fr)_auto] lg:items-end"
          onSubmit={onPreview}
        >
          <Select
            label={t('importCarrier')}
            options={carriers.map((carrier) => ({ value: carrier.id, label: carrier.name }))}
            placeholder={t('importChooseCarrier')}
            error={errors.carrierId?.message ? t('importChooseCarrier') : undefined}
            {...carrierRegistration}
          />
          <div>
            <label
              className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
              htmlFor="rate-csv"
            >
              {t('importFile')}
            </label>
            <input
              id="rate-csv"
              type="file"
              accept=".csv,text/csv"
              className="block min-h-[42px] w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2 text-sm text-[var(--sc-text-primary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--sc-primary-alpha-08)] file:px-3 file:py-1 file:font-medium file:text-[var(--sc-primary-dark)]"
              {...fileRegistration}
              onChange={(event) => {
                void fileRegistration.onChange(event);
                clearPreview();
              }}
            />
            {errors.file?.message ? (
              <p className="mt-1 text-xs text-[var(--sc-error)]">{t('importChooseFile')}</p>
            ) : null}
          </div>
          <Button type="submit" isLoading={isChecking || isSubmitting}>
            {t('importPreview')}
          </Button>
          <label className="flex items-center gap-2 text-sm text-[var(--sc-text-secondary)] lg:col-span-3">
            <input
              type="checkbox"
              className="size-4 accent-[var(--sc-primary)]"
              {...sampleRegistration}
            />
            {t('importSample')}
          </label>
        </form>
        <details className="mt-4 text-sm text-[var(--sc-text-secondary)]">
          <summary className="cursor-pointer font-medium text-[var(--sc-primary-dark)]">
            {t('importFormat')}
          </summary>
          <p className="mt-2 break-words">{t('importFormatColumns')}</p>
        </details>
        {error ? (
          <Alert className="mt-4" variant="error">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert className="mt-4" variant="success">
            {notice}
          </Alert>
        ) : null}
      </Card>

      {preview ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">
                {t('importPreviewTitle')}
              </h3>
              <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
                {t('importPreviewCount', { valid: preview.validCount, total: preview.rowCount })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={clearPreview}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                isLoading={isSaving}
                disabled={preview.issues.length > 0 || preview.validCount === 0}
                onClick={onSave}
              >
                {t('importConfirm')}
              </Button>
            </div>
          </div>
          {preview.isSample ? (
            <div className="mt-3">
              <Badge status="warning" label={t('sampleLabel')} />
            </div>
          ) : null}
          {preview.issues.length > 0 ? (
            <ul
              className="mt-4 space-y-1 text-sm text-[var(--sc-error)]"
              aria-label={t('importIssues')}
            >
              {preview.issues.map((issue) => (
                <li key={`${issue.row}-${issue.field}-${issue.message}`}>
                  {t('rowIssue', { row: issue.row, field: issue.field, message: issue.message })}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
