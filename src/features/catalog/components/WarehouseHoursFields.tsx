import { Controller, type Control, type FieldErrors } from 'react-hook-form';

import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';

import { END_OF_DAY_MINUTE, minuteToTime, timeToMinute } from '../utils/warehouseHours';

import type { CreateWarehouseFormValues } from '../schemas/warehouseSchema';

interface Props {
  control: Control<CreateWarehouseFormValues>;
  errors: FieldErrors<CreateWarehouseFormValues>;
  start: number;
  end: number;
  cutoff: number;
}

export function WarehouseHoursFields({ control, errors, start, end, cutoff }: Props) {
  const t = useTranslations('Warehouses');
  const endOfDay = end === END_OF_DAY_MINUTE;
  const summary = t('hoursExample', {
    start: minuteToTime(start) || '--:--',
    end: endOfDay ? '24:00' : minuteToTime(end) || '--:--',
    cutoff: minuteToTime(cutoff) || '--:--',
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--sc-border-default)] p-4">
      <p className="text-sm font-medium text-[var(--sc-text-primary)]">{t('hoursTitle')}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={control}
          name="operatingStartMinute"
          render={({ field }) => (
            <Input
              type="time"
              label={t('operatingStartLabel')}
              value={minuteToTime(field.value)}
              onChange={(event) => {
                const minute = timeToMinute(event.target.value);
                if (minute !== null) field.onChange(minute);
              }}
              error={errors.operatingStartMinute?.message}
            />
          )}
        />
        <div className="flex flex-col gap-2">
          <Controller
            control={control}
            name="operatingEndMinute"
            render={({ field }) => (
              <>
                <Input
                  type="time"
                  label={t('operatingEndLabel')}
                  value={endOfDay ? '' : minuteToTime(field.value)}
                  disabled={endOfDay}
                  onChange={(event) => {
                    const minute = timeToMinute(event.target.value);
                    if (minute !== null) field.onChange(minute);
                  }}
                  error={errors.operatingEndMinute?.message}
                />
                <Checkbox
                  label={t('endOfDay')}
                  checked={endOfDay}
                  onChange={(event) =>
                    field.onChange(event.target.checked ? END_OF_DAY_MINUTE : 1080)
                  }
                />
              </>
            )}
          />
        </div>
        <Controller
          control={control}
          name="cutoffMinute"
          render={({ field }) => (
            <Input
              type="time"
              label={t('cutoffLabel')}
              value={minuteToTime(field.value)}
              onChange={(event) => {
                const minute = timeToMinute(event.target.value);
                if (minute !== null) field.onChange(minute);
              }}
              error={errors.cutoffMinute?.message}
            />
          )}
        />
      </div>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('cutoffHelp')}</p>
      <p className="text-sm text-[var(--sc-text-secondary)]">{summary}</p>
    </div>
  );
}
