import React, { useState, useMemo } from 'react';
import {
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  ArrowRight,
  Eye,
  Calendar,
  AlertCircle,
  RotateCcw,
  ChevronRight,
  X,
  BookOpen
} from 'lucide-react';
import { CourseSession, Student, Teacher } from '../types';
import { InfoTooltip } from './common/InfoTooltip';
import { formatDateFull } from '../utils/dateUtils';
import { getTodayDateStr } from '../utils/quarterScheduler';
import { DatePickerWheelModal } from './DatePickerWheelModal';

interface TeacherTodayAttendanceViewProps {
  currentTeacher: Teacher | null;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  todayCourses: CourseSession[];
  pendingMakeupCourses: CourseSession[];
  dbStudents: Student[];
  onStartAttendance: (course: CourseSession) => void;
  onViewRecord: (course: CourseSession) => void;
  onNavigateTab?: (tab: string) => void;
}

/**
 * Checks if current time is within the course's timeSlot.
 * Supports delimiters like '-', '–', '—', '－'.
 */
function isCurrentlyInSession(timeSlot?: string): boolean {
  if (!timeSlot) return false;
  const normalized = timeSlot.replace(/[–—－]/g, '-');
  const parts = normalized.split('-').map((s) => s.trim());
  if (parts.length < 2) return false;

  const parseMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h)) return null;
    return h * 60 + (isNaN(m) ? 0 : m);
  };

  const startMin = parseMinutes(parts[0]);
  const endMin = parseMinutes(parts[1]);
  if (startMin === null || endMin === null) return false;

  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  return currentMin >= startMin && currentMin <= endMin;
}

export const TeacherTodayAttendanceView: React.FC<TeacherTodayAttendanceViewProps> = ({
  currentTeacher,
  selectedDate,
  onSelectDate,
  todayCourses,
  pendingMakeupCourses,
  dbStudents,
  onStartAttendance,
  onViewRecord,
  onNavigateTab,
}) => {
  const [showAllPending, setShowAllPending] = useState(false);
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = useState(false);

  const realTodayStr = getTodayDateStr();
  const isViewingToday = selectedDate === realTodayStr;

  // Filter out cancelled / suspended / holiday courses so they never demand teacher attendance
  const activeTodayCourses = useMemo(() => {
    return todayCourses.filter(
      (c) => !c.isCancelled && !c.isSuspended && c.status !== 'holiday' && c.status !== 'rescheduled_out'
    );
  }, [todayCourses]);

  const cancelledTodayCourses = useMemo(() => {
    return todayCourses.filter(
      (c) => c.isCancelled || c.isSuspended || c.status === 'holiday'
    );
  }, [todayCourses]);

  // Filter & sort today's active courses by action priority:
  // 1. In Session & Unmarked (Highest)
  // 2. In Progress
  // 3. Unmarked
  // 4. Completed
  const sortedTodayCourses = useMemo(() => {
    const list = [...activeTodayCourses];
    return list.sort((a, b) => {
      const aInSession = isViewingToday && isCurrentlyInSession(a.timeSlot) && a.status !== 'completed';
      const bInSession = isViewingToday && isCurrentlyInSession(b.timeSlot) && b.status !== 'completed';
      if (aInSession && !bInSession) return -1;
      if (!aInSession && bInSession) return 1;

      // Status weight
      const getWeight = (c: CourseSession) => {
        if (c.status === 'in_progress') return 1;
        if (c.status === 'unmarked') return 2;
        if (c.status === 'completed') return 3;
        return 4;
      };

      const diff = getWeight(a) - getWeight(b);
      if (diff !== 0) return diff;

      // Secondary: by timeSlot
      return (a.timeSlot || '').localeCompare(b.timeSlot || '');
    });
  }, [activeTodayCourses, isViewingToday]);

  const unmarkedTodayCount = useMemo(() => {
    return activeTodayCourses.filter((c) => c.status === 'unmarked' || c.status === 'in_progress').length;
  }, [activeTodayCourses]);

  const displayedPendingCourses = useMemo(() => {
    if (showAllPending) return pendingMakeupCourses;
    return pendingMakeupCourses.slice(0, 3);
  }, [pendingMakeupCourses, showAllPending]);

  return (
    <div className="space-y-5 pb-10 max-w-4xl mx-auto">
      {/* Non-today date warning banner */}
      {!isViewingToday && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-900">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              正在檢視指定日期：<strong>{formatDateFull(selectedDate)}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectDate(realTodayStr)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>返回今日點名</span>
          </button>
        </div>
      )}

      {/* Main Header Bar: Focused on Today's Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {isViewingToday ? '今日點名' : '課程點名'}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              今日 {activeTodayCourses.length} 堂 {unmarkedTodayCount > 0 ? `• 待點名 ${unmarkedTodayCount}` : '• 全部完成 ✓'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-1">
            {formatDateFull(selectedDate)}
          </p>
        </div>

        {/* Secondary Action: Select another date */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsDatePickerModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            title="選擇其他日期"
          >
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>查看其他日期</span>
          </button>
        </div>
      </div>

      {/* Notice Banner: Cancelled Sessions on selected date */}
      {cancelledTodayCourses.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center space-x-2.5 text-xs font-semibold text-rose-900">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              本日有 <strong>{cancelledTodayCourses.length} 堂課已停課</strong>（免點名，系統已自動排除於待點名名單，不計入學生應到與實到時數）
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            {cancelledTodayCourses.map((c) => (
              <span
                key={c.id}
                className="text-[11px] font-bold text-rose-800 bg-white px-2 py-0.5 rounded-lg border border-rose-200"
              >
                {c.className} {c.cancelReason ? `(${c.cancelReason})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pending Makeup Section (待補點名精簡區塊) */}
      {pendingMakeupCourses.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
              <h2 className="text-sm sm:text-base font-bold text-amber-950 flex items-center space-x-1.5">
                <span>待補點名</span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900">
                  {pendingMakeupCourses.length} 堂
                </span>
              </h2>
              {/* Detailed rule tooltip on desktop hover / mobile tap */}
              <InfoTooltip
                title="補點名規則說明"
                content="依華語中心規定，僅提醒今天以前應完成但尚未完成之課堂。課程結束後一週內可直接線上補做點名；逾期將自動鎖定並送交教務組。"
                align="left"
              />
            </div>

            {pendingMakeupCourses.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllPending(!showAllPending)}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 hover:underline transition-colors"
              >
                {showAllPending ? '收合' : `查看全部 (${pendingMakeupCourses.length})`}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {displayedPendingCourses.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-amber-200/90 p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:border-amber-400 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                  <span className="font-black text-slate-900 text-sm sm:text-base">
                    {c.className}
                  </span>
                  <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    {c.date.slice(5).replace('-', '/')}
                  </span>
                  <span className="font-mono font-bold text-slate-700">
                    {c.timeSlot}
                  </span>
                  <span className="text-slate-500 hidden md:inline truncate max-w-[160px]">
                    {c.courseName}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onStartAttendance(c)}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-bold text-xs shadow-2xs transition-colors text-center inline-flex items-center justify-center space-x-1"
                >
                  <span>補點名</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Courses List (今日待辦課程列表) */}
      <div className="space-y-3">
        {sortedTodayCourses.length === 0 ? (
          /* Empty state for today */
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-2xs space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-2xs">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                今天沒有待點名課程 ✓
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {isViewingToday
                  ? '今日尚無排定授課堂次，或當日課程皆已由授課教師完成點名。'
                  : `此日期 (${selectedDate}) 無排定授課堂次。`}
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setIsDatePickerModalOpen(true)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors inline-flex items-center space-x-1.5"
              >
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>查看其他日期</span>
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('schedule')}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
                >
                  前往全期排課日程
                </button>
              )}
            </div>
          </div>
        ) : (
          sortedTodayCourses.map((course) => {
            const isCompleted = course.status === 'completed';
            const isInProgress = course.status === 'in_progress';
            const isInSession =
              isViewingToday && isCurrentlyInSession(course.timeSlot) && !isCompleted;

            return (
              <div
                key={course.id}
                onClick={() => {
                  if (isCompleted) {
                    onViewRecord(course);
                  } else {
                    onStartAttendance(course);
                  }
                }}
                className={`rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all cursor-pointer ${
                  isInSession
                    ? 'bg-emerald-50/30 border-emerald-400 ring-2 ring-emerald-200 hover:shadow-md'
                    : isCompleted
                    ? 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                    : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left Course Information */}
                  <div className="space-y-1.5 min-w-0">
                    {/* Class Name + Status Badge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        {course.className}
                      </span>

                      {/* Small Status Indicator */}
                      {isInSession && (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                          <span>上課中</span>
                        </span>
                      )}

                      {isInProgress && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>進行中</span>
                        </span>
                      )}

                      {isCompleted && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>已完成點名</span>
                        </span>
                      )}
                    </div>

                    {/* Time, Classroom, Student Count */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-medium">
                      <span className="inline-flex items-center space-x-1 text-slate-900 font-bold font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{course.timeSlot}</span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          ({course.periodsCount || 3}節)
                        </span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center space-x-1 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{course.classroom || '未排定教室'}</span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center space-x-1 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{course.studentCount || (course.studentIds?.length ?? 0)} 位學生</span>
                      </span>
                    </div>

                    {/* Course / Textbook Title */}
                    <div className="text-xs sm:text-sm font-semibold text-slate-700 pt-0.5 truncate">
                      {course.courseName}
                      {course.textbook && (
                        <span className="text-xs text-slate-500 font-normal ml-2">
                          ({course.textbook})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Button (Large, Finger-Friendly on Mobile) */}
                  <div className="shrink-0 pt-2 sm:pt-0">
                    {isCompleted ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewRecord(course);
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center space-x-1.5 transition-colors"
                      >
                        <Eye className="w-4 h-4 text-slate-500" />
                        <span>檢視紀錄</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartAttendance(course);
                        }}
                        className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm sm:text-base shadow-xs hover:shadow transition-all inline-flex items-center justify-center space-x-2 text-white ${
                          isInSession
                            ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                            : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                        }`}
                      >
                        <span>{isInProgress ? '繼續點名' : '開始點名'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Date Picker Wheel Modal (iOS/Android 3-column wheel picker) */}
      <DatePickerWheelModal
        isOpen={isDatePickerModalOpen}
        onClose={() => setIsDatePickerModalOpen(false)}
        selectedDate={selectedDate}
        onConfirm={(newDate) => onSelectDate(newDate)}
      />
    </div>
  );
};
