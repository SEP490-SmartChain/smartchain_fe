import React from 'react';

import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, ...props }, ref) => (
    <label className="group flex cursor-pointer items-center gap-3">
      <span className="relative inline-flex items-center">
        <input type="checkbox" className="peer sr-only" ref={ref} {...props} />
        <span
          className={cn(
            'h-[22px] w-10 rounded-full bg-[var(--sc-border-strong)] transition-colors duration-200',
            'peer-checked:bg-[var(--sc-primary)] peer-focus-visible:shadow-[var(--sc-shadow-focus)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            className,
          )}
        />
        <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-[18px]" />
      </span>
      {label && (
        <span
          className={cn(
            'text-sm font-medium text-[var(--sc-text-secondary)] transition-colors group-hover:text-[var(--sc-text-primary)]',
            props.disabled && 'text-[var(--sc-text-disabled)]',
          )}
        >
          {label}
        </span>
      )}
    </label>
  ),
);
Switch.displayName = 'Switch';
