import React, { useState } from 'react';
import { 
  CalendarDays, 
  ArrowRightLeft, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  BookOpen,
  Filter,
  Sparkles,
  Info
} from 'lucide-react';
import { CourseSession, DayScheduleSummary } from '../types';
import { formatDateFull } from '../utils/dateUtils';

interface RescheduleScheduleViewProps {
  courses: CourseSession[];
  daySummaries: DayScheduleSummary[];
  onSelectDate: (date: string) => void;
  onStartAttendance: (course: CourseSession) => void;
}

export const RescheduleScheduleView: React.FC<RescheduleScheduleViewProps> = ({
  courses,
  daySummaries,
  onSelectDate,
  onStartAttendance,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'rescheduled' | 'makeup' | 'holiday'>('all');

  // Filter rescheduled courses
  const rescheduledCourses = courses.filter((c) => c.rescheduleInfo);

  const filteredDays = daySummaries.filter((d) => {
    if (filterType === 'rescheduled') return d.hasReschedule;
    if (filterType === 'makeup') return d.hasMakeup;
    if (filterType === 'holiday') return d.isHoliday || d.isWeekend;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 mb-2">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>課程日期與調課行事曆</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              學期排課與調課異動追蹤
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              本視圖彙整授課教師於夏季學期所有排課、停課與調課紀錄。調課時，點名紀錄與學生名單將<strong>完整跟隨課程實體</strong>移動至新日期，原定日期亦會保留追蹤標記。
            </p>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500 flex items-center mr-1">
            <Filter className="w-3.5 h-3.5 mr-1" />
            快速篩選：
          </span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            全部日程 ({daySummaries.length} 天)
          </button>
          <button
            onClick={() => setFilterType('rescheduled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'rescheduled'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            ⚠️ 有調課紀錄 (07/30)
          </button>
          <button
            onClick={() => setFilterType('makeup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'makeup'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            🔵 補課／調課堂次 (07/31, 08/11)
          </button>
          <button
            onClick={() => setFilterType('holiday')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filterType === 'holiday'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
            }`}
          >
            🏖️ 國定假日與停課 (08/08, 08/10)
          </button>
        </div>
      </div>

      {/* Special Callout for Reschedule Logic Explanation */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-md">
        <div className="flex items-start space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              華語中心「調課不遺失、點名跟著課程走」核心機制
            </h3>
            <div className="mt-2 text-xs text-blue-100 grid grid-cols-1 md:grid-cols-2 gap-3 leading-relaxed">
              <div className="bg-white/10 p-3 rounded-xl">
                <div className="font-bold text-amber-300 mb-1 flex items-center">
                  <span>原定日期 (例：07/30 週四)</span>
                </div>
                <p className="text-[11px]">
                  原定課程卡片<strong>不會憑空消失</strong>，而是顯示「⚠️ 課程已調課」，清楚標示調往「07/31 09:00」，並附帶一鍵跳轉按鈕，避免老師撲空或誤以為漏課。
                </p>
              </div>
              <div className="bg-white/10 p-3 rounded-xl">
                <div className="font-bold text-teal-300 mb-1 flex items-center">
                  <span>新補課日 (例：07/31 週五)</span>
                </div>
                <p className="text-[11px]">
                  新日期卡片顯示「🔵 補課／調課 (原定 07/30)」。學生名單、3節分節設定與點名紀錄完全繼承，在該日點名完成後即轉為「已完成」。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Schedule List */}
      <div className="space-y-4">
        {filteredDays.map((day) => {
          const dayCourses = courses.filter((c) => c.date === day.date);

          return (
            <div
              key={day.date}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
                day.isToday
                  ? 'border-teal-500 ring-2 ring-teal-200'
                  : day.hasReschedule
                  ? 'border-amber-300 bg-amber-50/10'
                  : day.hasMakeup
                  ? 'border-blue-300 bg-blue-50/10'
                  : 'border-slate-200'
              }`}
            >
              {/* Date Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="flex items-center space-x-3">
                  <div className={`px-3 py-1.5 rounded-xl font-bold text-xs ${
                    day.isToday
                      ? 'bg-teal-600 text-white'
                      : day.isHoliday
                      ? 'bg-rose-100 text-rose-800'
                      : day.isWeekend
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-900 text-white'
                  }`}>
                    {day.fullDisplay}
                  </div>
                  {day.isToday && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      今日
                    </span>
                  )}
                  {day.isHoliday && (
                    <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {day.holidayName}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onSelectDate(day.date)}
                    className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline flex items-center"
                  >
                    <span>在今日點名介面開啟</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                </div>
              </div>

              {/* Courses on this day */}
              <div className="mt-3.5">
                {day.isHoliday ? (
                  <div className="text-xs text-rose-600 font-medium py-2 flex items-center space-x-2">
                    <Info className="w-4 h-4" />
                    <span>本日為國定假日/中心停課日，無排課。</span>
                  </div>
                ) : day.isWeekend ? (
                  <div className="text-xs text-slate-500 font-medium py-2">
                    週末公休日，教師休息。
                  </div>
                ) : dayCourses.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">本日無排定課程。</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dayCourses.map((c) => (
                      <div
                        key={c.id}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                          c.status === 'rescheduled_out'
                            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                            : c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in'
                            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                            : c.status === 'completed'
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between font-mono font-bold text-[11px] mb-1">
                            <span>{c.timeSlot}</span>
                            {c.status === 'rescheduled_out' && (
                              <span className="text-amber-800 font-bold bg-amber-200 px-1 rounded">已調課</span>
                            )}
                            {(c.status === 'rescheduled_in' || c.rescheduleInfo?.type === 'in') && (
                              <span className="text-blue-800 font-bold bg-blue-200 px-1 rounded">補課堂次</span>
                            )}
                            {c.status === 'completed' && (
                              <span className="text-emerald-800 font-bold bg-emerald-200 px-1 rounded">已完成</span>
                            )}
                            {c.status === 'unmarked' && !c.rescheduleInfo && (
                              <span className="text-slate-600 bg-slate-200 px-1 rounded">未點名</span>
                            )}
                          </div>
                          <div className={`font-extrabold text-sm ${c.status === 'rescheduled_out' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {c.courseName}
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">{c.className} • {c.studentCount}人</div>

                          {c.rescheduleInfo && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] leading-tight">
                              {c.rescheduleInfo.type === 'out' ? (
                                <span className="text-amber-800 font-medium">
                                  ↳ 已移至 {c.rescheduleInfo.targetDate}
                                </span>
                              ) : (
                                <span className="text-blue-800 font-medium">
                                  ↳ 原定 {c.rescheduleInfo.originalDate}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {c.status !== 'rescheduled_out' && (
                          <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-end">
                            <button
                              onClick={() => {
                                onSelectDate(c.date);
                                onStartAttendance(c);
                              }}
                              className="text-[11px] font-bold text-teal-700 hover:text-teal-900"
                            >
                              {c.status === 'completed' ? '查看點名紀錄' : '開始點名 →'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
