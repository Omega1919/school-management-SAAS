import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, CalendarCheck } from 'lucide-react';

interface DatePickerProps {
  value: string; // ISO format: YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  required?: boolean;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  className?: string;
  theme?: 'dark' | 'light';
  id?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select date of birth...',
  required = false,
  minYear = 1960,
  maxYear = new Date().getFullYear(),
  disabled = false,
  className = '',
  theme = 'dark',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial or fallback view date
  const parsedDate = value ? new Date(value + 'T00:00:00') : null;
  const initialYear = parsedDate ? parsedDate.getFullYear() : 2012; // Realistic student default
  const initialMonth = parsedDate ? parsedDate.getMonth() : 0;

  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth);

  // Sync view when external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Year options list (descending from maxYear to minYear)
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  // Calculate calendar grid days
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday

  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  // Days before the 1st
  const leadingDays: number[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    leadingDays.push(prevMonthDays - i);
  }

  // Month days
  const monthDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    monthDays.push(d);
  }

  // Trailing days to fill 6 rows (42 cells)
  const totalSlots = leadingDays.length + monthDays.length;
  const trailingCount = (7 - (totalSlots % 7)) % 7;
  const trailingDays: number[] = [];
  for (let t = 1; t <= trailingCount; t++) {
    trailingDays.push(t);
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const formatted = `${viewYear}-${mm}-${dd}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const formatDisplayDate = (val: string) => {
    if (!val) return '';
    try {
      const parts = val.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return val;
  };

  // Check if a day is currently selected
  const isDaySelected = (day: number) => {
    if (!value) return false;
    const parts = value.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return y === viewYear && m === viewMonth && d === day;
    }
    return false;
  };

  // Check if a day is today
  const today = new Date();
  const isToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  const isDark = theme === 'dark';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML5 required form validation */}
      <input
        type="text"
        id={id}
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Main Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all cursor-pointer select-none ${
          isDark
            ? 'bg-slate-950 border-slate-700 hover:border-slate-500 text-white focus-within:border-purple-500'
            : 'bg-white border-slate-300 hover:border-slate-400 text-slate-900 focus-within:border-purple-600'
        } ${isOpen ? (isDark ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-purple-600 ring-2 ring-purple-600/20') : ''} ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon
            className={`w-4 h-4 shrink-0 ${
              value ? (isDark ? 'text-purple-400' : 'text-purple-600') : isDark ? 'text-slate-500' : 'text-slate-400'
            }`}
          />
          {value ? (
            <span className="font-medium text-white truncate">{formatDisplayDate(value)}</span>
          ) : (
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-1 rounded-md transition-colors ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
              }`}
              title="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-md font-mono ${
              isDark ? 'bg-slate-800/80 text-purple-300 border border-slate-700' : 'bg-slate-100 text-purple-700 border border-slate-200'
            }`}
          >
            {value ? value : 'YYYY-MM-DD'}
          </span>
        </div>
      </div>

      {/* Floating Calendar Popover */}
      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-2 z-50 w-full sm:w-80 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 ${
            isDark
              ? 'bg-slate-900/95 border-slate-700/80 text-white shadow-purple-950/40'
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/20'
          }`}
        >
          {/* Calendar Header with Quick Month/Year Dropdowns & Nav Arrows */}
          <div className="flex items-center justify-between gap-1 mb-3">
            <div className="flex items-center gap-1.5 flex-1">
              {/* Month Select */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className={`text-xs font-bold py-1.5 px-2 rounded-lg border focus:outline-hidden cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-purple-300 focus:border-purple-500'
                    : 'bg-slate-100 border-slate-200 text-purple-700 focus:border-purple-600'
                }`}
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Year Select */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className={`text-xs font-bold py-1.5 px-2 rounded-lg border focus:outline-hidden cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-purple-300 focus:border-purple-500'
                    : 'bg-slate-100 border-slate-200 text-purple-700 focus:border-purple-600'
                }`}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Prev / Next Month Buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
                    : 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
                    : 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_OF_WEEK.map((d, i) => (
              <div
                key={d}
                className={`text-[11px] font-bold py-1 ${
                  i === 0 || i === 6
                    ? isDark
                      ? 'text-purple-400/80'
                      : 'text-purple-600/80'
                    : isDark
                    ? 'text-slate-400'
                    : 'text-slate-500'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Leading days from previous month */}
            {leadingDays.map((d) => (
              <div
                key={`prev-${d}`}
                className={`text-center py-2 text-xs select-none opacity-25 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {d}
              </div>
            ))}

            {/* Days of current month */}
            {monthDays.map((d) => {
              const selected = isDaySelected(d);
              const currentDay = isToday(d);

              return (
                <button
                  key={`day-${d}`}
                  type="button"
                  onClick={() => handleSelectDay(d)}
                  className={`text-center py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer relative ${
                    selected
                      ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/40 scale-105 z-10'
                      : currentDay
                      ? isDark
                        ? 'bg-slate-800 text-purple-300 border border-purple-500/40 hover:bg-purple-600/30'
                        : 'bg-purple-50 text-purple-700 border border-purple-300 hover:bg-purple-100'
                      : isDark
                      ? 'text-slate-200 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {d}
                  {currentDay && !selected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400" />
                  )}
                </button>
              );
            })}

            {/* Trailing days from next month */}
            {trailingDays.map((d) => (
              <div
                key={`next-${d}`}
                className={`text-center py-2 text-xs select-none opacity-25 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Footer with Quick Shortcuts */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
              }}
              className={`text-[11px] font-semibold transition-colors cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-purple-300' : 'text-slate-500 hover:text-purple-600'
              }`}
            >
              Reset to Current Year
            </button>

            {value && (
              <span className="text-[11px] text-purple-400 font-medium flex items-center gap-1">
                <CalendarCheck className="w-3 h-3" />
                <span>Selected: {formatDisplayDate(value)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
