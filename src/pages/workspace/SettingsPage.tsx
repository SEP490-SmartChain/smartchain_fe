import { useEffect } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardHeader,
  Input,
  Select,
  Switch,
  Tabs,
  UnderConstruction,
} from '@/components/Common';
import ProfileSettings from '@/features/settings/components/ProfileSettings';
import { useAccess } from '@/hooks/useAccess';

const ALL_SETTING_TABS = ['profile', 'general', 'integrations', 'webhooks'] as const;
type SettingTab = (typeof ALL_SETTING_TABS)[number];
const WORKSPACE_TABS: readonly SettingTab[] = ['general', 'integrations', 'webhooks'];

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const navigate = useNavigate();
  const { can } = useAccess();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: SettingTab = ALL_SETTING_TABS.includes(tab as SettingTab)
    ? (tab as SettingTab)
    : 'profile';

  const canManageWorkspace = can('workspace.settings.manage');
  const visibleTabs: SettingTab[] = ['profile', ...(canManageWorkspace ? WORKSPACE_TABS : [])];

  useEffect(() => {
    if (tab && !ALL_SETTING_TABS.includes(tab as SettingTab)) {
      navigate('/settings/profile', { replace: true });
    }
  }, [navigate, tab]);

  const save = () => toast.success(t('saved'));
  const tabs = visibleTabs.map((id) => ({ id, label: t(id) }));

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

      {activeTab === 'integrations' && (
        <Card>
          <CardHeader title={t('integrations')} description={t('integrationsDescription')} />
          <UnderConstruction />
        </Card>
      )}

      {activeTab === 'webhooks' && (
        <Card>
          <CardHeader title={t('webhooks')} description={t('webhooksDescription')} />
          <UnderConstruction />
        </Card>
      )}
    </div>
  );
}
