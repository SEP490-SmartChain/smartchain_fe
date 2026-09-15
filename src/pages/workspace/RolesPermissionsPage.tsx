import { useMemo, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import { LoaderCircle, Pencil, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import Modal from '@/components/Common/Modal/Modal';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import { useStaffAccounts, type StaffAccount, type StaffRole } from '@/features/tenants';
import {
  CAPABILITIES,
  WORKSPACE_ROLES,
  type AuthRole,
  type CapabilityDef,
  type CapabilityDomain,
} from '@/lib/accessPolicy';

type PageTab = 'roles' | 'permissions' | 'members';

const PAGE_TABS: PageTab[] = ['roles', 'permissions', 'members'];

const ROLE_NAME_KEYS: Record<AuthRole, string> = {
  SUPER_ADMIN: 'roleSuperAdmin',
  TENANT_ADMIN: 'roleTenantAdmin',
  DISPATCHER: 'roleDispatcher',
  ACCOUNTANT: 'roleAccountant',
};

const ROLE_DESC_KEYS: Partial<Record<AuthRole, string>> = {
  TENANT_ADMIN: 'roleTenantAdminDescription',
  DISPATCHER: 'roleDispatcherDescription',
  ACCOUNTANT: 'roleAccountantDescription',
};

const DOMAIN_ORDER: CapabilityDomain[] = [
  'workspace',
  'iam',
  'carriers',
  'warehouses',
  'catalog',
  'inventory',
  'rules',
  'orders',
  'shipments',
  'reconciliation',
  'analytics',
  'integration',
  'audit',
];

const ROLE_BADGE_TONE: Record<AuthRole, string> = {
  SUPER_ADMIN: 'error',
  TENANT_ADMIN: 'success',
  DISPATCHER: 'info',
  ACCOUNTANT: 'warning',
};

export default function RolesPermissionsPage() {
  const t = useTranslations('RolesPermissions');
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: PageTab = PAGE_TABS.includes(tab as PageTab) ? (tab as PageTab) : 'roles';
  const { accounts, error, isLoading, savingRolesUserId, refetch, updateRoles } = useStaffAccounts({
    search: '',
    role: '',
    status: '',
  });
  const [editingMember, setEditingMember] = useState<StaffAccount | null>(null);
  const [draftRoles, setDraftRoles] = useState<StaffRole[]>([]);
  const [roleSaveError, setRoleSaveError] = useState('');

  const roleLabel = (role: AuthRole) => t(ROLE_NAME_KEYS[role]);

  const roleCapabilities = useMemo(() => {
    const map: Partial<Record<AuthRole, readonly CapabilityDef[]>> = {};
    for (const role of WORKSPACE_ROLES) {
      map[role] = CAPABILITIES.filter((capability) => capability.roles.includes(role));
    }
    return map;
  }, []);

  // Catalog chỉ hiển thị quyền workspace; loại capability nền tảng (platform.*, audit.platform).
  const workspaceCapabilities = useMemo(
    () =>
      CAPABILITIES.filter((capability) => capability.roles.every((role) => role !== 'SUPER_ADMIN')),
    [],
  );

  const capabilitiesByDomain = useMemo(
    () =>
      DOMAIN_ORDER.map((domain) => ({
        domain,
        capabilities: workspaceCapabilities.filter((capability) => capability.domain === domain),
      })).filter((group) => group.capabilities.length > 0),
    [workspaceCapabilities],
  );

  const openRoleEditor = (member: StaffAccount) => {
    setEditingMember(member);
    setDraftRoles([...member.roles]);
    setRoleSaveError('');
  };

  const toggleDraftRole = (role: StaffRole) => {
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  };

  const saveRoles = async () => {
    if (!editingMember) return;
    setRoleSaveError('');
    const changed = await updateRoles(editingMember.userId, draftRoles);
    if (!changed) {
      setRoleSaveError(t('roleSaveError'));
      return;
    }
    toast.success(t('roleSaveSuccess'));
    setEditingMember(null);
  };

  const tabs = PAGE_TABS.map((id) => ({ id, label: t(id) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => navigate(`/roles-permissions/${id}`)}
        />
      </div>

      {activeTab === 'roles' && (
        <section className="space-y-4" aria-label={t('roles')}>
          <p className="m-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
            {t('workspaceRolesHint')}
          </p>
          {WORKSPACE_ROLES.map((role) => {
            const capabilities = roleCapabilities[role] ?? [];
            return (
              <Card key={role}>
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <ShieldCheck size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="m-0 text-base font-medium leading-6 text-[var(--sc-text-primary)]">
                        {roleLabel(role)}
                      </h2>
                      <span className="rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-0.5 font-mono text-xs text-[var(--sc-text-secondary)]">
                        {role}
                      </span>
                    </div>
                    {ROLE_DESC_KEYS[role] && (
                      <p className="mb-0 mt-1.5 text-sm leading-5 text-[var(--sc-text-secondary)]">
                        {t(ROLE_DESC_KEYS[role]!)}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {capabilities.map((capability) => (
                        <span
                          key={capability.code}
                          className="rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-1 font-mono text-xs leading-4 text-[var(--sc-text-secondary)]"
                        >
                          {capability.code}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {activeTab === 'permissions' && (
        <section className="space-y-4" aria-label={t('permissions')}>
          <p className="m-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
            {t('permissionsCatalogHint')}
          </p>
          {capabilitiesByDomain.map(({ domain, capabilities }) => (
            <Card key={domain}>
              <h2 className="m-0 text-sm font-medium leading-5 text-[var(--sc-text-primary)]">
                {t(`domain${capitalize(domain)}`)}
              </h2>
              <ul className="mb-0 mt-3 list-none space-y-2 p-0">
                {capabilities.map((capability) => (
                  <li
                    key={capability.code}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3 py-2"
                  >
                    <span className="font-mono text-sm leading-5 text-[var(--sc-text-primary)]">
                      {capability.code}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {capability.roles.map((role) => (
                        <Badge key={role} status={ROLE_BADGE_TONE[role]} label={roleLabel(role)} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}

      {activeTab === 'members' && (
        <section className="space-y-4" aria-label={t('members')}>
          <p className="m-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
            {t('membersHint')}
          </p>

          {error ? (
            <Alert variant="error" title={t('membersLoadError')}>
              <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            </Alert>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[var(--sc-primary-alpha-08)]">
                      <th className="border-b border-[var(--sc-border-default)] px-4 py-3 text-xs font-normal leading-4 text-[var(--sc-text-primary)]">
                        {t('member')}
                      </th>
                      <th className="border-b border-[var(--sc-border-default)] px-4 py-3 text-xs font-normal leading-4 text-[var(--sc-text-primary)]">
                        {t('assignedRoles')}
                      </th>
                      <th className="w-16 border-b border-[var(--sc-border-default)] px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="bg-[var(--sc-bg-surface)]">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                        >
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle size={17} className="animate-spin" />
                            {t('loading')}
                          </span>
                        </td>
                      </tr>
                    ) : accounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                        >
                          {t('noResults')}
                        </td>
                      </tr>
                    ) : (
                      accounts.map((account) => (
                        <tr
                          key={account.userId}
                          className="border-b border-[var(--sc-border-default)] last:border-b-0"
                        >
                          <td className="px-4 py-3.5">
                            <span className="block text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                              {account.fullName}
                            </span>
                            <span className="mt-0.5 block text-xs leading-4 text-[var(--sc-text-tertiary)]">
                              {account.email}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="flex flex-wrap gap-1.5">
                              {account.roles.map((role) => (
                                <Badge
                                  key={role}
                                  status={ROLE_BADGE_TONE[role as AuthRole] ?? 'default'}
                                  label={roleLabel(role as AuthRole)}
                                />
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <button
                              type="button"
                              aria-label={t('editMemberRoles', { name: account.fullName })}
                              onClick={() => openRoleEditor(account)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-[background-color,color,transform] hover:bg-[var(--sc-primary-alpha-08)] hover:text-[var(--sc-primary-dark)] active:scale-95"
                            >
                              <Pencil size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      )}

      <Modal
        isOpen={editingMember !== null}
        onClose={() => setEditingMember(null)}
        title={t('editRolesTitle')}
      >
        {editingMember && (
          <div className="space-y-5">
            <p className="mb-0 mt-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
              <span className="font-medium text-[var(--sc-text-primary)]">
                {editingMember.fullName}
              </span>
              {' — '}
              {editingMember.email}
            </p>
            <p className="mb-0 text-sm leading-5 text-[var(--sc-text-secondary)]">
              {t('rolesHint')}
            </p>
            <div className="grid gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
              {WORKSPACE_ROLES.map((role) => (
                <Checkbox
                  key={role}
                  label={roleLabel(role)}
                  checked={draftRoles.includes(role)}
                  onChange={() => toggleDraftRole(role)}
                />
              ))}
            </div>
            {roleSaveError && (
              <Alert variant="error" title={t('roleSaveError')}>
                {roleSaveError}
              </Alert>
            )}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setEditingMember(null)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                isLoading={savingRolesUserId === editingMember.userId}
                onClick={() => void saveRoles()}
              >
                {t('saveRoles')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
