import { useEffect } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/Common';
import { OrderPolicySettings } from '@/features/orders';
import ProfileSettings from '@/features/settings/components/ProfileSettings';
import WorkspaceGeneralSettings from '@/features/settings/components/WorkspaceGeneralSettings';
import { ApiKeyManager, WebhookManager, SellerContractOnboarding } from '@/features/tenants';
import { useAccess } from '@/hooks/useAccess';
import { getSettingsNavigation } from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const navigate = useNavigate();
  const { can, roles } = useAccess();
  const keyContext = useAuthStore((state) =>
    [
      state.revision,
      state.user?.userId,
      state.user?.tenantId,
      state.user?.actorScope,
      state.user?.roles.join(','),
    ].join(':'),
  );
  const { tab } = useParams<{ tab?: string }>();
  const { tabs: visibleTabs, activeTab, redirectTo } = getSettingsNavigation(roles, tab);

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo]);

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

      {activeTab === 'profile' && (
        <ProfileSettings key={keyContext}>
          {can('workspace.settings.manage') && <WorkspaceGeneralSettings />}
          <OrderPolicySettings />
        </ProfileSettings>
      )}

      {activeTab === 'api-keys' && <ApiKeyManager key={keyContext} />}

      {activeTab === 'webhooks' && <WebhookManager />}
      {activeTab === 'contract' && <SellerContractOnboarding key={keyContext} />}
    </div>
  );
}
