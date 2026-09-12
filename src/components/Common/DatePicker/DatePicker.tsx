import * as React from 'react';

import { DayPicker } from 'react-day-picker';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import 'react-day-picker/dist/style.css';

export interface DatePickerProps {
  date?: Date;
  onChange?: (date?: Date) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function DatePicker({
  date,
  onChange,
  placeholder = 'Pick a date',
  label,
  error,
  disabled,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex flex-col gap-1.5" ref={wrapperRef}>
      {label && (
        <label className="text-sm font-medium text-[var(--sc-text-primary)]">{label}</label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'flex h-[42px] w-full items-center justify-between rounded-lg border bg-[var(--sc-bg-surface)] px-3 py-2 text-sm text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none',
          'transition-[border-color,box-shadow] hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
          error ? 'border-[var(--sc-error)]' : 'border-[var(--sc-border-default)]',
          disabled &&
            'cursor-not-allowed bg-[var(--sc-bg-secondary)] text-[var(--sc-text-disabled)]',
          !date && 'text-[var(--sc-text-tertiary)]',
        )}
      >
        <span>{date ? format(date, 'PPP') : placeholder}</span>
        <CalendarIcon
          className={cn(
            'h-4 w-4',
            disabled ? 'text-[var(--sc-text-disabled)]' : 'text-[var(--sc-text-secondary)]',
          )}
        />
      </button>
      {error && <span className="text-xs text-[var(--sc-error-dark)]">{error}</span>}

      {isOpen && (
        <div
          className="sc-popover-enter absolute left-0 top-[calc(100%+4px)] z-50 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 shadow-[var(--sc-shadow-popover)]"
          style={
            {
              '--rdp-accent-color': 'var(--sc-primary)',
              '--rdp-background-color': 'var(--sc-primary-lighter)',
              '--rdp-accent-background-color': 'var(--sc-primary)',
              '--rdp-day-height': '2.25rem',
              '--rdp-day-width': '2.25rem',
              '--rdp-font-family': 'inherit',
            } as React.CSSProperties
          }
        >
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(selectedDate) => {
              onChange?.(selectedDate);
              setIsOpen(false);
            }}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}
