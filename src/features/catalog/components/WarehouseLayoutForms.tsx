import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';

import {
  zoneFormSchema,
  binFormSchema,
  type ZoneFormValues,
  type BinFormValues,
} from '../schemas/warehouseLayoutSchema';

import type { Bin, Zone } from '../api/warehouseLayoutApi';

export function ZoneForm({
  zone,
  onClose,
  onSave,
}: {
  readonly zone: Zone | null;
  readonly onClose: () => void;
  readonly onSave: (values: ZoneFormValues) => Promise<void>;
}) {
  const t = useTranslations('WarehouseLayout');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      code: zone?.code ?? '',
      zoneType: zone?.zoneType ?? 'STORAGE',
      isActive: zone?.isActive ?? true,
    },
  });
  return (
    <Modal isOpen onClose={onClose} title={t(zone ? 'editZone' : 'createZone')}>
      <form className="space-y-4" noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
        <Input
          label={t('code')}
          readOnly={zone !== null}
          {...register('code')}
          error={errors.code ? t('invalid') : undefined}
        />
        <Select
          label={t('zoneType')}
          {...register('zoneType')}
          options={(['RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE'] as const).map((value) => ({
            value,
            label: t(`types.${value}`),
          }))}
        />
        <Checkbox label={t('active')} {...register('isActive')} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function BinForm({
  bin,
  storage,
  onClose,
  onSave,
}: {
  readonly bin: Bin | null;
  readonly storage: boolean;
  readonly onClose: () => void;
  readonly onSave: (values: BinFormValues) => Promise<void>;
}) {
  const t = useTranslations('WarehouseLayout');
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BinFormValues>({
    resolver: zodResolver(binFormSchema),
    defaultValues: {
      code: bin?.code ?? '',
      maxWeightG: bin?.maxWeightG ?? '100000',
      maxVolumeM3: bin?.maxVolumeM3 ?? '1',
      isActive: bin?.isActive ?? true,
      mode: 'single',
      aisleStart: 1,
      aisleCount: 1,
      rackStart: 1,
      rackCount: 1,
      levelStart: 1,
      levelCount: 1,
    },
  });
  const mode = watch('mode');
  return (
    <Modal isOpen onClose={onClose} title={t(bin ? 'editBin' : 'createBin')} width="560px">
      <form className="space-y-4" noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
        {!bin && storage && (
          <Select
            label={t('mode')}
            {...register('mode')}
            options={[
              { value: 'single', label: t('single') },
              { value: 'bulk', label: t('bulk') },
            ]}
          />
        )}
        {mode === 'single' ? (
          <Input
            label={t('code')}
            readOnly={bin !== null}
            {...register('code')}
            error={errors.code ? t('invalid') : undefined}
          />
        ) : (
          <>
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('bulkHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  'aisleStart',
                  'aisleCount',
                  'rackStart',
                  'rackCount',
                  'levelStart',
                  'levelCount',
                ] as const
              ).map((field) => (
                <Input
                  key={field}
                  type="number"
                  min={1}
                  max={99}
                  label={t(field)}
                  {...register(field, { valueAsNumber: true })}
                  error={errors[field] ? t('invalidRange') : undefined}
                />
              ))}
            </div>
          </>
        )}
        <Input
          label={t('maxWeightG')}
          inputMode="numeric"
          {...register('maxWeightG')}
          error={errors.maxWeightG ? t('invalid') : undefined}
        />
        <Input
          label={t('maxVolumeM3')}
          inputMode="decimal"
          {...register('maxVolumeM3')}
          error={errors.maxVolumeM3 ? t('invalid') : undefined}
        />
        {bin && <Checkbox label={t('active')} {...register('isActive')} />}
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('deactivationHint')}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
