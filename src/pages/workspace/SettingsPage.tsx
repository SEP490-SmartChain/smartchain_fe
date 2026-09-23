import { useEffect } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Tabs, UnderConstruction } from '@/components/Common';
import { CarrierConnectionsManager } from '@/features/catalog';
import ProfileSettings from '@/features/settings/components/ProfileSettings';
import WorkspaceGeneralSettings from '@/features/settings/components/WorkspaceGeneralSettings';
import { WebhookManager } from '@/features/tenants';
import { useAccess } from '@/hooks/useAccess';

const ALL_SETTING_TABS = ['profile', 'general', 'integrations', 'webhooks'] as const;
type SettingTab = (typeof ALL_SETTING_TABS)[number];
const WORKSPACE_TABS: readonly SettingTab[] = ['general', 'integrations', 'webhooks'];

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const navigate = useNavigate();
  const { can } = useAccess();
  const { tab } = useParams<{ tab?: string }>();
  const requestedTab: SettingTab = ALL_SETTING_TABS.includes(tab as SettingTab)
    ? (tab as SettingTab)
    : 'profile';

  const canManageWorkspace = can('workspace.settings.manage');
  const activeTab: SettingTab =
    requestedTab === 'profile' || canManageWorkspace ? requestedTab : 'profile';
  const visibleTabs: SettingTab[] = ['profile', ...(canManageWorkspace ? WORKSPACE_TABS : [])];

  useEffect(() => {
    const isInvalidTab = tab && !ALL_SETTING_TABS.includes(tab as SettingTab);
    const isUnauthorizedWorkspaceTab =
      tab && WORKSPACE_TABS.includes(tab as SettingTab) && !canManageWorkspace;
    if (isInvalidTab || isUnauthorizedWorkspaceTab) {
      navigate('/settings/profile', { replace: true });
    }
  }, [canManageWorkspace, navigate, tab]);

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

      {activeTab === 'general' && <WorkspaceGeneralSettings />}

      {activeTab === 'integrations' && <CarrierConnectionsManager />}

      {activeTab === 'webhooks' && <WebhookManager />}
    </div>
  );
}
