import React from 'react';

import { cn } from '@/lib/utils';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      <label className="group flex cursor-pointer items-center gap-2.5">
        <input
          type="radio"
          ref={ref}
          className={cn(
            'h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--sc-border-strong)] bg-white transition-[border-color,box-shadow] duration-150',
            'hover:border-[var(--sc-primary)] checked:border-[5px] checked:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)] focus:outline-none',
            'disabled:cursor-not-allowed disabled:border-[var(--sc-border-default)] disabled:bg-[var(--sc-bg-secondary)]',
            error && 'border-[var(--sc-error)] checked:border-[var(--sc-error)]',
            className,
          )}
          {...props}
        />
        {label && (
          <span
            className={cn(
              'text-sm text-[var(--sc-text-secondary)] transition-colors group-hover:text-[var(--sc-text-primary)]',
              props.disabled && 'text-[var(--sc-text-disabled)]',
            )}
          >
            {label}
          </span>
        )}
      </label>
      {error && <span className="ml-7 text-xs text-[var(--sc-error-dark)]">{error}</span>}
    </div>
  ),
);
Radio.displayName = 'Radio';
