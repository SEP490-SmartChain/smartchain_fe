import { NavLink } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';
import { getVisibleNavGroups } from '@/lib/accessPolicy';
import { cn } from '@/lib/utils';

/** Large touch targets keep warehouse tasks one tap away on tablets. */
export function WarehouseNavigation() {
  const { roles } = useAccess();
  const t = useTranslations('Sidebar');
  const items =
    getVisibleNavGroups(roles, false).find((group) => group.key === 'warehouse_ops_heading')
      ?.items ?? [];
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t('warehouse_ops_heading')}
      className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4"
    >
      <div className="mx-auto grid max-w-[var(--sc-content-max)] grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex min-h-12 items-center justify-center rounded-lg border border-[var(--sc-border-default)] px-3 py-3 text-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]',
                isActive
                  ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                  : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]',
              )
            }
          >
            {t(item.key)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
