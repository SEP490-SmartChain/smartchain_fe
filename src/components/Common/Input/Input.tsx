import React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id || reactId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {label}
            {props.required && <span className="ml-1 text-[var(--sc-error)]">*</span>}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'h-[42px] w-full rounded-lg border bg-[var(--sc-bg-surface)] px-3 py-2 text-sm leading-[18px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none',
              'transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--sc-text-tertiary)]',
              'hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
              'disabled:cursor-not-allowed disabled:bg-[var(--sc-bg-secondary)] disabled:text-[var(--sc-text-disabled)]',
              error
                ? 'border-[var(--sc-error)] focus:border-[var(--sc-error)] focus:shadow-[0_0_0_3px_rgb(222_55_48/20%)]'
                : 'border-[var(--sc-border-default)]',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className,
            )}
            aria-invalid={error ? true : props['aria-invalid']}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-[var(--sc-text-secondary)]">
              {rightIcon}
            </div>
          )}
        </div>

        {error && <p className="mb-0 mt-1.5 text-xs text-[var(--sc-error-dark)]">{error}</p>}
        {helperText && !error && (
          <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">{helperText}</p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
