import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Select } from '@/components/Common/Select/Select';

import { adminDivisionApi, type AdminDivision } from '../api/adminDivisionApi';

import type { CreateWarehouseFormValues } from '../schemas/warehouseSchema';

interface Props {
  register: UseFormRegister<CreateWarehouseFormValues>;
  setValue: UseFormSetValue<CreateWarehouseFormValues>;
  errors: FieldErrors<CreateWarehouseFormValues>;
  provinceCode: string;
  wardCode: string;
  detail: string;
  onPreview?: (preview: string) => void;
}

type LoadState = 'loading' | 'ready' | 'error';

/** Province → ward selects backed by the seeded catalogue; payload keeps the codes. */
export function WarehouseAddressFields({
  register,
  setValue,
  errors,
  provinceCode,
  wardCode,
  detail,
  onPreview,
}: Props) {
  const t = useTranslations('Warehouses');
  const [provinces, setProvinces] = useState<AdminDivision[]>([]);
  const [wards, setWards] = useState<AdminDivision[]>([]);
  const [provinceState, setProvinceState] = useState<LoadState>('loading');
  const [wardState, setWardState] = useState<LoadState>('ready');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setProvinceState('loading');
    adminDivisionApi
      .provinces(abort.signal)
      .then((rows) => {
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
    // Legacy codes (not numeric catalogue codes) have no ward list; keep them selectable as-is.
    if (!/^[0-9]{1,10}$/.test(provinceCode)) {
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
    // A response for a previously selected province is ignored via the abort signal.
    return () => abort.abort();
  }, [provinceCode, attempt]);

  // Native selects render options after the form value was set (edit mode); re-apply it so the
  // stored code is shown once its option exists.
  useEffect(() => {
    if (provinceState === 'ready') setValue('provinceCode', provinceCode);
  }, [provinceState, provinces, provinceCode, setValue]);
  useEffect(() => {
    if (wardState === 'ready') setValue('wardCode', wardCode);
  }, [wardState, wards, wardCode, setValue]);

  const handleProvinceChange = useCallback(() => {
    setValue('wardCode', '', { shouldValidate: false });
    setValue('districtCode', '', { shouldValidate: false });
  }, [setValue]);

  const provinceOptions = useMemo(() => {
    const options = provinces.map((row) => ({ value: row.code, label: row.name }));
    if (
      provinceCode &&
      !provinces.some((row) => row.code === provinceCode) &&
      provinceState === 'ready'
    ) {
      options.unshift({ value: provinceCode, label: t('legacyCode', { code: provinceCode }) });
    }
    return options;
  }, [provinces, provinceCode, provinceState, t]);
  const wardOptions = useMemo(() => {
    const options = wards.map((row) => ({ value: row.code, label: row.name }));
    if (wardCode && !wards.some((row) => row.code === wardCode) && wardState === 'ready') {
      options.unshift({ value: wardCode, label: t('legacyCode', { code: wardCode }) });
    }
    return options;
  }, [wards, wardCode, wardState, t]);

  const provinceName = provinces.find((row) => row.code === provinceCode)?.name;
  const wardName = wards.find((row) => row.code === wardCode)?.name;
  const preview = [detail.trim(), wardName, provinceName].filter(Boolean).join(', ');

  useEffect(() => {
    onPreview?.(preview);
  }, [preview, onPreview]);

  if (provinceState === 'error' || wardState === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 text-sm text-[var(--sc-error)]"
      >
        <span>{t('divisionLoadError')}</span>
        <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (provinceState === 'ready' && provinces.length === 0) {
    return (
      <p role="alert" className="text-sm text-[var(--sc-warning)]">
        {t('divisionEmpty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          label={t('province')}
          placeholder={provinceState === 'loading' ? t('loading') : t('selectProvince')}
          options={provinceOptions}
          disabled={provinceState === 'loading'}
          {...register('provinceCode', { onChange: handleProvinceChange })}
          error={errors.provinceCode?.message}
        />
        <Select
          label={t('ward')}
          placeholder={wardState === 'loading' ? t('loading') : t('selectWard')}
          options={wardOptions}
          disabled={!provinceCode || wardState === 'loading'}
          {...register('wardCode')}
          error={errors.wardCode?.message}
        />
      </div>
      {preview && (
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {t('addressPreview')}: {preview}
        </p>
      )}
    </div>
  );
}
