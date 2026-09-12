import React from 'react';

import { ChevronRight } from 'lucide-react';

interface BreadcrumbProps {
  items: string[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs text-[var(--sc-text-tertiary)]"
    >
      {items.map((item, index) => (
        <React.Fragment key={item}>
          {index > 0 && <ChevronRight aria-hidden="true" size={13} />}
          <span
            className={
              index === items.length - 1
                ? 'font-medium text-[var(--sc-text-primary)]'
                : 'transition-colors hover:text-[var(--sc-primary-dark)]'
            }
          >
            {item}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}
