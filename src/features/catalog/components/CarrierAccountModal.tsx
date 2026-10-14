import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import { carrierAccountApi, type CarrierAccount } from '../api/carrierAccountApi';

import type { CarrierSummary } from '../types/carrierCatalog.types';

type WarehouseOption = { id: string; code: string; name: string };
const pickupFields = [
  'pick_name',
  'pick_tel',
  'pick_address',
  'pick_province',
  'pick_district',
  'pick_ward',
] as const;

export function CarrierAccountModal({
  account,
  carriers,
  warehouses,
  onClose,
  onSaved,
}: {
  account: CarrierAccount | null;
  carriers: CarrierSummary[];
  warehouses: WarehouseOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('CarrierAccounts');
  const [error, setError] = useState(false);
  const schema = z
    .object({
      warehouseId: z.string().uuid(t('required')),
      carrierId: z.string().uuid(t('required')),
      apiToken: z.string().max(500, t('invalidToken')),
      shopId: z.string().max(50, t('invalidShop')),
      partnerCode: z.string().regex(/^[A-Za-z0-9_-]{0,50}$/, t('invalidPartnerCode')),
      pick_address_id: z.string(),
      pick_name: z.string(),
      pick_tel: z.string(),
      pick_address: z.string(),
      pick_province: z.string(),
      pick_district: z.string(),
      pick_ward: z.string(),
    })
    .superRefine((values, ctx) => {
      const code =
        account?.orcaCarrier.code ??
        carriers.find((carrier) => carrier.id === values.carrierId)?.code;
      if (!code || !['GHN', 'GHTK'].includes(code)) {
        ctx.addIssue({ code: 'custom', path: ['carrierId'], message: t('required') });
      }
      if ((!account || values.apiToken.length > 0) && values.apiToken.trim().length < 4) {
        ctx.addIssue({ code: 'custom', path: ['apiToken'], message: t('invalidToken') });
      }
      if (code === 'GHN' && !/^[A-Za-z0-9_-]{1,50}$/.test(values.shopId)) {
        ctx.addIssue({ code: 'custom', path: ['shopId'], message: t('invalidShop') });
      }
      if (code === 'GHTK' && !/^[0-9]{1,50}$/.test(values.pick_address_id)) {
        ctx.addIssue({ code: 'custom', path: ['pick_address_id'], message: t('invalidPickup') });
      }
    });
  type FormValues = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      warehouseId: account?.warehouseId ?? '',
      carrierId: account?.carrierId ?? '',
      apiToken: '',
      pick_address_id: account?.pickupMapping['pick_address_id'] ?? '',
      shopId: account?.pickupMapping['shop_id'] ?? '',
      partnerCode: '',
      ...Object.fromEntries(
        pickupFields.map((field) => [field, account?.pickupMapping[field] ?? '']),
      ),
    },
  });
  const code =
    account?.orcaCarrier.code ??
    carriers.find((carrier) => carrier.id === watch('carrierId'))?.code;
  const submit = handleSubmit(async (values) => {
    setError(false);
    const credentials = values.apiToken
      ? {
          apiToken: values.apiToken.trim(),
          ...(code === 'GHN' ? { shopId: values.shopId } : {}),
          ...(code === 'GHTK' && values.partnerCode.trim()
            ? { partnerCode: values.partnerCode.trim() }
            : {}),
        }
      : undefined;
    const pickupMapping: Record<string, string> =
      code === 'GHN'
        ? { shop_id: values.shopId }
        : { pick_address_id: values.pick_address_id.trim() };
    try {
      if (account) await carrierAccountApi.update(account.id, { credentials, pickupMapping });
      else if (credentials) {
        await carrierAccountApi.create({
          warehouseId: values.warehouseId,
          carrierId: values.carrierId,
          credentials,
          pickupMapping,
        });
      }
      onSaved();
    } catch {
      setError(true);
    }
  });
  return (
    <Modal
      isOpen
      title={t(account ? 'edit' : 'create')}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      width="560px"
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && (
          <Alert variant="error" title={t('saveFailed')}>
            {t('verifyHint')}
          </Alert>
        )}
        {account ? (
          <>
            <Input
              label={t('warehouse')}
              value={
                warehouses.find((row) => row.id === account.warehouseId)?.name ??
                account.warehouseId
              }
              readOnly
            />
            <Input label={t('carrier')} value={account.orcaCarrier.name} readOnly />
            <input type="hidden" {...register('warehouseId')} />
            <input type="hidden" {...register('carrierId')} />
          </>
        ) : (
          <>
            <Select
              label={t('warehouse')}
              options={warehouses.map((row) => ({
                value: row.id,
                label: `${row.code} — ${row.name}`,
              }))}
              {...register('warehouseId')}
              error={errors.warehouseId?.message}
              disabled={isSubmitting}
            />
            <Select
              label={t('carrier')}
              options={carriers.map((row) => ({ value: row.id, label: row.name }))}
              {...register('carrierId')}
              error={errors.carrierId?.message}
              disabled={isSubmitting}
            />
          </>
        )}
        <Input
          label={t('token')}
          type="password"
          autoComplete="new-password"
          maxLength={500}
          {...register('apiToken')}
          error={errors.apiToken?.message}
          helperText={account ? t('tokenEditHint') : t('verifyHint')}
          disabled={isSubmitting}
        />
        {code === 'GHN' && (
          <Input
            label={t('shopId')}
            maxLength={50}
            {...register('shopId')}
            error={errors.shopId?.message}
            disabled={isSubmitting}
          />
        )}
        {code === 'GHTK' && (
          <Input
            label={t('partnerCode')}
            helperText={t('partnerCodeHint')}
            maxLength={50}
            {...register('partnerCode')}
            error={errors.partnerCode?.message}
            disabled={isSubmitting}
          />
        )}
        {code === 'GHTK' && (
          <Input
            label={t('pickupAddressId')}
            helperText={t('pickupAddressHint')}
            {...register('pick_address_id')}
            error={errors.pick_address_id?.message}
            disabled={isSubmitting}
          />
        )}
        <div className="flex justify-end gap-2">
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
