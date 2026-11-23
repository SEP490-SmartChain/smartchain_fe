import React from 'react';

import { Alert } from '@/components/Common/Alert/Alert';

import { useNativeFieldError } from '@/hooks/useNativeFieldError';
import { cn } from '@/lib/utils';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      className,
      label,
      error: formError,
      onInvalid,
      onInput,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    const { nativeError, handleInvalid, handleInput } = useNativeFieldError();
    const reactId = React.useId();
    const error = formError || nativeError;
    const errorId = error ? reactId + '-error' : undefined;
    return (
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
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined}
            onInvalid={(event) => {
              handleInvalid(event);
              onInvalid?.(event);
            }}
            onInput={(event) => {
              handleInput(event);
              onInput?.(event);
            }}
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
        {error && (
          <Alert id={errorId} variant="error" compact className="ml-7">
            {error}
          </Alert>
        )}
      </div>
    );
  },
);
Radio.displayName = 'Radio';
