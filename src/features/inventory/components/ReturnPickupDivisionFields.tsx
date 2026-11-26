import { useEffect, useState } from 'react';

import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { useTranslations } from 'next-intl';

import { Alert, Button, Select } from '@/components/Common';
import { adminDivisionApi, type AdminDivision } from '@/features/catalog';

import type { ReturnRequestForm } from '../schemas/returnWorkflowSchema';

interface ReturnPickupDivisionFieldsProps {
  register: UseFormRegister<ReturnRequestForm>;
  setValue: UseFormSetValue<ReturnRequestForm>;
  errors: FieldErrors<ReturnRequestForm>;
  provinceCode: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/** Province → ward selects by name; the request payload still carries the catalogue codes. */
export function ReturnPickupDivisionFields({
  register,
  setValue,
  errors,
  provinceCode,
}: ReturnPickupDivisionFieldsProps) {
  const t = useTranslations('Returns');
  const [provinces, setProvinces] = useState<AdminDivision[]>([]),
    [wards, setWards] = useState<AdminDivision[]>([]),
    [provinceState, setProvinceState] = useState<LoadState>('loading'),
    [wardState, setWardState] = useState<LoadState>('ready'),
    [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setProvinceState('loading');
    adminDivisionApi
      .provinces(abort.signal)
      .then((rows) => {
        if (abort.signal.aborted) return;
        setProvinces(rows);
        setProvinceState('ready');
      })
      .catch(() => {
        if (!abort.signal.aborted) setProvinceState('error');
      });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    const abort = new AbortController();
    setWards([]);
    if (!provinceCode) {
      setWardState('ready');
      return () => abort.abort();
    }
    setWardState('loading');
    adminDivisionApi
      .wards(provinceCode, abort.signal)
      .then((rows) => {
        if (abort.signal.aborted) return;
        setWards(rows);
        setWardState('ready');
      })
      .catch(() => {
        if (!abort.signal.aborted) setWardState('error');
      });
    return () => abort.abort();
  }, [provinceCode, attempt]);

  if (provinceState === 'error' || wardState === 'error') {
    return (
      <Alert variant="error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{t('divisionLoadError')}</span>
          <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label={t('province')}
        placeholder={provinceState === 'loading' ? t('loading') : t('selectProvince')}
        options={provinces.map((row) => ({ value: row.code, label: row.name }))}
        disabled={provinceState === 'loading'}
        {...register('provinceCode', {
          onChange: () => setValue('wardCode', '', { shouldValidate: false }),
        })}
        error={errors.provinceCode ? t('selectProvince') : undefined}
      />
      <Select
        label={t('ward')}
        placeholder={wardState === 'loading' ? t('loading') : t('selectWard')}
        options={wards.map((row) => ({ value: row.code, label: row.name }))}
        disabled={!provinceCode || wardState === 'loading'}
        {...register('wardCode')}
        error={errors.wardCode ? t('selectWard') : undefined}
      />
    </div>
  );
}
