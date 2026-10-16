import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Clock3, Pencil, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './WarehouseDetails.module.css';
import { warehouseApi, type WarehouseCalendar } from '../api/warehouseApi';
import {
  closedDateList,
  warehouseCalendarSchema,
  type WarehouseCalendarForm,
} from '../schemas/warehouseCalendarSchema';
import { END_OF_DAY_MINUTE, minuteToTime } from '../utils/warehouseHours';

import type { Warehouse } from '../types/warehouse';

export function WarehouseCalendarPanel({
  warehouse,
  onSaved,
  onEdit,
}: {
  readonly warehouse: Warehouse;
  readonly onSaved: () => void;
  readonly onEdit: () => void;
}) {
  const t = useTranslations('Warehouses');
  const locale = useLocale();
  const { can } = useAccess();
  const principal = useAuthStore((s) => s.user);
  const [calendar, setCalendar] = useState<WarehouseCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [queryAt, setQueryAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
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
        setAt(`${value.localDate}T${minuteToTime(value.localMinute)}`);
        reset(
          { workingDays: value.workingDays, closedDatesText: value.closedDates.join('\n') },
          { keepDirtyValues: true },
        );
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
      reset(values);
      toast.success(t('calendarSaved'));
      setRetry((value) => value + 1);
      onSaved();
    } catch (failure) {
      if (identity !== useAuthStore.getState().user) return;
      setError(failure instanceof ApiError ? failure.message : t('saveError'));
    }
  });
  const hasUnsavedChanges = Object.keys(dirtyFields).length > 0;
  const needsCheck =
    !!calendar && at !== `${calendar.localDate}T${minuteToTime(calendar.localMinute)}`;
  const checkAvailability = () => {
    const instant = new Date(`${at}:00+07:00`);
    if (!at || !Number.isFinite(instant.getTime())) {
      setCheckError(t('checkTimeRequired'));
      return;
    }
    setCheckError(null);
    setQueryAt(instant.toISOString());
    setRetry((value) => value + 1);
  };
  return (
    <section className={styles.stack} aria-label={t('calendarTitle')}>
      <div>
        <h2 className={styles.panelTitle}>
          <CalendarDays size={20} className={styles.icon} aria-hidden="true" />
          {t('calendarTitle')}
        </h2>
        <p className={`${styles.copy} mt-2`}>{t('calendarNotice')}</p>
      </div>
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      {calendar && !loading && (
        <div className={styles.split}>
          <form onSubmit={save} className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.subtitle}>{t('calendarConfiguration')}</h3>
              {!canEdit && <Badge status="default" label={t('readOnly')} />}
              {canEdit && hasUnsavedChanges && (
                <Badge status="warning" label={t('unsavedChanges')} />
              )}
            </div>
            <div className={styles.hoursSummary}>
              <dl className={styles.metadata}>
                <div>
                  <dt>{t('hoursTitle')}</dt>
                  <dd>
                    {minuteToTime(calendar.operatingStartMinute)} –{' '}
                    {calendar.operatingEndMinute === END_OF_DAY_MINUTE
                      ? t('endOfDay')
                      : minuteToTime(calendar.operatingEndMinute)}
                  </dd>
                </div>
                <div>
                  <dt>{t('cutoffLabel')}</dt>
                  <dd>{minuteToTime(calendar.cutoffMinute)}</dd>
                </div>
              </dl>
              {canEdit && (
                <Button variant="ghost" size="sm" type="button" onClick={onEdit}>
                  <Pencil size={14} aria-hidden="true" />
                  {t('editOperatingHours')}
                </Button>
              )}
            </div>
            <fieldset disabled={!canEdit || isSubmitting} className="space-y-5">
              <legend className={styles.subtitle}>{t('workingDays')}</legend>
              <div className={styles.weekdays}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <div key={day} className={styles.weekday} data-selected={days.includes(day)}>
                    <Checkbox
                      label={t(`weekdays.${day}`)}
                      checked={days.includes(day)}
                      onChange={(event) =>
                        setValue(
                          'workingDays',
                          event.target.checked
                            ? [...days, day].sort()
                            : days.filter((v) => v !== day),
                          { shouldValidate: true, shouldDirty: true },
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              {errors.workingDays && (
                <p className="text-sm text-[var(--sc-error)]">{errors.workingDays.message}</p>
              )}
              <label className="block text-sm font-medium">
                {t('closedDates')}
                <textarea
                  {...register('closedDatesText')}
                  rows={3}
                  placeholder="2026-12-25"
                  className={styles.textarea}
                />
                <span className="mt-2 block text-xs font-normal text-[var(--sc-text-secondary)]">
                  {t('closedDatesHelp')}
                </span>
              </label>
              {errors.closedDatesText && (
                <p className="text-sm text-[var(--sc-error)]">{errors.closedDatesText.message}</p>
              )}
            </fieldset>
            <details className={styles.calendarImpact}>
              <summary>{t('calendarImpactTitle')}</summary>
              <p className={`${styles.copy} mt-2`}>{t('calendarImpactHelp')}</p>
            </details>
            {canEdit && (
              <div className={styles.formActions}>
                <Button type="submit" isLoading={isSubmitting}>
                  {t('saveCalendar')}
                </Button>
              </div>
            )}
          </form>
          <aside className={styles.panel} aria-label={t('availabilityTitle')}>
            <div className={styles.panelHeader}>
              <div>
                <h3 className={styles.panelTitle}>
                  <Clock3 size={20} className={styles.icon} aria-hidden="true" />
                  {t('availabilityTitle')}
                </h3>
                <p className={`${styles.copy} mt-2`}>{t('availabilityHelp')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input
                label={t('calendarCheckAt')}
                type="datetime-local"
                value={at}
                onChange={(event) => {
                  setAt(event.target.value);
                  setCheckError(null);
                }}
                error={checkError ?? undefined}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={checkAvailability}>
                  <Search size={16} aria-hidden="true" />
                  {t('checkCalendar')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCheckError(null);
                    setQueryAt(new Date().toISOString());
                    setRetry((value) => value + 1);
                  }}
                >
                  {t('checkNow')}
                </Button>
              </div>
              <p className="text-xs leading-5 text-[var(--sc-text-secondary)]">
                {t('availabilitySavedCalendar')}
              </p>
              {canEdit && hasUnsavedChanges && (
                <Alert variant="warning">{t('availabilityUnsaved')}</Alert>
              )}
            </div>
            {needsCheck ? (
              <p className={`${styles.checkPrompt} mt-5`} role="status">
                {t('availabilityNeedsCheck')}
              </p>
            ) : (
              <div className={`${styles.stack} mt-5`} aria-live="polite">
                <p className={styles.resultTime}>
                  {t('availabilityCheckedAt', {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: calendar.timeZone,
                    }).format(new Date(calendar.checkedAt)),
                  })}
                </p>
                <div className={styles.capacity}>
                  <p className={styles.subtitle}>{t('capacityUsageTitle')}</p>
                  <p className={styles.capacityNumbers}>
                    <span>
                      <strong>{calendar.capacityUsed.toLocaleString(locale)}</strong> /{' '}
                      {calendar.dailyCapacity.toLocaleString(locale)}
                    </span>
                    <span className="text-xs text-[var(--sc-text-secondary)]">
                      {t('capacityRemaining', {
                        count: calendar.capacityRemaining.toLocaleString(locale),
                      })}
                    </span>
                  </p>
                  <progress
                    className={styles.progress}
                    max={calendar.dailyCapacity}
                    value={Math.min(calendar.capacityUsed, calendar.dailyCapacity)}
                    aria-label={t('calendarCapacity', {
                      used: calendar.capacityUsed,
                      total: calendar.dailyCapacity,
                    })}
                  />
                  <p className="mt-2 text-xs leading-5 text-[var(--sc-text-secondary)]">
                    {t('capacityUsageHelp')}
                  </p>
                </div>
                <dl>
                  {[
                    {
                      label: 'intakeEligible',
                      eligible: calendar.intakeEligible,
                      reasons: calendar.reasons.filter(
                        (reason) => reason !== 'CAPACITY_REACHED' && reason !== 'AFTER_CUTOFF',
                      ),
                    },
                    {
                      label: 'allocationEligible',
                      eligible: calendar.allocationEligible,
                      reasons: calendar.reasons.filter((reason) => reason !== 'AFTER_CUTOFF'),
                    },
                    {
                      label: 'sameDayHandover',
                      eligible: calendar.sameDayHandoverEligible,
                      reasons: calendar.reasons,
                    },
                  ].map((item) => (
                    <div key={item.label} className={styles.eligibility}>
                      <dt>{t(item.label)}</dt>
                      <dd>
                        <Badge
                          status={item.eligible ? 'success' : 'warning'}
                          label={t(item.eligible ? 'eligible' : 'unavailable')}
                        />
                      </dd>
                      {!item.eligible && item.reasons.length > 0 && (
                        <dd className={styles.eligibilityReasons}>
                          <ul>
                            {item.reasons.map((reason) => (
                              <li key={reason}>{t(`calendarReasons.${reason}`)}</li>
                            ))}
                          </ul>
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
