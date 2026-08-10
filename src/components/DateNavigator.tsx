import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Sun,
  Coffee,
  CalendarDays
} from 'lucide-react';
import { DayScheduleSummary } from '../types';
import { formatDateFull, getAdjacentDate } from '../utils/dateUtils';
import { TODAY_DATE } from '../utils/quarterScheduler';

interface DateNavigatorProps {
  selectedDate: string; // "2026-08-11"
  onSelectDate: (date: string) => void;
  daySummaries: DayScheduleSummary[];
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  selectedDate,
  onSelectDate,
  daySummaries,
}) => {
  const fullDateDisplay = formatDateFull(selectedDate);
  const isSelectedToday = selectedDate === TODAY_DATE;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs mb-6 overflow-hidden">
      {/* Top Date Header Bar */}
      <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              課程日程導覽 (2026 夏季班: 7月~10月)
            </span>
            {isSelectedToday && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                今日 (基準日)
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight mt-1 flex items-center space-x-3">
            <span>日程導覽</span>
            <span className="text-lg font-normal text-slate-500 font-mono">
              {fullDateDisplay}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            點擊下方日期標籤可快速切換日程，即時檢視該日授課班級、調課異動與點名進度。
          </p>
        </div>

        {/* Quick Month Filter & Stepper Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Month Jumpers */}
          <div className="hidden sm:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => onSelectDate('2026-07-01')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedDate.startsWith('2026-07') ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7月 (開學)
            </button>
            <button
              onClick={() => onSelectDate(TODAY_DATE)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedDate.startsWith('2026-08') ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8月 (今日)
            </button>
            <button
              onClick={() => onSelectDate('2026-09-01')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedDate.startsWith('2026-09') ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              9月
            </button>
            <button
              onClick={() => onSelectDate('2026-10-01')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedDate.startsWith('2026-10') ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              10月 (結業)
            </button>
          </div>

          <button
            id="btn-prev-day"
            onClick={() => onSelectDate(getAdjacentDate(selectedDate, -1))}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
            title="查看前一天課程"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>前一天</span>
          </button>

          <button
            id="btn-today"
            onClick={() => onSelectDate(TODAY_DATE)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all shadow-2xs ${
              isSelectedToday
                ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-200'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title={`回到系統今日基準日 (${TODAY_DATE})`}
          >
            今日 (08/11)
          </button>

          <button
            id="btn-next-day"
            onClick={() => onSelectDate(getAdjacentDate(selectedDate, 1))}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
            title="查看後一天課程"
          >
            <span>後一天</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Native Date Picker */}
          <div className="relative">
            <input
              type="date"
              id="date-picker-input"
              value={selectedDate}
              min="2026-07-01"
              max="2026-10-31"
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Calendar Strip (Horizontal Day Pills) */}
      <div className="p-3 bg-slate-50/70 border-t border-slate-100 overflow-x-auto scrollbar-thin">
        <div className="flex items-stretch space-x-2 min-w-max pb-1">
          {daySummaries.map((day) => {
            const isSelected = day.date === selectedDate;
            const isTodayAnchor = day.isToday;

            return (
              <button
                key={day.date}
                id={`date-pill-${day.date}`}
                onClick={() => onSelectDate(day.date)}
                className={`flex flex-col items-center justify-between p-2.5 rounded-2xl border text-center transition-all min-w-[110px] ${
                  isSelected
                    ? 'bg-white border-teal-600 shadow-md ring-2 ring-teal-500/20 text-slate-900 -translate-y-0.5'
                    : day.isHoliday || day.isWeekend
                    ? 'bg-slate-100/80 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300'
                    : 'bg-white/90 border-slate-200/80 text-slate-700 hover:bg-white hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                {/* Date & Weekday */}
                <div className="w-full flex items-center justify-between text-[11px] mb-1 font-medium">
                  <span className={isSelected ? 'text-teal-700 font-bold' : 'text-slate-500'}>
                    {day.weekday}
                  </span>
                  {isTodayAnchor && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs animate-pulse" title="今日基準日"></span>
                  )}
                </div>

                <div className={`text-base font-extrabold tracking-tight font-mono ${
                  isSelected ? 'text-teal-900 font-black' : 'text-slate-800'
                }`}>
                  {day.displayDate}
                </div>

                {/* Status Indicator */}
                <div className="mt-2 w-full pt-1.5 border-t border-slate-100 flex flex-col items-center">
                  {day.isHoliday ? (
                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 truncate max-w-full" title={day.holidayName}>
                      {day.holidayName ? day.holidayName.slice(0, 5) : '國定假日'}
                    </span>
                  ) : day.isWeekend ? (
                    <span className="text-[10px] font-medium text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                      週末公休
                    </span>
                  ) : day.totalCourses === 0 ? (
                    <span className="text-[10px] text-slate-400">無排課</span>
                  ) : (
                    <div className="flex flex-col items-center space-y-0.5 w-full">
                      <span className="text-[11px] font-semibold text-slate-700">
                        {day.totalCourses} 堂課
                      </span>

                      {/* BADGES RULE:
                          1. Past: If pendingMakeupCount > 0 => "待補點名"
                          2. Today: "今日待點名" or "已完成"
                          3. Future: "即將上課" (NEVER show warnings)
                      */}
                      {day.isPast ? (
                        day.pendingMakeupCount > 0 ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded flex items-center">
                            ⚠️ 待補點名
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            ✅ 已完成
                          </span>
                        )
                      ) : day.isToday ? (
                        day.unmarkedCount > 0 ? (
                          <span className="text-[10px] font-bold text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded">
                            今日待點名
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            ✅ 今日已全點
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          即將上課
                        </span>
                      )}

                      {/* Reschedule Indicators */}
                      {day.hasReschedule && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 rounded">
                          調出
                        </span>
                      )}
                      {day.hasMakeup && (
                        <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1 rounded">
                          補課
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
