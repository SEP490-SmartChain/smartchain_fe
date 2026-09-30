import { useEffect } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common';
import { CarrierConnectionsManager } from '@/features/catalog';
import ProfileSettings from '@/features/settings/components/ProfileSettings';
import WorkspaceGeneralSettings from '@/features/settings/components/WorkspaceGeneralSettings';
import { ApiKeyManager, WebhookManager } from '@/features/tenants';
import { useAccess } from '@/hooks/useAccess';

const ALL_SETTING_TABS = ['profile', 'general', 'integrations', 'api-keys', 'webhooks'] as const;
type SettingTab = (typeof ALL_SETTING_TABS)[number];
const WORKSPACE_TABS: readonly { id: SettingTab; capability: string }[] = [
  { id: 'general', capability: 'workspace.settings.manage' },
  { id: 'integrations', capability: 'carriers.credentials.manage' },
  { id: 'api-keys', capability: 'apikey.manage' },
  { id: 'webhooks', capability: 'workspace.settings.manage' },
];
export default function SettingsPage() {
  const t = useTranslations('Settings');
  const navigate = useNavigate();
  const { can } = useAccess();
  const { tab } = useParams<{ tab?: string }>();
  const requestedTab: SettingTab = ALL_SETTING_TABS.includes(tab as SettingTab)
    ? (tab as SettingTab)
    : 'profile';

  const visibleTabs: SettingTab[] = [
    'profile',
    ...WORKSPACE_TABS.filter(({ capability }) => can(capability)).map(({ id }) => id),
  ];
  const activeTab: SettingTab = visibleTabs.includes(requestedTab) ? requestedTab : 'profile';

  useEffect(() => {
    const isInvalidTab = tab && !ALL_SETTING_TABS.includes(tab as SettingTab);
    if (isInvalidTab || (tab && activeTab !== requestedTab)) {
      navigate('/settings/profile', { replace: true });
    }
  }, [activeTab, navigate, requestedTab, tab]);

  const tabs = visibleTabs.map((id) => ({ id, label: t(id) }));

  return (
    <div className="space-y-3 sm:space-y-3.5">
      <h1 className="sr-only">{t('title')}</h1>
      <Tabs
        tabs={tabs}
        activeId={activeTab}
        onChange={(id) => navigate(`/settings/${id}`)}
        className="gap-7 border-b-0 sm:gap-8"
      />

      {activeTab === 'profile' && <ProfileSettings />}

      {activeTab === 'general' && <WorkspaceGeneralSettings />}

      {activeTab === 'integrations' && <CarrierConnectionsManager />}

      {activeTab === 'api-keys' && <ApiKeyManager />}

      {activeTab === 'webhooks' && <WebhookManager />}
    </div>
  );
}
