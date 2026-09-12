import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import {
  Check,
  Filter,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRoundCog,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import avatar1 from '@/assets/images/roles/avatar-1.png';
import avatar2 from '@/assets/images/roles/avatar-2.png';
import avatar3 from '@/assets/images/roles/avatar-3.png';
import avatar4 from '@/assets/images/roles/avatar-4.png';
import avatar5 from '@/assets/images/roles/avatar-5.png';
import { Avatar } from '@/components/Common/Avatar/Avatar';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { cn } from '@/lib/utils';

type PageTab = 'roles' | 'permissions' | 'system-users';
type RoleDescriptionKey =
  | 'roleDescSuperAdmin'
  | 'roleDescAdmin'
  | 'roleDescBillingAdmin'
  | 'roleDescProductDesigner'
  | 'roleDescDeveloper'
  | 'roleDescTester'
  | 'roleDescProjectManager'
  | 'roleDescScrumMaster'
  | 'roleDescAuditor'
  | 'roleDescGuest'
  | 'roleDescMarketing';
type PermissionDescriptionKey =
  | 'permissionDescAccountDelete'
  | 'permissionDescAccountView'
  | 'permissionDescAccountUpdate'
  | 'permissionDescAccountEdit'
  | 'permissionDescAccountUser'
  | 'permissionDescAccountSettings'
  | 'permissionDescInvoiceCreate'
  | 'permissionDescInvoiceView'
  | 'permissionDescInvoiceDelete'
  | 'permissionDescInvoiceSend'
  | 'permissionDescAccountCreate'
  | 'permissionDescPricingDeleteView'
  | 'permissionDescPricingUpdate'
  | 'permissionDescRolesDelete'
  | 'permissionDescRolesManage'
  | 'permissionDescDashboardView'
  | 'permissionDescDashboardManage';

interface RoleRecord {
  id: string;
  name: string;
  descriptionKey?: RoleDescriptionKey;
  customDescription?: string;
  assignedUsers: string[];
  permissionIds: string[];
}

interface PermissionRecord {
  id: string;
  name: string;
  descriptionKey?: PermissionDescriptionKey;
  customDescription?: string;
  roleIds: string[];
}

interface SystemUserRecord {
  id: string;
  name: string;
  email: string;
  roleIds: string[];
}

interface EditorState {
  kind: 'role' | 'permission';
  id?: string;
  name: string;
  description: string;
  relationIds: string[];
}

interface DeleteDialogState {
  kind: 'role' | 'permission';
  ids: string[];
  label?: string;
}

const PAGE_TABS: PageTab[] = ['roles', 'permissions', 'system-users'];
const PAGE_SIZE = 10;
const AVATAR_IMAGES = [avatar1, avatar2, avatar3, avatar4, avatar5];

const INITIAL_PERMISSIONS: PermissionRecord[] = [
  {
    id: 'account.delete',
    name: 'account.delete',
    descriptionKey: 'permissionDescAccountDelete',
    roleIds: ['super-admin'],
  },
  {
    id: 'account.view',
    name: 'account.view',
    descriptionKey: 'permissionDescAccountView',
    roleIds: [
      'super-admin',
      'admin',
      'product-designer',
      'developer',
      'tester',
      'project-manager',
      'scrum-master',
      'auditor',
      'guest',
      'marketing',
    ],
  },
  {
    id: 'account.update',
    name: 'account.update',
    descriptionKey: 'permissionDescAccountUpdate',
    roleIds: ['super-admin', 'admin', 'developer', 'tester'],
  },
  {
    id: 'account.edit',
    name: 'account.edit',
    descriptionKey: 'permissionDescAccountEdit',
    roleIds: ['super-admin'],
  },
  {
    id: 'account.user',
    name: 'account.user',
    descriptionKey: 'permissionDescAccountUser',
    roleIds: ['super-admin', 'admin', 'scrum-master'],
  },
  {
    id: 'account.settings',
    name: 'account.settings',
    descriptionKey: 'permissionDescAccountSettings',
    roleIds: ['super-admin', 'product-designer', 'project-manager', 'marketing'],
  },
  {
    id: 'invoice.create',
    name: 'invoice.create',
    descriptionKey: 'permissionDescInvoiceCreate',
    roleIds: ['super-admin', 'admin', 'billing-admin'],
  },
  {
    id: 'invoice.view',
    name: 'invoice.view',
    descriptionKey: 'permissionDescInvoiceView',
    roleIds: [
      'super-admin',
      'admin',
      'billing-admin',
      'tester',
      'project-manager',
      'scrum-master',
      'auditor',
    ],
  },
  {
    id: 'invoice.delete',
    name: 'invoice.delete',
    descriptionKey: 'permissionDescInvoiceDelete',
    roleIds: ['super-admin', 'billing-admin'],
  },
  {
    id: 'invoice.send',
    name: 'invoice.send',
    descriptionKey: 'permissionDescInvoiceSend',
    roleIds: ['super-admin', 'billing-admin', 'auditor'],
  },
  {
    id: 'account.create',
    name: 'account.create',
    descriptionKey: 'permissionDescAccountCreate',
    roleIds: [],
  },
  {
    id: 'pricing.delete.view',
    name: 'pricing.delete.view',
    descriptionKey: 'permissionDescPricingDeleteView',
    roleIds: [],
  },
  {
    id: 'pricing.update',
    name: 'pricing.update',
    descriptionKey: 'permissionDescPricingUpdate',
    roleIds: [],
  },
  {
    id: 'roles.delete',
    name: 'roles.delete',
    descriptionKey: 'permissionDescRolesDelete',
    roleIds: [],
  },
  {
    id: 'roles.create.update.view',
    name: 'roles.create.update.view',
    descriptionKey: 'permissionDescRolesManage',
    roleIds: [],
  },
  {
    id: 'dashboard.view',
    name: 'dashboard.view',
    descriptionKey: 'permissionDescDashboardView',
    roleIds: [],
  },
  {
    id: 'dashboard.update.delete',
    name: 'dashboard.update.delete',
    descriptionKey: 'permissionDescDashboardManage',
    roleIds: [],
  },
];

const INITIAL_ROLES: RoleRecord[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    descriptionKey: 'roleDescSuperAdmin',
    assignedUsers: ['Stacy Reichel'],
    permissionIds: INITIAL_PERMISSIONS.slice(0, 10).map((permission) => permission.id),
  },
  {
    id: 'admin',
    name: 'Admin',
    descriptionKey: 'roleDescAdmin',
    assignedUsers: ['Mr. Roderick Rohan', 'Audrey Leffler MD', 'Allison Mosciski'],
    permissionIds: [
      'account.view',
      'account.update',
      'account.user',
      'invoice.create',
      'invoice.view',
    ],
  },
  {
    id: 'billing-admin',
    name: 'Billing Admin',
    descriptionKey: 'roleDescBillingAdmin',
    assignedUsers: [
      'Maureen Aufderhar',
      'Dr. Drew Stehr',
      'Jenny Kozey',
      'Travis Adams',
      'Stacy Reichel',
    ],
    permissionIds: ['invoice.create', 'invoice.view', 'invoice.delete', 'invoice.send'],
  },
  {
    id: 'product-designer',
    name: 'Product Designer',
    descriptionKey: 'roleDescProductDesigner',
    assignedUsers: [
      'Audrey Leffler MD',
      'Allison Mosciski',
      'Jenny Kozey',
      'Travis Adams',
      'Dr. Drew Stehr',
    ],
    permissionIds: ['account.view', 'account.settings'],
  },
  {
    id: 'developer',
    name: 'Developer',
    descriptionKey: 'roleDescDeveloper',
    assignedUsers: [
      'Mr. Roderick Rohan',
      'Dr. Drew Stehr',
      'Jenny Kozey',
      'Travis Adams',
      'Maureen Aufderhar',
      'Stacy Reichel',
      'Audrey Leffler MD',
    ],
    permissionIds: ['account.view', 'account.update'],
  },
  {
    id: 'tester',
    name: 'Tester',
    descriptionKey: 'roleDescTester',
    assignedUsers: ['Jenny Kozey', 'Travis Adams'],
    permissionIds: ['account.view', 'account.update', 'invoice.view'],
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    descriptionKey: 'roleDescProjectManager',
    assignedUsers: ['Stacy Reichel', 'Mr. Roderick Rohan', 'Allison Mosciski', 'Maureen Aufderhar'],
    permissionIds: ['account.view', 'account.settings', 'invoice.view'],
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    descriptionKey: 'roleDescScrumMaster',
    assignedUsers: ['Dr. Drew Stehr'],
    permissionIds: ['account.view', 'account.user', 'invoice.view'],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    descriptionKey: 'roleDescAuditor',
    assignedUsers: ['Audrey Leffler MD', 'Jenny Kozey', 'Travis Adams'],
    permissionIds: ['account.view', 'invoice.view', 'invoice.send'],
  },
  {
    id: 'guest',
    name: 'Guest',
    descriptionKey: 'roleDescGuest',
    assignedUsers: [
      'Allison Mosciski',
      'Maureen Aufderhar',
      'Dr. Drew Stehr',
      'Travis Adams',
      'Stacy Reichel',
    ],
    permissionIds: ['account.view'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    descriptionKey: 'roleDescMarketing',
    assignedUsers: ['Stacy Reichel', 'Travis Adams'],
    permissionIds: ['account.view', 'account.settings'],
  },
];

const INITIAL_USERS: SystemUserRecord[] = [
  {
    id: 'stacy-reichel',
    name: 'Stacy Reichel',
    email: 'stacy.reichel@saasable.io',
    roleIds: ['super-admin', 'billing-admin', 'developer', 'project-manager', 'guest', 'marketing'],
  },
  {
    id: 'roderick-rohan',
    name: 'Mr. Roderick Rohan',
    email: 'roderick.rohan@saasable.io',
    roleIds: ['admin', 'developer', 'project-manager'],
  },
  {
    id: 'audrey-leffler',
    name: 'Audrey Leffler MD',
    email: 'audrey.leffler@saasable.io',
    roleIds: ['admin', 'product-designer', 'developer', 'auditor'],
  },
  {
    id: 'allison-mosciski',
    name: 'Allison Mosciski',
    email: 'allison.mosciski@saasable.io',
    roleIds: ['admin', 'product-designer', 'project-manager', 'guest'],
  },
  {
    id: 'maureen-aufderhar',
    name: 'Maureen Aufderhar',
    email: 'maureen.aufderhar@saasable.io',
    roleIds: ['billing-admin', 'developer', 'project-manager', 'guest'],
  },
  {
    id: 'drew-stehr',
    name: 'Dr. Drew Stehr',
    email: 'drew.stehr@saasable.io',
    roleIds: ['billing-admin', 'product-designer', 'developer', 'scrum-master', 'guest'],
  },
  {
    id: 'jenny-kozey',
    name: 'Jenny Kozey',
    email: 'jenny.kozey@saasable.io',
    roleIds: ['billing-admin', 'product-designer', 'developer', 'tester', 'auditor'],
  },
  {
    id: 'travis-adams',
    name: 'Travis Adams',
    email: 'travis.adams@saasable.io',
    roleIds: [
      'billing-admin',
      'product-designer',
      'developer',
      'tester',
      'auditor',
      'guest',
      'marketing',
    ],
  },
];

const fieldClassName =
  'w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2.5 text-sm leading-[18px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]';

function AvatarStack({ names }: { names: string[] }) {
  const visible = names.slice(0, 3);
  const extra = names.length - visible.length;

  return (
    <div className="flex min-w-[92px] items-center pl-2" aria-label={names.join(', ')}>
      {visible.map((name, index) => (
        <Avatar
          key={name}
          src={AVATAR_IMAGES[index % AVATAR_IMAGES.length]}
          fallback={name}
          size="md"
          className={cn(
            '-ml-2 rounded-full border-2 border-[var(--sc-bg-surface)] shadow-sm',
            index === 1 && 'bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
            index === 2 && 'bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
          )}
          title={name}
        />
      ))}
      {extra > 0 && (
        <span className="-ml-2 flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-bg-secondary)] px-1 text-[11px] font-medium text-[var(--sc-text-secondary)]">
          +{extra}
        </span>
      )}
    </div>
  );
}

function RelationList({ names }: { names: string[] }) {
  const visible = names.slice(0, 3);
  const extra = names.length - visible.length;

  return (
    <div className="flex max-w-[310px] flex-wrap items-center gap-1.5">
      {visible.map((name) => (
        <span
          key={name}
          className="rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-1 text-xs leading-4 text-[var(--sc-text-secondary)]"
        >
          {name}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-md border border-[var(--sc-primary-light)] bg-[var(--sc-primary-alpha-08)] px-2 py-1 text-xs leading-4 text-[var(--sc-primary-dark)]">
          +{extra}
        </span>
      )}
    </div>
  );
}

export default function RolesPermissionsPage() {
  const t = useTranslations('RolesPermissions');
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: PageTab = PAGE_TABS.includes(tab as PageTab) ? (tab as PageTab) : 'roles';

  const [roles, setRoles] = useState<RoleRecord[]>(INITIAL_ROLES);
  const [permissions, setPermissions] = useState<PermissionRecord[]>(INITIAL_PERMISSIONS);
  const [users, setUsers] = useState<SystemUserRecord[]>(INITIAL_USERS);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [editingUser, setEditingUser] = useState<SystemUserRecord | null>(null);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (tab && !PAGE_TABS.includes(tab as PageTab)) {
      navigate('/roles-permissions/roles', { replace: true });
    }
  }, [navigate, tab]);

  useEffect(() => {
    setSearch('');
    setFilterValue('all');
    setFilterOpen(false);
    setSelectedIds(new Set());
    setCurrentPage(1);
    setOpenMenuId(null);
  }, [activeTab]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = () => setOpenMenuId(null);
    const closeMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeMenuWithKeyboard);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeMenuWithKeyboard);
    };
  }, [openMenuId]);

  const roleDescription = useCallback(
    (role: RoleRecord) =>
      role.customDescription ?? (role.descriptionKey ? t(role.descriptionKey) : ''),
    [t],
  );
  const permissionDescription = useCallback(
    (permission: PermissionRecord) =>
      permission.customDescription ??
      (permission.descriptionKey ? t(permission.descriptionKey) : ''),
    [t],
  );

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return roles.filter((role) => {
      const matchesSearch =
        !query ||
        role.name.toLocaleLowerCase().includes(query) ||
        roleDescription(role).toLocaleLowerCase().includes(query);
      const count = role.permissionIds.length;
      const matchesFilter =
        filterValue === 'all' ||
        (filterValue === 'low' && count <= 2) ||
        (filterValue === 'medium' && count >= 3 && count <= 5) ||
        (filterValue === 'high' && count >= 6);
      return matchesSearch && matchesFilter;
    });
  }, [filterValue, roleDescription, roles, search]);

  const filteredPermissions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return permissions.filter((permission) => {
      const matchesSearch =
        !query ||
        permission.name.toLocaleLowerCase().includes(query) ||
        permissionDescription(permission).toLocaleLowerCase().includes(query);
      const category = permission.name.split('.')[0];
      return matchesSearch && (filterValue === 'all' || filterValue === category);
    });
  }, [filterValue, permissionDescription, permissions, search]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !query ||
        user.name.toLocaleLowerCase().includes(query) ||
        user.email.toLocaleLowerCase().includes(query);
      const matchesFilter =
        filterValue === 'all' ||
        (filterValue === 'assigned' && user.roleIds.length > 0) ||
        (filterValue === 'unassigned' && user.roleIds.length === 0);
      return matchesSearch && matchesFilter;
    });
  }, [filterValue, search, users]);

  const activeRecords = activeTab === 'roles' ? filteredRoles : filteredPermissions;
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleRoles = filteredRoles.slice(pageStart, pageStart + PAGE_SIZE);
  const visiblePermissions = filteredPermissions.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleIds = activeRecords
    .slice(pageStart, pageStart + PAGE_SIZE)
    .map((record) => record.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((recordId) => selectedIds.has(recordId));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleTabChange = (nextTab: string) => {
    if (PAGE_TABS.includes(nextTab as PageTab)) navigate(`/roles-permissions/${nextTab}`);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: PageTab) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentIndex = PAGE_TABS.indexOf(tabId);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + offset + PAGE_TABS.length) % PAGE_TABS.length;
    navigate(`/roles-permissions/${PAGE_TABS[nextIndex]}`);
  };

  const toggleSelected = (recordId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((recordId) => next.delete(recordId));
      else visibleIds.forEach((recordId) => next.add(recordId));
      return next;
    });
  };

  const deleteRoles = (ids: Set<string>) => {
    setRoles((current) => current.filter((role) => !ids.has(role.id)));
    setPermissions((current) =>
      current.map((permission) => ({
        ...permission,
        roleIds: permission.roleIds.filter((roleId) => !ids.has(roleId)),
      })),
    );
    setUsers((current) =>
      current.map((user) => ({
        ...user,
        roleIds: user.roleIds.filter((roleId) => !ids.has(roleId)),
      })),
    );
  };

  const deletePermissions = (ids: Set<string>) => {
    setPermissions((current) => current.filter((permission) => !ids.has(permission.id)));
    setRoles((current) =>
      current.map((role) => ({
        ...role,
        permissionIds: role.permissionIds.filter((permissionId) => !ids.has(permissionId)),
      })),
    );
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteDialog({
      kind: activeTab === 'permissions' ? 'permission' : 'role',
      ids: [...selectedIds],
    });
  };

  const confirmDelete = () => {
    if (!deleteDialog) return;
    const ids = new Set(deleteDialog.ids);
    if (deleteDialog.kind === 'role') deleteRoles(ids);
    else deletePermissions(ids);
    setSelectedIds(new Set());
    setDeleteDialog(null);
  };

  const openAddEditor = () => {
    setValidationError('');
    setEditor({
      kind: activeTab === 'permissions' ? 'permission' : 'role',
      name: '',
      description: '',
      relationIds: [],
    });
  };

  const openRoleEditor = (role: RoleRecord) => {
    setValidationError('');
    setEditor({
      kind: 'role',
      id: role.id,
      name: role.name,
      description: roleDescription(role),
      relationIds: [...role.permissionIds],
    });
  };

  const openPermissionEditor = (permission: PermissionRecord) => {
    setValidationError('');
    setEditor({
      kind: 'permission',
      id: permission.id,
      name: permission.name,
      description: permissionDescription(permission),
      relationIds: [...permission.roleIds],
    });
  };

  const toggleEditorRelation = (relationId: string) => {
    setEditor((current) => {
      if (!current) return current;
      const relationIds = current.relationIds.includes(relationId)
        ? current.relationIds.filter((id) => id !== relationId)
        : [...current.relationIds, relationId];
      return { ...current, relationIds };
    });
  };

  const saveEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const name = editor.name.trim();
    const description = editor.description.trim();
    if (!name || !description) {
      setValidationError(t('requiredFields'));
      return;
    }

    if (editor.kind === 'role') {
      const roleId = editor.id ?? `role-${Date.now()}`;
      const existing = roles.find((role) => role.id === roleId);
      if (!editor.id && roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
        setValidationError(t('roleExists'));
        return;
      }
      const nextRole: RoleRecord = {
        id: roleId,
        name,
        descriptionKey: existing?.descriptionKey,
        customDescription:
          existing && description === roleDescription(existing)
            ? existing.customDescription
            : description,
        assignedUsers: existing?.assignedUsers ?? [],
        permissionIds: editor.relationIds,
      };
      setRoles((current) =>
        existing
          ? current.map((role) => (role.id === roleId ? nextRole : role))
          : [...current, nextRole],
      );
      setPermissions((current) =>
        current.map((permission) => ({
          ...permission,
          roleIds: editor.relationIds.includes(permission.id)
            ? Array.from(new Set([...permission.roleIds, roleId]))
            : permission.roleIds.filter((id) => id !== roleId),
        })),
      );
    } else {
      const permissionId = editor.id ?? name.toLocaleLowerCase().replace(/\s+/g, '.');
      const existing = permissions.find((permission) => permission.id === permissionId);
      if (!editor.id && existing) {
        setValidationError(t('permissionExists'));
        return;
      }
      const nextPermission: PermissionRecord = {
        id: permissionId,
        name,
        descriptionKey: existing?.descriptionKey,
        customDescription:
          existing && description === permissionDescription(existing)
            ? existing.customDescription
            : description,
        roleIds: editor.relationIds,
      };
      setPermissions((current) =>
        existing
          ? current.map((permission) =>
              permission.id === permissionId ? nextPermission : permission,
            )
          : [...current, nextPermission],
      );
      setRoles((current) =>
        current.map((role) => ({
          ...role,
          permissionIds: editor.relationIds.includes(role.id)
            ? Array.from(new Set([...role.permissionIds, permissionId]))
            : role.permissionIds.filter((id) => id !== permissionId),
        })),
      );
    }

    setEditor(null);
  };

  const saveUserRoles = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const previousUser = users.find((user) => user.id === editingUser.id);
    setRoles((current) =>
      current.map((role) => {
        const assignedUsers = role.assignedUsers.filter(
          (name) => name !== previousUser?.name && name !== editingUser.name,
        );
        if (editingUser.roleIds.includes(role.id)) assignedUsers.push(editingUser.name);
        return { ...role, assignedUsers };
      }),
    );
    setUsers((current) => current.map((user) => (user.id === editingUser.id ? editingUser : user)));
    setEditingUser(null);
  };

  const toolbarFilterOptions =
    activeTab === 'roles'
      ? [
          { value: 'all', label: t('allPermissionCounts') },
          { value: 'low', label: t('oneToTwoPermissions') },
          { value: 'medium', label: t('threeToFivePermissions') },
          { value: 'high', label: t('sixPlusPermissions') },
        ]
      : activeTab === 'permissions'
        ? [
            { value: 'all', label: t('allCategories') },
            { value: 'account', label: t('accountCategory') },
            { value: 'invoice', label: t('invoiceCategory') },
            { value: 'pricing', label: t('pricingCategory') },
            { value: 'roles', label: t('rolesCategory') },
            { value: 'dashboard', label: t('dashboardCategory') },
          ]
        : [
            { value: 'all', label: t('allAssignments') },
            { value: 'assigned', label: t('hasAssignedRole') },
            { value: 'unassigned', label: t('hasNoAssignedRole') },
          ];

  const tableHeaderClass =
    'border-b border-[var(--sc-border-default)] px-4 py-3 text-xs font-normal leading-4 text-[var(--sc-text-primary)]';
  const tabItems: Array<{ id: PageTab; label: string }> = [
    { id: 'roles', label: t('roles') },
    { id: 'permissions', label: t('permissions') },
    { id: 'system-users', label: t('systemUsers') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div
          role="tablist"
          aria-label={t('roles')}
          className="flex min-w-0 flex-1 gap-7 overflow-x-auto border-b border-[var(--sc-border-default)]"
        >
          {tabItems.map((item) => {
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`roles-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`roles-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => handleTabChange(item.id)}
                onKeyDown={(event) => handleTabKeyDown(event, item.id)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-0.5 pb-3 pt-1 text-lg font-normal leading-[22px] transition-[border-color,color] duration-150',
                  selected
                    ? 'border-[var(--sc-primary)] text-[var(--sc-text-primary)]'
                    : 'border-transparent text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary-light)] hover:text-[var(--sc-text-primary)]',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {activeTab !== 'system-users' && (
          <Button type="button" onClick={openAddEditor} className="mb-2.5 shrink-0">
            <Plus size={17} aria-hidden="true" />
            {t('addNew')}
          </Button>
        )}
      </div>

      <section
        id={`roles-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`roles-tab-${activeTab}`}
        className="sc-surface overflow-hidden"
        aria-label={
          activeTab === 'roles'
            ? t('roles')
            : activeTab === 'permissions'
              ? t('permissions')
              : t('systemUsers')
        }
      >
        <div className="flex min-h-[58px] items-center border-b border-[var(--sc-border-default)] px-3 sm:px-4">
          {activeTab !== 'system-users' && (
            <>
              <button
                type="button"
                aria-label={t('deleteSelected')}
                title={t('deleteSelected')}
                disabled={selectedIds.size === 0}
                onClick={deleteSelected}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sc-text-tertiary)] transition-[background-color,color,transform] hover:bg-[var(--sc-error-bg)] hover:text-[var(--sc-error)] active:scale-95 disabled:pointer-events-none disabled:opacity-35"
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
              <span className="mx-3 h-6 w-px bg-[var(--sc-border-default)]" />
            </>
          )}
          <label className="relative flex min-w-0 max-w-[460px] flex-1 items-center">
            <span className="sr-only">{t('searchHere')}</span>
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-1 text-[var(--sc-text-tertiary)]"
            />
            <input
              type="search"
              value={search}
              placeholder={t('searchHere')}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedIds(new Set());
                setCurrentPage(1);
              }}
              className="h-10 w-full border-0 bg-transparent pl-9 pr-3 text-base font-normal leading-5 text-[var(--sc-text-primary)] outline-none placeholder:text-[var(--sc-text-tertiary)] focus-visible:shadow-none"
            />
          </label>
          <button
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((current) => !current)}
            className={cn(
              'ml-auto flex h-9 items-center gap-2 rounded-lg px-3 text-base font-normal leading-5 text-[var(--sc-text-primary)] transition-colors hover:bg-[var(--sc-primary-alpha-08)]',
              filterOpen && 'bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary-dark)]',
            )}
          >
            <Filter size={17} aria-hidden="true" />
            {t('filter')}
            {filterValue !== 'all' && (
              <span className="h-2 w-2 rounded-full bg-[var(--sc-primary)]" aria-hidden="true" />
            )}
          </button>
        </div>

        {filterOpen && (
          <div className="sc-card-enter flex flex-wrap items-center gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
            <div className="w-full sm:w-64">
              <Select
                aria-label={t('filter')}
                value={filterValue}
                options={toolbarFilterOptions}
                onChange={(event) => {
                  setFilterValue(event.target.value);
                  setSelectedIds(new Set());
                  setCurrentPage(1);
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={filterValue === 'all'}
              onClick={() => {
                setFilterValue('all');
                setSelectedIds(new Set());
                setCurrentPage(1);
              }}
            >
              {t('resetFilter')}
            </Button>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--sc-primary-alpha-08)]">
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={allVisibleSelected}
                      disabled={visibleRoles.length === 0}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className={cn(tableHeaderClass, 'min-w-44')}>{t('roleName')}</th>
                  <th className={cn(tableHeaderClass, 'min-w-[320px]')}>{t('description')}</th>
                  <th className={cn(tableHeaderClass, 'min-w-44')}>{t('assignedUsers')}</th>
                  <th className={cn(tableHeaderClass, 'min-w-32 text-center')}>
                    {t('permissionCount')}
                  </th>
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-3 py-3" />
                </tr>
              </thead>
              <tbody className="bg-[var(--sc-bg-surface)]">
                {visibleRoles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  visibleRoles.map((role) => (
                    <tr
                      key={role.id}
                      className="h-[69px] border-b border-[var(--sc-border-default)] transition-colors last:border-b-0 hover:bg-[var(--sc-primary-alpha-08)]"
                    >
                      <td className="px-4 py-4">
                        <Checkbox
                          aria-label={t('selectItem', { name: role.name })}
                          checked={selectedIds.has(role.id)}
                          onChange={() => toggleSelected(role.id)}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                        {role.name}
                      </td>
                      <td className="px-4 py-4 text-sm leading-[18px] text-[var(--sc-text-secondary)]">
                        {roleDescription(role)}
                      </td>
                      <td className="px-4 py-4">
                        <AvatarStack names={role.assignedUsers} />
                      </td>
                      <td className="px-4 py-4 text-center text-sm leading-[18px] text-[var(--sc-text-primary)]">
                        {role.permissionIds.length}
                      </td>
                      <td className="relative px-3 py-4 text-right">
                        <button
                          type="button"
                          aria-label={t('actionsFor', { name: role.name })}
                          aria-haspopup="menu"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((current) => (current === role.id ? null : role.id));
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                        >
                          <MoreVertical size={17} />
                        </button>
                        {openMenuId === role.id && (
                          <div
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                            className="sc-popover-enter absolute right-3 top-12 z-30 w-36 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1.5 text-left shadow-[var(--sc-shadow-popover)]"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                openRoleEditor(role);
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]"
                            >
                              <Pencil size={15} />
                              {t('edit')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setDeleteDialog({
                                  kind: 'role',
                                  ids: [role.id],
                                  label: role.name,
                                });
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--sc-error)] hover:bg-[var(--sc-error-bg)]"
                            >
                              <Trash2 size={15} />
                              {t('delete')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--sc-primary-alpha-08)]">
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={allVisibleSelected}
                      disabled={visiblePermissions.length === 0}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className={cn(tableHeaderClass, 'min-w-48')}>{t('permissionName')}</th>
                  <th className={cn(tableHeaderClass, 'min-w-[360px]')}>{t('description')}</th>
                  <th className={cn(tableHeaderClass, 'min-w-[280px]')}>{t('roles')}</th>
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-3 py-3" />
                </tr>
              </thead>
              <tbody className="bg-[var(--sc-bg-surface)]">
                {visiblePermissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  visiblePermissions.map((permission) => {
                    const assignedRoleNames = permission.roleIds
                      .map((roleId) => roles.find((role) => role.id === roleId)?.name)
                      .filter((name): name is string => Boolean(name));
                    return (
                      <tr
                        key={permission.id}
                        className="h-[69px] border-b border-[var(--sc-border-default)] transition-colors last:border-b-0 hover:bg-[var(--sc-primary-alpha-08)]"
                      >
                        <td className="px-4 py-4">
                          <Checkbox
                            aria-label={t('selectItem', { name: permission.name })}
                            checked={selectedIds.has(permission.id)}
                            onChange={() => toggleSelected(permission.id)}
                          />
                        </td>
                        <td className="px-4 py-4 text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                          {permission.name}
                        </td>
                        <td className="px-4 py-4 text-sm leading-[18px] text-[var(--sc-text-secondary)]">
                          {permissionDescription(permission)}
                        </td>
                        <td className="px-4 py-4">
                          <RelationList names={assignedRoleNames} />
                        </td>
                        <td className="relative px-3 py-4 text-right">
                          <button
                            type="button"
                            aria-label={t('actionsFor', { name: permission.name })}
                            aria-haspopup="menu"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId((current) =>
                                current === permission.id ? null : permission.id,
                              );
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                          >
                            <MoreVertical size={17} />
                          </button>
                          {openMenuId === permission.id && (
                            <div
                              role="menu"
                              onClick={(event) => event.stopPropagation()}
                              className="sc-popover-enter absolute right-3 top-12 z-30 w-36 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1.5 text-left shadow-[var(--sc-shadow-popover)]"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  openPermissionEditor(permission);
                                  setOpenMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]"
                              >
                                <Pencil size={15} />
                                {t('edit')}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setDeleteDialog({
                                    kind: 'permission',
                                    ids: [permission.id],
                                    label: permission.name,
                                  });
                                  setOpenMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--sc-error)] hover:bg-[var(--sc-error-bg)]"
                              >
                                <Trash2 size={15} />
                                {t('delete')}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'system-users' && (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1760px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--sc-primary-alpha-08)]">
                  <th
                    className={cn(
                      tableHeaderClass,
                      'sticky left-0 z-10 min-w-64 bg-[var(--sc-primary-alpha-08)]',
                    )}
                  >
                    {t('profile')}
                  </th>
                  {roles.map((role) => (
                    <th key={role.id} className={cn(tableHeaderClass, 'min-w-36 text-center')}>
                      {role.name}
                    </th>
                  ))}
                  <th className="w-16 border-b border-[var(--sc-border-default)] px-3 py-3" />
                </tr>
              </thead>
              <tbody className="bg-[var(--sc-bg-surface)]">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={roles.length + 2}
                      className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, userIndex) => (
                    <tr
                      key={user.id}
                      className="group h-[69px] border-b border-[var(--sc-border-default)] transition-colors last:border-b-0 hover:bg-[var(--sc-primary-alpha-08)]"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[var(--sc-bg-surface)] px-4 py-3.5 text-left font-normal group-hover:bg-[var(--sc-primary-alpha-08)]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar
                            src={AVATAR_IMAGES[userIndex % AVATAR_IMAGES.length]}
                            fallback={user.name}
                            size="lg"
                            className="rounded-full border-[var(--sc-border-default)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                              {user.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--sc-text-tertiary)]">
                              {user.email}
                            </span>
                          </span>
                        </div>
                      </th>
                      {roles.map((role) => {
                        const assigned = user.roleIds.includes(role.id);
                        return (
                          <td key={role.id} className="px-4 py-3.5 text-center">
                            <span
                              className={cn(
                                'mx-auto flex h-7 w-7 items-center justify-center rounded-full border',
                                assigned
                                  ? 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]'
                                  : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-tertiary)]',
                              )}
                              title={assigned ? t('roleAssigned') : t('roleNotAssigned')}
                              aria-label={`${user.name}, ${role.name}: ${
                                assigned ? t('roleAssigned') : t('roleNotAssigned')
                              }`}
                            >
                              {assigned ? <Check size={15} strokeWidth={2.5} /> : <X size={14} />}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3.5 text-right">
                        <button
                          type="button"
                          aria-label={t('editUserRoles', { name: user.name })}
                          onClick={() => setEditingUser({ ...user, roleIds: [...user.roleIds] })}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-[background-color,color,transform] hover:bg-[var(--sc-primary-alpha-08)] hover:text-[var(--sc-primary-dark)] active:scale-95"
                        >
                          <UserRoundCog size={17} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab !== 'system-users' && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </section>

      <Modal
        isOpen={editor !== null}
        onClose={() => setEditor(null)}
        title={
          editor?.kind === 'role'
            ? editor.id
              ? t('editRole')
              : t('addRole')
            : editor?.id
              ? t('editPermission')
              : t('addPermission')
        }
        width="620px"
      >
        {editor && (
          <form onSubmit={saveEditor} className="space-y-5">
            <Input
              required
              autoFocus
              label={editor.kind === 'role' ? t('roleName') : t('permissionName')}
              value={editor.name}
              placeholder={
                editor.kind === 'role' ? t('roleNamePlaceholder') : t('permissionNamePlaceholder')
              }
              onChange={(event) => {
                setValidationError('');
                setEditor((current) =>
                  current ? { ...current, name: event.target.value } : current,
                );
              }}
            />
            <label className="block">
              <span className="mb-2 block text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                {t('description')}
                <span className="ml-1 text-[var(--sc-error)]">*</span>
              </span>
              <textarea
                required
                rows={3}
                value={editor.description}
                placeholder={t('descriptionPlaceholder')}
                onChange={(event) => {
                  setValidationError('');
                  setEditor((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  );
                }}
                className={cn(fieldClassName, 'min-h-24 resize-y')}
              />
            </label>
            <fieldset>
              <legend className="mb-3 text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                {editor.kind === 'role' ? t('assignPermissions') : t('assignRoles')}
              </legend>
              <div className="grid max-h-52 gap-2.5 overflow-y-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 sm:grid-cols-2">
                {(editor.kind === 'role' ? permissions : roles).map((relation) => (
                  <Checkbox
                    key={relation.id}
                    label={relation.name}
                    checked={editor.relationIds.includes(relation.id)}
                    onChange={() => toggleEditorRelation(relation.id)}
                  />
                ))}
              </div>
            </fieldset>
            {validationError && (
              <p role="alert" className="m-0 text-sm text-[var(--sc-error)]">
                {validationError}
              </p>
            )}
            <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
              <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit">{editor.id ? t('saveChanges') : t('create')}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={deleteDialog !== null}
        onClose={() => setDeleteDialog(null)}
        title={
          deleteDialog?.ids.length && deleteDialog.ids.length > 1
            ? t('deleteSelectedTitle')
            : deleteDialog?.kind === 'permission'
              ? t('deletePermission')
              : t('deleteRole')
        }
        width="480px"
      >
        {deleteDialog && (
          <div>
            <h4 className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">
              {t('deleteConfirm')}
            </h4>
            <p className="mb-0 mt-2 text-sm leading-5 text-[var(--sc-text-secondary)]">
              {deleteDialog.ids.length > 1
                ? t('deleteMultipleDescription', { count: deleteDialog.ids.length })
                : deleteDialog.kind === 'role'
                  ? t('deleteRoleDescription', { name: deleteDialog.label ?? '' })
                  : t('deletePermissionDescription', { name: deleteDialog.label ?? '' })}
            </p>
            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
              <Button type="button" variant="secondary" onClick={() => setDeleteDialog(null)}>
                {t('cancel')}
              </Button>
              <Button type="button" variant="danger" onClick={confirmDelete}>
                {t('delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        title={t('editUserRolesTitle')}
        width="560px"
      >
        {editingUser && (
          <form onSubmit={saveUserRoles} className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
              <Avatar
                fallback={editingUser.name}
                size="lg"
                className="rounded-full border-[var(--sc-border-default)]"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--sc-text-primary)]">
                  {editingUser.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--sc-text-tertiary)]">
                  {editingUser.email}
                </span>
              </span>
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                {t('assignRoles')}
              </legend>
              <div className="grid max-h-64 gap-2.5 overflow-y-auto rounded-xl border border-[var(--sc-border-default)] p-4 sm:grid-cols-2">
                {roles.map((role) => (
                  <Checkbox
                    key={role.id}
                    label={role.name}
                    checked={editingUser.roleIds.includes(role.id)}
                    onChange={() =>
                      setEditingUser((current) => {
                        if (!current) return current;
                        const roleIds = current.roleIds.includes(role.id)
                          ? current.roleIds.filter((roleId) => roleId !== role.id)
                          : [...current.roleIds, role.id];
                        return { ...current, roleIds };
                      })
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit">{t('saveChanges')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
