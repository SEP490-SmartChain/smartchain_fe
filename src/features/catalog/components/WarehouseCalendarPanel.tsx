import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import { RequiredIndicator } from '@/components/Common/RequiredIndicator/RequiredIndicator';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { warehouseApi, type WarehouseCalendar } from '../api/warehouseApi';
import {
  closedDateList,
  warehouseCalendarSchema,
  type WarehouseCalendarForm,
} from '../schemas/warehouseCalendarSchema';

import type { Warehouse } from '../types/warehouse';

export function WarehouseCalendarPanel({
  warehouse,
  onSaved,
}: {
  readonly warehouse: Warehouse;
  readonly onSaved: () => void;
}) {
  const t = useTranslations('Warehouses');
  const { can } = useAccess();
  const principal = useAuthStore((s) => s.user);
  const [calendar, setCalendar] = useState<WarehouseCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [queryAt, setQueryAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseCalendarForm>({
    resolver: zodResolver(warehouseCalendarSchema(t('calendarInvalid'))),
    defaultValues: { workingDays: [], closedDatesText: '' },
  });
  const days = watch('workingDays');
  const canEdit = can('warehouses.update');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void warehouseApi
      .calendar(warehouse.id, queryAt, controller.signal)
      .then((value) => {
        if (!active) return;
        setCalendar(value);
        reset({ workingDays: value.workingDays, closedDatesText: value.closedDates.join('\n') });
      })
      .catch((failure) => {
        if (active) {
          setCalendar(null);
          setError(failure instanceof ApiError ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [warehouse.id, warehouse.version, queryAt, principal, t, reset, retry]);
  const save = handleSubmit(async (values) => {
    if (!canEdit || !calendar) return;
    const identity = useAuthStore.getState().user;
    try {
      await warehouseApi.updateCalendar(warehouse.id, {
        workingDays: values.workingDays,
        closedDates: closedDateList(values.closedDatesText),
        expectedVersion: calendar.version,
      });
      if (identity !== useAuthStore.getState().user) return;
      toast.success(t('calendarSaved'));
      setRetry((value) => value + 1);
      onSaved();
    } catch (failure) {
      if (identity !== useAuthStore.getState().user) return;
      setError(failure instanceof ApiError ? failure.message : t('saveError'));
    }
  });
  return (
    <section className="mt-5 space-y-3" aria-label={t('calendarTitle')}>
      <h2 className="font-semibold">{t('calendarTitle')}</h2>
      <p className="text-sm">{t('calendarNotice')}</p>
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading && <p>{t('loading')}</p>}
      {calendar && !loading && (
        <>
          <form onSubmit={save} className="space-y-3">
            <fieldset disabled={!canEdit || isSubmitting} className="space-y-2">
              <legend>
                {t('workingDays')} <RequiredIndicator isRequired />
              </legend>
              <div className="flex flex-wrap gap-4">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <Checkbox
                    key={day}
                    label={t(`weekdays.${day}`)}
                    checked={days.includes(day)}
                    onChange={(event) =>
                      setValue(
                        'workingDays',
                        event.target.checked
                          ? [...days, day].sort()
                          : days.filter((v) => v !== day),
                        { shouldValidate: true },
                      )
                    }
                  />
                ))}
              </div>
              {errors.workingDays && (
                <p className="text-sm text-[var(--sc-error)]">{errors.workingDays.message}</p>
              )}
              <label className="block">
                {t('closedDates')}
                <textarea
                  {...register('closedDatesText')}
                  rows={3}
                  placeholder="2026-12-25"
                  className="mt-1 block w-full rounded border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-2"
                />
              </label>
              {errors.closedDatesText && (
                <p className="text-sm text-[var(--sc-error)]">{errors.closedDatesText.message}</p>
              )}
            </fieldset>
            {canEdit && (
              <Button type="submit" disabled={isSubmitting}>
                {t('saveCalendar')}
              </Button>
            )}
          </form>
          <label className="block">
            {t('calendarCheckAt')}
            <Input
              type="datetime-local"
              value={at}
              onChange={(event) => setAt(event.target.value)}
            />
          </label>
          <Button
            variant="outline"
            onClick={() => {
              const instant = at ? new Date(`${at}:00+07:00`) : new Date();
              if (!Number.isFinite(instant.getTime())) {
                setError(t('calendarInvalid'));
                return;
              }
              setQueryAt(instant.toISOString());
            }}
          >
            {t('checkCalendar')}
          </Button>
          <p>
            {calendar.localDate} —{' '}
            {t('calendarCapacity', { used: calendar.capacityUsed, total: calendar.dailyCapacity })}
          </p>
          <ul className="list-disc pl-5">
            <li>
              {t('intakeEligible')}: {t(calendar.intakeEligible ? 'eligible' : 'unavailable')}
            </li>
            <li>
              {t('allocationEligible')}:{' '}
              {t(calendar.allocationEligible ? 'eligible' : 'unavailable')}
            </li>
            <li>
              {t('sameDayHandover')}:{' '}
              {t(calendar.sameDayHandoverEligible ? 'eligible' : 'unavailable')}
            </li>
            {calendar.reasons.map((reason) => (
              <li key={reason}>{t(`calendarReasons.${reason}`)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
