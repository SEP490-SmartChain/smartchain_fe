import React from 'react';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      <label className="group flex cursor-pointer items-center gap-2.5">
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            ref={ref}
            className={cn(
              'peer h-4 w-4 cursor-pointer appearance-none rounded border border-[var(--sc-border-strong)] bg-white transition-[background-color,border-color,box-shadow] duration-150',
              'hover:border-[var(--sc-primary)] checked:border-[var(--sc-primary)] checked:bg-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)] focus:outline-none',
              'disabled:cursor-not-allowed disabled:border-[var(--sc-border-default)] disabled:bg-[var(--sc-bg-secondary)]',
              error &&
                'border-[var(--sc-error)] checked:border-[var(--sc-error)] checked:bg-[var(--sc-error)]',
              className,
            )}
            {...props}
          />
          <Check
            aria-hidden="true"
            size={12}
            strokeWidth={3}
            className="pointer-events-none absolute text-white opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        {label && (
          <span
            className={cn(
              'text-sm leading-[18px] text-[var(--sc-text-secondary)] transition-colors group-hover:text-[var(--sc-text-primary)]',
              props.disabled && 'text-[var(--sc-text-disabled)]',
            )}
          >
            {label}
          </span>
        )}
      </label>
      {error && <span className="ml-6 text-xs text-[var(--sc-error-dark)]">{error}</span>}
    </div>
  ),
);
Checkbox.displayName = 'Checkbox';
