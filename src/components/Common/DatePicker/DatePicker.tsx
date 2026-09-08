import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { cn } from '@/lib/utils';

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
  disabled
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
    <div className="flex flex-col gap-1.5 relative" ref={wrapperRef}>
      {label && (
        <label className="text-sm font-semibold text-[#1A1D21]">
          {label}
        </label>
      )}
      
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex h-[42px] w-full items-center justify-between rounded-lg border bg-white px-4 py-2.5 text-sm text-[#1A1D21] transition-all outline-none",
          "focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20",
          error ? "border-[#EF4444]" : "border-[#E5E7EB]",
          disabled && "bg-[#F7F8FA] text-[#9CA3B8] cursor-not-allowed",
          !date && "text-[#9CA3B8]"
        )}
      >
        <span>{date ? format(date, 'PPP') : placeholder}</span>
        <CalendarIcon className={cn("h-4 w-4", disabled ? "text-[#9CA3B8]" : "text-[#6A6E76]")} />
      </button>

      {error && <span className="text-xs text-[#EF4444]">{error}</span>}

      {isOpen && (
        <div 
          className="absolute top-[calc(100%+4px)] left-0 z-50 rounded-md border border-[#E5E7EB] bg-white p-3 shadow-lg"
          style={{
            '--rdp-accent-color': '#0F766E',
            '--rdp-background-color': '#F0FDFA',
            '--rdp-accent-background-color': '#0F766E',
            '--rdp-day-height': '2.25rem',
            '--rdp-day-width': '2.25rem',
            '--rdp-font-family': 'inherit',
          } as React.CSSProperties}
        >
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(d) => {
              onChange?.(d);
              setIsOpen(false);
            }}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}
