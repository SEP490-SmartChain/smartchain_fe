import { useNavigate, useParams } from 'react-router-dom';

import { BellRing, Globe2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Card, CardHeader, Input, Select, Switch, Tabs } from '@/components/Common';
import ProfileSettings from '@/features/settings/components/ProfileSettings';

const settingTabs = [
  'profile',
  'general',
  'pricing',
  'internationalization',
  'authentication',
] as const;
type SettingTab = (typeof settingTabs)[number];

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: SettingTab = settingTabs.includes(tab as SettingTab)
    ? (tab as SettingTab)
    : 'profile';
  const save = () => toast.success(t('saved'));
  const tabs = settingTabs.map((id) => ({ id, label: t(id) }));

  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t('title')}</h1>
      <Tabs
        tabs={tabs}
        activeId={activeTab}
        onChange={(id) => navigate(`/settings/${id}`)}
        className="gap-7 border-b-0 sm:gap-8"
      />

      {activeTab === 'profile' && <ProfileSettings />}

      {activeTab === 'general' && (
        <Card>
          <CardHeader title={t('generalTitle')} description={t('generalDescription')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t('workspaceName')} defaultValue="SmartChain Logistics" />
            <Select
              label={t('defaultWarehouse')}
              defaultValue="north"
              options={[
                { value: 'north', label: t('northHub') },
                { value: 'central', label: t('centralHub') },
                { value: 'south', label: t('southHub') },
              ]}
            />
          </div>
          <div className="mt-6 space-y-4 border-t border-[var(--sc-border-default)] pt-6">
            <Switch defaultChecked label={t('emailNotifications')} />
            <Switch defaultChecked label={t('inventoryAlerts')} />
            <Switch label={t('weeklyDigest')} />
          </div>
          <Button type="button" className="mt-6" onClick={save}>
            <Save size={16} />
            {t('saveChanges')}
          </Button>
        </Card>
      )}

      {activeTab === 'pricing' && (
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { name: t('starter'), price: '$199', description: t('starterDescription') },
            {
              name: t('basic'),
              price: '$699',
              description: t('basicDescription'),
              current: true,
            },
            {
              name: t('enterprise'),
              price: t('contact'),
              description: t('enterpriseDescription'),
            },
          ].map((plan) => (
            <Card key={plan.name} variant={plan.current ? 'elevated' : 'default'}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">
                  {plan.name}
                </h2>
                {plan.current && (
                  <span className="rounded-full bg-[var(--sc-primary-lighter)] px-2.5 py-1 text-xs font-medium text-[var(--sc-primary-dark)]">
                    {t('currentPlan')}
                  </span>
                )}
              </div>
              <p className="mb-0 mt-5 text-3xl font-medium leading-9 text-[var(--sc-text-primary)]">
                {plan.price}
              </p>
              <p className="mb-6 mt-2 text-sm leading-[18px] text-[var(--sc-text-secondary)]">
                {plan.description}
              </p>
              <Button
                type="button"
                variant={plan.current ? 'secondary' : 'outline'}
                className="w-full"
              >
                {plan.current ? t('managePlan') : t('choosePlan')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'internationalization' && (
        <Card>
          <CardHeader title={t('languageAndRegion')} description={t('languageDescription')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('language')}
              defaultValue="vi"
              options={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
            />
            <Select
              label={t('timezone')}
              defaultValue="asia-ho-chi-minh"
              options={[
                { value: 'asia-ho-chi-minh', label: '(GMT+07:00) Ho Chi Minh City' },
                { value: 'asia-bangkok', label: '(GMT+07:00) Bangkok' },
                { value: 'asia-singapore', label: '(GMT+08:00) Singapore' },
              ]}
            />
            <Select
              label={t('dateFormat')}
              defaultValue="dd-mm-yyyy"
              options={[
                { value: 'dd-mm-yyyy', label: 'DD/MM/YYYY' },
                { value: 'mm-dd-yyyy', label: 'MM/DD/YYYY' },
                { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
              ]}
            />
          </div>
          <Button type="button" className="mt-6" onClick={save}>
            <Globe2 size={16} />
            {t('saveChanges')}
          </Button>
        </Card>
      )}

      {activeTab === 'authentication' && (
        <Card>
          <CardHeader
            title={t('authenticationTitle')}
            description={t('authenticationDescription')}
          />
          <div className="divide-y divide-[var(--sc-border-default)]">
            {[
              {
                label: t('twoFactor'),
                description: t('twoFactorDescription'),
                icon: LockKeyhole,
                checked: true,
              },
              {
                label: t('loginAlerts'),
                description: t('loginAlertsDescription'),
                icon: BellRing,
                checked: true,
              },
              {
                label: t('rememberDevices'),
                description: t('rememberDevicesDescription'),
                icon: ShieldCheck,
                checked: false,
              },
            ].map(({ label, description, icon: Icon, checked }) => (
              <div key={label} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--sc-text-primary)]">
                    {label}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-[var(--sc-text-secondary)]">
                    {description}
                  </span>
                </span>
                <Switch defaultChecked={checked} aria-label={label} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
