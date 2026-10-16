import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  titleAddon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  actionsClassName?: string;
}

export function PageHeader({
  title,
  description,
  titleAddon,
  actions,
  className,
  actionsClassName,
}: PageHeaderProps) {
  return (
    <header className={cn('sc-page-header', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="sc-page-title">{title}</h1>
          {titleAddon}
        </div>
        {description && <p className="sc-page-copy">{description}</p>}
      </div>
      {actions && <div className={cn('sc-page-header__actions', actionsClassName)}>{actions}</div>}
    </header>
  );
}
