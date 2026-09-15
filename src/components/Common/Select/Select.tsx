import React from 'react';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
  isPlaceholderDisabled?: boolean;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      isPlaceholderDisabled = true,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const t = useTranslations('Common');
    const reactId = React.useId();
    const selectId = id || reactId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {label}
            {props.required && <span className="ml-1 text-[var(--sc-error)]">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-[42px] w-full appearance-none rounded-lg border bg-[var(--sc-bg-surface)] px-3 py-2 pr-10 text-sm leading-[18px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none',
              'cursor-pointer transition-[border-color,box-shadow,background-color] duration-150',
              'hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
              'disabled:cursor-not-allowed disabled:bg-[var(--sc-bg-secondary)] disabled:text-[var(--sc-text-disabled)]',
              error
                ? 'border-[var(--sc-error)] focus:border-[var(--sc-error)]'
                : 'border-[var(--sc-border-default)]',
              className,
            )}
            aria-invalid={error ? true : props['aria-invalid']}
            {...props}
          >
            <option value="" disabled={isPlaceholderDisabled}>
              {placeholder ?? t('select_option')}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
          />
        </div>

        {error && <p className="mb-0 mt-1.5 text-xs text-[var(--sc-error-dark)]">{error}</p>}
        {helperText && !error && (
          <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">{helperText}</p>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
