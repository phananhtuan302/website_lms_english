import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

interface CustomDateTimePickerProps {
  value: string; // ISO string or YYYY-MM-DDTHH:mm or empty
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

export default function CustomDateTimePicker({
  value,
  onChange,
  className,
  placeholder = 'Chọn ngày giờ...',
}: CustomDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial selected date/time or fallback to current
  const parsedDate = value ? new Date(value) : null;
  const isValidDate = parsedDate && !isNaN(parsedDate.getTime());

  const initialYear = isValidDate ? parsedDate.getFullYear() : new Date().getFullYear();
  const initialMonth = isValidDate ? parsedDate.getMonth() : new Date().getMonth();
  const initialDay = isValidDate ? parsedDate.getDate() : new Date().getDate();
  const initialHour = isValidDate ? parsedDate.getHours() : 8;
  const initialMinute = isValidDate ? parsedDate.getMinutes() : 0;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<number | null>(isValidDate ? initialDay : null);
  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        setSelectedDay(d.getDate());
        setSelectedHour(d.getHours());
        setSelectedMinute(d.getMinutes());
      }
    } else {
      setSelectedDay(null);
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

  const emitValue = (year: number, month: number, day: number, hour: number, minute: number) => {
    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const formattedHour = String(hour).padStart(2, '0');
    const formattedMinute = String(minute).padStart(2, '0');
    onChange(`${year}-${formattedMonth}-${formattedDay}T${formattedHour}:${formattedMinute}`);
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    emitValue(viewYear, viewMonth, day, selectedHour, selectedMinute);
  };

  const handleHourChange = (newHour: number) => {
    setSelectedHour(newHour);
    const day = selectedDay ?? new Date().getDate();
    if (!selectedDay) setSelectedDay(day);
    emitValue(viewYear, viewMonth, day, newHour, selectedMinute);
  };

  const handleMinuteChange = (newMin: number) => {
    setSelectedMinute(newMin);
    const day = selectedDay ?? new Date().getDate();
    if (!selectedDay) setSelectedDay(day);
    emitValue(viewYear, viewMonth, day, selectedHour, newMin);
  };

  const handleSetNow = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(now.getDate());
    setSelectedHour(now.getHours());
    setSelectedMinute(now.getMinutes());
    emitValue(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedDay(null);
    onChange('');
    setIsOpen(false);
  };

  const formattedDisplayValue = value && isValidDate
    ? (() => {
        const d = new Date(value);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins} - ${day}/${month}/${year}`;
      })()
    : '';

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {/* Input Trigger Button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs transition-all hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
          isOpen && 'border-primary-500 ring-2 ring-primary-500/20'
        )}
      >
        <span className={cn('truncate', !formattedDisplayValue && 'text-slate-400')}>
          {formattedDisplayValue || placeholder}
        </span>
        <div className="flex items-center gap-1.5 text-slate-400">
          {formattedDisplayValue && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="rounded-full p-0.5 hover:bg-slate-100 hover:text-slate-600"
              title="Xóa ngày giờ"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      {/* Dropdown Popup */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-76 sm:w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-xs text-slate-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday Names */}
          <div className="mb-1 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-[11px] font-medium text-slate-400">
                {day}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7 w-7" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedDay === day &&
                parsedDate &&
                parsedDate.getFullYear() === viewYear &&
                parsedDate.getMonth() === viewMonth;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === viewMonth &&
                new Date().getFullYear() === viewYear;

              return (
                <button
                  type="button"
                  key={`day-${day}`}
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors',
                    isSelected
                      ? 'bg-primary-600 font-bold text-white shadow-2xs'
                      : isToday
                      ? 'bg-primary-50 font-semibold text-primary-700 hover:bg-primary-100'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time Picker Section */}
          <div className="mt-3.5 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Chọn giờ:
              </span>
              <div className="flex items-center gap-1.5">
                {/* Giờ */}
                <select
                  value={selectedHour}
                  onChange={(e) => handleHourChange(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')} giờ
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 font-bold">:</span>
                {/* Phút */}
                <select
                  value={selectedMinute}
                  onChange={(e) => handleMinuteChange(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  {Array.from({ length: 12 }).map((_, m) => {
                    const minute = m * 5;
                    return (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, '0')} phút
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-rose-600 transition-colors"
            >
              Xóa
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSetNow}
                className="text-primary-600 font-semibold hover:underline"
              >
                Hiện tại
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-primary-600 px-3 py-1 font-semibold text-white shadow-2xs hover:bg-primary-700"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
