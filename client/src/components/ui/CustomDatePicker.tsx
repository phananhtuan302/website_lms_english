import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const MONTH_NAMES = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function CustomDatePicker({
  value,
  onChange,
  className,
  placeholder = 'Chọn ngày sinh...',
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial selected date or fallback to current
  const selectedDate = value ? new Date(value) : null;
  const initialYear = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate.getFullYear() : 2000;
  const initialMonth = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate.getMonth() : 0;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Days in current view month
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    onChange(`${viewYear}-${formattedMonth}-${formattedDay}`);
    setIsOpen(false);
  };

  const formattedDisplayValue = value
    ? (() => {
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      })()
    : '';

  // Generate Year options from 1950 to current year + 5
  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear + 2; y >= 1940; y--) {
    yearOptions.push(y);
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Input trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-primary-200 bg-white px-3 py-1.5 text-xs text-slate-800 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200',
          !formattedDisplayValue && 'text-slate-400 font-normal',
        )}
      >
        <span className="truncate">{formattedDisplayValue || placeholder}</span>
        <svg
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xl animate-fade-in">
          {/* Header Month / Year controls */}
          <div className="flex items-center justify-between gap-1 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              ‹
            </button>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="rounded-lg border-none bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:ring-0 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="rounded-lg border-none bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:ring-0 focus:outline-none cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              ›
            </button>
          </div>

          {/* Weekday labels */}
          <div className="mt-2.5 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
            {WEEKDAYS.map((wd) => (
              <span key={wd}>{wd}</span>
            ))}
          </div>

          {/* Days grid */}
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {/* Empty slots for start offset */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7 w-7" />
            ))}

            {/* Month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedDate &&
                selectedDate.getFullYear() === viewYear &&
                selectedDate.getMonth() === viewMonth &&
                selectedDate.getDate() === day;

              const isToday =
                new Date().getFullYear() === viewYear &&
                new Date().getMonth() === viewMonth &&
                new Date().getDate() === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary-600 font-bold text-white shadow-xs'
                      : isToday
                        ? 'border border-primary-400 font-bold text-primary-700 bg-primary-50/50'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-rose-600 transition-colors"
            >
              Xóa ngày
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const fM = String(now.getMonth() + 1).padStart(2, '0');
                const fD = String(now.getDate()).padStart(2, '0');
                onChange(`${now.getFullYear()}-${fM}-${fD}`);
                setIsOpen(false);
              }}
              className="font-bold text-primary-600 hover:text-primary-700 transition-colors"
            >
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
