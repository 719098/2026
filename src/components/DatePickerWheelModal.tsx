import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Calendar, Check } from 'lucide-react';
import { getTodayDateStr } from '../utils/quarterScheduler';

interface DatePickerWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string; // "YYYY-MM-DD"
  onConfirm: (date: string) => void;
}

const ITEM_HEIGHT = 44; // px per row
const VISIBLE_ROWS = 5; // 5 rows total, middle is row index 2
const PADDING_OFFSET = Math.floor(VISIBLE_ROWS / 2) * ITEM_HEIGHT; // 2 * 44 = 88px

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface WheelColumnProps {
  label: string;
  items: { value: number; label: string }[];
  selectedValue: number;
  onChange: (value: number) => void;
}

const WheelColumn: React.FC<WheelColumnProps> = ({
  label,
  items,
  selectedValue,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedIndex = useMemo(() => {
    const idx = items.findIndex((it) => it.value === selectedValue);
    return idx >= 0 ? idx : 0;
  }, [items, selectedValue]);

  // Synchronize scroll position when selectedIndex changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targetTop = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(container.scrollTop - targetTop) > 2) {
      isProgrammaticScroll.current = true;
      container.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 300);
    }
  }, [selectedIndex]);

  // Initial scroll without animation on first mount
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = selectedIndex * ITEM_HEIGHT;
    }
  }, []);

  const handleScroll = () => {
    if (isProgrammaticScroll.current) return;

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(items.length - 1, index));

      if (items[clampedIndex] && items[clampedIndex].value !== selectedValue) {
        onChange(items[clampedIndex].value);
      }
    }, 80);
  };

  const handleItemClick = (index: number, val: number) => {
    const container = containerRef.current;
    if (container) {
      isProgrammaticScroll.current = true;
      container.scrollTo({
        top: index * ITEM_HEIGHT,
        behavior: 'smooth',
      });
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 300);
    }
    onChange(val);
  };

  return (
    <div className="flex-1 flex flex-col items-center">
      {/* Column Header Label */}
      <span className="text-xs font-bold text-slate-500 mb-2 select-none tracking-wider">
        {label}
      </span>

      {/* Scrollable Container with snap */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-[220px] overflow-y-auto overscroll-contain snap-y snap-mandatory select-none relative scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          paddingTop: `${PADDING_OFFSET}px`,
          paddingBottom: `${PADDING_OFFSET}px`,
        }}
      >
        {items.map((item, index) => {
          const isSelected = item.value === selectedValue;
          const distance = Math.abs(index - selectedIndex);

          let textStyle = 'text-slate-300 font-normal scale-90 opacity-30 text-xs';
          if (distance === 0) {
            textStyle = 'text-slate-900 font-black text-base sm:text-lg scale-105 opacity-100';
          } else if (distance === 1) {
            textStyle = 'text-slate-600 font-semibold text-sm scale-95 opacity-70';
          } else if (distance === 2) {
            textStyle = 'text-slate-400 font-normal text-xs scale-90 opacity-40';
          }

          return (
            <div
              key={item.value}
              onClick={() => handleItemClick(index, item.value)}
              style={{ height: `${ITEM_HEIGHT}px` }}
              className={`flex items-center justify-center snap-center cursor-pointer transition-all duration-150 ${textStyle}`}
            >
              <span className="font-mono">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const DatePickerWheelModal: React.FC<DatePickerWheelModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onConfirm,
}) => {
  // Parse initial date from selectedDate prop
  const initialParts = useMemo(() => {
    const parts = (selectedDate || getTodayDateStr()).split('-').map(Number);
    const y = parts[0] || 2026;
    const m = parts[1] || 10;
    const d = parts[2] || 2;
    return { year: y, month: m, day: d };
  }, [selectedDate]);

  const [year, setYear] = useState<number>(initialParts.year);
  const [month, setMonth] = useState<number>(initialParts.month);
  const [day, setDay] = useState<number>(initialParts.day);

  // When modal reopens or selectedDate prop changes, reset wheel state
  useEffect(() => {
    if (isOpen) {
      setYear(initialParts.year);
      setMonth(initialParts.month);
      setDay(initialParts.day);
    }
  }, [isOpen, initialParts]);

  // Today parts
  const todayStr = getTodayDateStr();
  const todayParts = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    return { year: y, month: m, day: d };
  }, [todayStr]);

  const isSelectedToday =
    year === todayParts.year && month === todayParts.month && day === todayParts.day;

  // Year items (e.g. 2022 to 2030)
  const years = useMemo(() => {
    const list = [];
    for (let y = 2022; y <= 2030; y++) {
      list.push({ value: y, label: `${y}年` });
    }
    return list;
  }, []);

  // Month items (1 to 12)
  const months = useMemo(() => {
    const list = [];
    for (let m = 1; m <= 12; m++) {
      list.push({ value: m, label: `${String(m).padStart(2, '0')}月` });
    }
    return list;
  }, []);

  // Dynamically calculate days in month and clamp day if needed
  const maxDays = useMemo(() => {
    return getDaysInMonth(year, month);
  }, [year, month]);

  // Auto-clamp day if it exceeds max days of the new month/year (e.g. Jan 31 -> Feb 28)
  useEffect(() => {
    if (day > maxDays) {
      setDay(maxDays);
    }
  }, [maxDays, day]);

  const days = useMemo(() => {
    const list = [];
    for (let d = 1; d <= maxDays; d++) {
      list.push({ value: d, label: `${String(d).padStart(2, '0')}日` });
    }
    return list;
  }, [maxDays]);

  // Handle Today Shortcut
  const handleJumpToToday = () => {
    setYear(todayParts.year);
    setMonth(todayParts.month);
    setDay(todayParts.day);
  };

  // Handle Confirm
  const handleConfirm = () => {
    const finalDay = Math.min(day, maxDays);
    const formatted = `${year}-${String(month).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
    onConfirm(formatted);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 my-auto space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">切換檢視日期</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Column Wheel Container */}
        <div className="relative bg-slate-50/70 border border-slate-200/80 rounded-2xl p-2 pt-3 overflow-hidden shadow-inner">
          {/* Center Selection Bar Indicator (Behind numbers, covering the active row) */}
          <div
            className="absolute left-2 right-2 rounded-xl bg-indigo-50/80 border-y border-indigo-200/90 pointer-events-none z-0"
            style={{
              top: `${PADDING_OFFSET + 32}px`, // 32px accounts for the column labels
              height: `${ITEM_HEIGHT}px`,
            }}
          />

          {/* Top Fade Gradient */}
          <div className="absolute top-8 left-0 right-0 h-14 bg-gradient-to-b from-slate-50/90 via-slate-50/60 to-transparent pointer-events-none z-10" />

          {/* Bottom Fade Gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-slate-50/90 via-slate-50/60 to-transparent pointer-events-none z-10" />

          {/* Three Wheel Columns: Year | Month | Day */}
          <div className="relative z-10 flex items-center justify-between px-1">
            <WheelColumn
              label="年"
              items={years}
              selectedValue={year}
              onChange={setYear}
            />
            <div className="w-px h-28 bg-slate-200/70 shrink-0 mx-1" />
            <WheelColumn
              label="月"
              items={months}
              selectedValue={month}
              onChange={setMonth}
            />
            <div className="w-px h-28 bg-slate-200/70 shrink-0 mx-1" />
            <WheelColumn
              label="日"
              items={days}
              selectedValue={day}
              onChange={setDay}
            />
          </div>
        </div>

        {/* Today Quick Shortcut Button */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={handleJumpToToday}
            className={`inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              isSelectedToday
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            {isSelectedToday && <Check className="w-3.5 h-3.5 text-indigo-600" />}
            <span>今天 {String(todayParts.month).padStart(2, '0')}/{String(todayParts.day).padStart(2, '0')}</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow transition-all text-center"
          >
            確認日期
          </button>
        </div>
      </div>
    </div>
  );
};
