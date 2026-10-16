import type { ReactNode } from 'react';

import { PackageSearch } from 'lucide-react';

interface InventoryStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

export function InventoryState({
  title,
  description,
  action,
  icon,
  compact = false,
}: InventoryStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center text-center ${compact ? 'py-2' : 'px-5 py-12 sm:py-16'}`}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
        {icon ?? <PackageSearch size={23} aria-hidden="true" />}
      </div>
      <p className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">{title}</p>
      {description && (
        <p className="mb-0 mt-2 max-w-md text-sm leading-6 text-[var(--sc-text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
