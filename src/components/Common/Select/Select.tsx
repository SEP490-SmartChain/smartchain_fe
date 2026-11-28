import React from 'react';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';

import { useNativeFieldError } from '@/hooks/useNativeFieldError';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Shows the red required marker and sets aria-required without browser-native validation. */
  isRequired?: boolean;
  placeholder?: string;
  isPlaceholderDisabled?: boolean;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error: formError,
      helperText,
      isRequired,
      options,
      placeholder,
      isPlaceholderDisabled = true,
      className,
      id,
      'aria-describedby': describedBy,
      onInvalid,
      onInput,
      ...props
    },
    ref,
  ) => {
    const t = useTranslations('Common');
    const reactId = React.useId();
    const { nativeError, handleInvalid, handleInput } = useNativeFieldError();
    const error = formError || nativeError;
    const selectId = id || reactId;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {label}
            {(isRequired || props.required) && (
              <span aria-hidden="true" className="ml-1 text-[var(--sc-error)]">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-[42px] w-full appearance-none truncate rounded-lg border bg-[var(--sc-bg-surface)] py-0 pl-3 pr-3 text-sm leading-[40px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none',
              'cursor-pointer transition-[border-color,box-shadow,background-color] duration-150',
              'hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
              'disabled:cursor-not-allowed disabled:bg-[var(--sc-bg-secondary)] disabled:text-[var(--sc-text-disabled)]',
              error
                ? 'border-[var(--sc-error)] focus:border-[var(--sc-error)]'
                : 'border-[var(--sc-border-default)]',
              className,
            )}
            aria-required={isRequired || props['aria-required']}
            aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined}
            {...props}
            aria-invalid={error ? true : props['aria-invalid']}
            onInvalid={(event) => {
              handleInvalid(event);
              onInvalid?.(event);
            }}
            onInput={(event) => {
              handleInput(event);
              onInput?.(event);
            }}
          >
            <option value="" disabled={isPlaceholderDisabled}>
              {placeholder ?? t('select_option')}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-[1px] right-[1px] flex w-9 items-center justify-center rounded-r-[7px]',
              props.disabled
                ? 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-disabled)]'
                : 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-tertiary)]',
            )}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </div>

        {error && (
          <Alert id={errorId} variant="error" compact className="mt-1.5">
            {error}
          </Alert>
        )}
        {helperText && !error && (
          <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">{helperText}</p>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
