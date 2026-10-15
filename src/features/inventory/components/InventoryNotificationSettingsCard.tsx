import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';

import {
  inventoryNotificationSettingsApi,
  type InventoryNotificationSetting,
  type InventoryNotificationSettingInput,
} from '../api/inventoryNotificationSettingsApi';

type SettingForm = Omit<InventoryNotificationSettingInput, 'tenantId' | 'warehouseId'>;

const EMPTY: SettingForm = {
  expectedVersion: 0,
  expiryEnabled: true,
  lowStockEnabled: true,
  warningDays: null,
  transitDays: 0,
  bufferDays: 5,
  emailRecipient: null,
  zaloRecipient: null,
  channels: [],
};

function toForm(value: InventoryNotificationSetting): SettingForm {
  return {
    expectedVersion: value.version,
    expiryEnabled: value.expiryEnabled,
    lowStockEnabled: value.lowStockEnabled,
    warningDays: value.warningDays,
    transitDays: value.transitDays,
    bufferDays: value.bufferDays,
    emailRecipient: value.emailRecipient,
    zaloRecipient: value.zaloRecipient,
    channels: value.channels,
  };
}

export function InventoryNotificationSettingsCard() {
  const t = useTranslations('InventoryExpiry');
  const [form, setForm] = useState<SettingForm>(EMPTY);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lowStockAvailable, setLowStockAvailable] = useState(false);

  useEffect(() => {
    let current = true;
    inventoryNotificationSettingsApi
      .get()
      .then((value) => {
        if (!current) return;
        setTenantId(value.tenantId);
        setLowStockAvailable(value.lowStockAvailable);
        setForm(toForm(value));
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const set = <K extends keyof SettingForm>(key: K, value: SettingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(false);
    try {
      const input: InventoryNotificationSettingInput = {
        ...form,
        tenantId,
        warehouseId: null,
      };
      const result =
        form.expectedVersion === 0
          ? await inventoryNotificationSettingsApi.create(input)
          : await inventoryNotificationSettingsApi.update(input);
      setForm(toForm(result));
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: 'EMAIL' | 'ZALO', checked: boolean) =>
    set(
      'channels',
      checked
        ? [...new Set([...form.channels, channel])]
        : form.channels.filter((item) => item !== channel),
    );

  return (
    <section className="sc-surface space-y-4 p-4" aria-label={t('settingsTitle')}>
      <div>
        <h3 className="text-base font-medium">{t('settingsTitle')}</h3>
        <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('settingsDescription')}</p>
      </div>
      {error && <Alert variant="error" title={t('settingsError')} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox
          label={t('expiryEnabled')}
          checked={form.expiryEnabled}
          disabled={loading || saving}
          onChange={(event) => set('expiryEnabled', event.target.checked)}
        />
        <Checkbox
          label={t('lowStockEnabled')}
          checked={form.lowStockEnabled}
          disabled={loading || saving || !lowStockAvailable}
          onChange={(event) => set('lowStockEnabled', event.target.checked)}
        />
        {!lowStockAvailable && (
          <p className="text-sm text-[var(--sc-text-secondary)] sm:col-span-2">
            {t('lowStockUnavailable')}
          </p>
        )}
        <Input
          type="number"
          min={0}
          max={36500}
          label={t('warningDaysSetting')}
          value={form.warningDays ?? ''}
          disabled={loading || saving}
          onChange={(event) =>
            set('warningDays', event.target.value === '' ? null : Number(event.target.value))
          }
        />
        <Input
          aria-required
          type="number"
          min={0}
          max={365}
          label={t('transitDays')}
          value={form.transitDays}
          disabled={loading || saving || !lowStockAvailable}
          onChange={(event) => set('transitDays', Number(event.target.value))}
        />
        <Input
          aria-required
          type="number"
          min={0}
          max={365}
          label={t('bufferDays')}
          value={form.bufferDays}
          disabled={loading || saving || !lowStockAvailable}
          onChange={(event) => set('bufferDays', Number(event.target.value))}
        />
        <Input
          type="email"
          label={t('emailRecipient')}
          aria-required={form.channels.includes('EMAIL')}
          value={form.emailRecipient ?? ''}
          disabled={loading || saving}
          onChange={(event) => set('emailRecipient', event.target.value || null)}
        />
        <Input
          type="tel"
          label={t('zaloRecipient')}
          aria-required={form.channels.includes('ZALO')}
          value={form.zaloRecipient ?? ''}
          disabled={loading || saving}
          onChange={(event) => set('zaloRecipient', event.target.value || null)}
        />
      </div>
      <div className="flex flex-wrap gap-5">
        <Checkbox
          label={t('emailChannel')}
          checked={form.channels.includes('EMAIL')}
          disabled={loading || saving}
          onChange={(event) => toggleChannel('EMAIL', event.target.checked)}
        />
        <Checkbox
          label={t('zaloChannel')}
          checked={form.channels.includes('ZALO')}
          disabled={loading || saving}
          onChange={(event) => toggleChannel('ZALO', event.target.checked)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={loading || saving} onClick={() => void save()}>
          {saving ? t('savingSettings') : t('saveSettings')}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-[var(--sc-success-dark)]">
            {t('settingsSaved')}
          </span>
        )}
      </div>
    </section>
  );
}
