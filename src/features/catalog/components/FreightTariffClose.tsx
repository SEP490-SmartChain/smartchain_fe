import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import { freightTariffApi } from '../api/freightTariffApi';

import type { PurchaseTariff, SellerTariff } from '../schemas/freightTariffSchema';

const schema = z.object({
  end: z
    .string()
    .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
    .refine((value) => {
      const date = new Date(`${value}:00.000Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date > new Date() &&
        date.toISOString().slice(0, 16) === value
      );
    }),
});
export function FreightTariffClose({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: 'purchase' | 'sell';
  row: PurchaseTariff | SellerTariff;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('FreightTariffs');
  const [error, setError] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { end: row.effectiveTo?.slice(0, 16) ?? '' },
  });
  async function save(values: z.infer<typeof schema>) {
    setError(false);
    try {
      await freightTariffApi.close(kind, row, `${values.end}:00.000Z`);
      onSaved();
    } catch {
      setError(true);
    }
  }
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.formState.isSubmitting) onClose();
      }}
      title={t('closeWindow')}
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(save)}>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('closeHelp')}</p>
        {error && <Alert variant="error">{t('saveError')}</Alert>}
        <Input
          aria-required
          label={t('effectiveTo')}
          type="datetime-local"
          error={form.formState.errors.end ? t('validation') : undefined}
          {...form.register('end')}
        />
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t('closeWindow')}
        </Button>
      </form>
    </Modal>
  );
}
