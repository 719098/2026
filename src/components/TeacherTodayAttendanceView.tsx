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
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { CourseSession, Student, Teacher, AttendanceMakeupRequest } from '../types';
import { InfoTooltip } from './common/InfoTooltip';
import { formatDateFull } from '../utils/dateUtils';
import { getTodayDateStr, getDaysDifference } from '../utils/quarterScheduler';
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
  makeupRequests?: AttendanceMakeupRequest[];
  teacherCourses?: CourseSession[];
  isLoading?: boolean;
  hasLoaded?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}

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

function isModifiedOnlyCourse(c: CourseSession): boolean {
  return Boolean(
    c.isCancelled ||
      c.isSuspended ||
      c.status === 'holiday' ||
      c.status === 'rescheduled_out' ||
      (c.status as string) === 'CANCELLED'
  );
}

export const TeacherTodayAttendanceView: React.FC<TeacherTodayAttendanceViewProps> = ({
  selectedDate,
  onSelectDate,
  todayCourses,
  pendingMakeupCourses,
  onStartAttendance,
  onViewRecord,
  onNavigateTab,
  makeupRequests = [],
  teacherCourses = [],
  isLoading = false,
  hasLoaded = true,
  errorMessage = null,
  onRetry,
}) => {
  const [showAllPending, setShowAllPending] = useState(false);
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = useState(false);

  const realTodayStr = getTodayDateStr();
  const isViewingToday = selectedDate === realTodayStr;

  const showErrorState = Boolean(errorMessage) && !isLoading;
  const showLoadingState = !showErrorState && (!hasLoaded || (isLoading && todayCourses.length === 0));

  const approvedOverdueSessions = useMemo(() => {
    const activeReqs = (makeupRequests || []).filter((r) => r.status === 'APPROVED');
    const result: Array<{ req: AttendanceMakeupRequest; course: CourseSession }> = [];
    activeReqs.forEach((req) => {
      const matched = teacherCourses.find(
        (c) =>
          c.classId === req.classId &&
          c.date === req.sessionDate &&
          !isModifiedOnlyCourse(c)
      );
      if (matched) {
        result.push({ req, course: matched });
      }
    });
    return result.sort((a, b) => b.req.sessionDate.localeCompare(a.req.sessionDate));
  }, [makeupRequests, teacherCourses]);

  const activeTodayCourses = useMemo(() => {
    return todayCourses.filter((c) => !isModifiedOnlyCourse(c));
  }, [todayCourses]);

  const modifiedTodayCourses = useMemo(() => {
    return todayCourses
      .filter((c) => isModifiedOnlyCourse(c))
      .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
  }, [todayCourses]);

  const sortedTodayCourses = useMemo(() => {
    const list = [...activeTodayCourses];
    return list.sort((a, b) => {
      const aInSession = isViewingToday && isCurrentlyInSession(a.timeSlot) && a.status !== 'completed';
      const bInSession = isViewingToday && isCurrentlyInSession(b.timeSlot) && b.status !== 'completed';
      if (aInSession && !bInSession) return -1;
      if (!aInSession && bInSession) return 1;

      const getWeight = (c: CourseSession) => {
        if (c.status === 'in_progress') return 1;
        if (c.status === 'unmarked' || c.status === 'rescheduled_in') return 2;
        if (c.status === 'locked') return 3;
        if (c.status === 'completed') return 4;
        return 5;
      };

      const diff = getWeight(a) - getWeight(b);
      if (diff !== 0) return diff;
      return (a.timeSlot || '').localeCompare(b.timeSlot || '');
    });
  }, [activeTodayCourses, isViewingToday]);

  // Drafts ('in_progress'), 'unmarked', 'rescheduled_in', and unsubmitted 'locked' all count as pending
  const unmarkedTodayCount = useMemo(() => {
    return activeTodayCourses.filter((c) => c.status !== 'completed').length;
  }, [activeTodayCourses]);

  const onlyModifiedSessionsToday = !showLoadingState && !showErrorState && todayCourses.length > 0 && activeTodayCourses.length === 0;
  const noSessionsScheduledOnDate = !showLoadingState && !showErrorState && todayCourses.length === 0;
  const allActiveCompleted = !showLoadingState && !showErrorState && activeTodayCourses.length > 0 && unmarkedTodayCount === 0;

  const displayedPendingCourses = useMemo(() => {
    if (showAllPending) return pendingMakeupCourses;
    return pendingMakeupCourses.slice(0, 3);
  }, [pendingMakeupCourses, showAllPending]);

  const renderHeaderStatusBadge = () => {
    if (showErrorState) {
      return (
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
          載入失敗
        </span>
      );
    }
    if (showLoadingState) {
      return (
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>課程載入中…</span>
        </span>
      );
    }
    if (noSessionsScheduledOnDate) {
      return (
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
          {isViewingToday ? '今日未安排課程' : '該日未安排課程'}
        </span>
      );
    }
    if (onlyModifiedSessionsToday) {
      return (
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
          今日無需點名
        </span>
      );
    }
    if (unmarkedTodayCount > 0) {
      return (
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          待點名 {unmarkedTodayCount} 堂
        </span>
      );
    }
    return (
      <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
        全部完成 ✓
      </span>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-10 max-w-4xl mx-auto">
      {/* Non-today date bar */}
      {!isViewingToday && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-900 min-w-0">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">
              檢視日期：<strong>{formatDateFull(selectedDate)}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectDate(realTodayStr)}
            className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs shrink-0 w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>返回今日</span>
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {isViewingToday ? '今日點名' : '課程點名'}
            </h1>
            {renderHeaderStatusBadge()}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-1">
            {formatDateFull(selectedDate)}
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsDatePickerModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>查看其他日期</span>
          </button>
        </div>
      </div>

      {/* Approved Over-7-Day Makeup Requests */}
      {!showLoadingState && !showErrorState && approvedOverdueSessions.length > 0 && (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-bold text-emerald-950 flex flex-wrap items-center gap-1.5">
              <span>已核准逾七天補點名（單次有效）</span>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900 shrink-0">
                {approvedOverdueSessions.length} 堂
              </span>
            </h2>
          </div>

          <div className="space-y-2">
            {approvedOverdueSessions.map(({ req, course }) => (
              <div
                key={req.id}
                className="bg-white rounded-xl border border-emerald-200/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                  <span className="font-black text-slate-900 text-sm">
                    {course.className}
                  </span>
                  <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                    {course.date}
                  </span>
                  <span className="font-mono font-bold text-slate-700">
                    {course.timeSlot}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold">
                    {req.requestType === 'EDIT' ? '修改既有點名' : '補點名'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onStartAttendance(course)}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-2xs transition-colors inline-flex items-center justify-center space-x-1 cursor-pointer shrink-0"
                >
                  <span>前往補點名</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Makeup Section (within 7 days) */}
      {!showLoadingState && !showErrorState && pendingMakeupCourses.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h2 className="text-sm font-bold text-amber-950 flex flex-wrap items-center gap-1.5">
                <span>近七日待補點名</span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900">
                  {pendingMakeupCourses.length} 堂
                </span>
              </h2>
              <InfoTooltip
                title="補點名規則說明"
                content="課程結束後七天內可直接補點名；超過七天將鎖定，須送出補點名申請並經行政核准後補填。"
                align="left"
              />
            </div>

            {pendingMakeupCourses.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllPending(!showAllPending)}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 hover:underline shrink-0"
              >
                {showAllPending ? '收合' : `全部 (${pendingMakeupCourses.length})`}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {displayedPendingCourses.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-amber-200/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:border-amber-400 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                  <span className="font-black text-slate-900 text-sm">
                    {c.className}
                  </span>
                  <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    {c.date.slice(5).replace('-', '/')}
                  </span>
                  <span className="font-mono font-bold text-slate-700">
                    {c.timeSlot}
                  </span>
                  {c.status === 'in_progress' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                      草稿
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onStartAttendance(c)}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-2xs transition-colors inline-flex items-center justify-center space-x-1 shrink-0"
                >
                  <span>補點名</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area: Loading / Error / Empty / Courses */}
      <div className="space-y-3">
        {showErrorState ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-6 sm:p-10 text-center shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">載入失敗</h3>
              {errorMessage && (
                <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto break-words">
                  {errorMessage}
                </p>
              )}
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onRetry?.()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重試</span>
              </button>
            </div>
          </div>
        ) : showLoadingState ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-2xs space-y-3">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto" />
            <div className="text-sm sm:text-base font-bold text-slate-700">
              課程載入中…
            </div>
          </div>
        ) : noSessionsScheduledOnDate ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-2xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto border border-slate-200">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {isViewingToday ? '今日未安排課程' : '該日未安排課程'}
            </h3>
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
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
                  前往全季排程
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {onlyModifiedSessionsToday && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold text-slate-800 flex items-center justify-between gap-2">
                <span>今日無需點名</span>
                <span className="text-xs font-medium text-slate-500">
                  僅餘異動堂次（{modifiedTodayCourses.length} 堂）
                </span>
              </div>
            )}

            {allActiveCompleted && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>全部完成 ✓</span>
              </div>
            )}

            {/* Active courses needing or having completed attendance */}
            {sortedTodayCourses.map((course) => {
              const isCompleted = course.status === 'completed';
              const isInProgress = course.status === 'in_progress';
              const isRescheduledIn =
                course.status === 'rescheduled_in' || course.rescheduleInfo?.type === 'in';
              const isOverdueCourse =
                course.date < realTodayStr && getDaysDifference(realTodayStr, course.date) > 7;
              const sessionReqs = (makeupRequests || [])
                .filter((r) => r.classId === course.classId && r.sessionDate === course.date)
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              const activeApprovedReq = sessionReqs.find((r) => r.status === 'APPROVED');
              const pendingReq = sessionReqs.find((r) => r.status === 'PENDING');
              const isInSession =
                isViewingToday && isCurrentlyInSession(course.timeSlot) && !isCompleted;

              return (
                <div
                  key={course.id}
                  onClick={() => {
                    if (activeApprovedReq) {
                      onStartAttendance(course);
                    } else if (isCompleted || isOverdueCourse) {
                      onViewRecord(course);
                    } else {
                      onStartAttendance(course);
                    }
                  }}
                  className={`rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all cursor-pointer ${
                    isInSession
                      ? 'bg-emerald-50/30 border-emerald-400 ring-1 ring-emerald-200 hover:shadow-md'
                      : isCompleted
                      ? 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                      : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight break-words">
                          {course.className}
                        </span>

                        {isInSession && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            上課中
                          </span>
                        )}

                        {isRescheduledIn && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            補課堂次
                          </span>
                        )}

                        {isInProgress && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>草稿待送出</span>
                          </span>
                        )}

                        {isCompleted && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>已完成點名</span>
                          </span>
                        )}

                        {isOverdueCourse && activeApprovedReq && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                            已核准補點名（單次）
                          </span>
                        )}

                        {isOverdueCourse && !activeApprovedReq && pendingReq && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            補點名審核中
                          </span>
                        )}

                        {isOverdueCourse && !activeApprovedReq && !pendingReq && !isCompleted && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300">
                            逾七天已鎖定
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 font-medium">
                        <span className="inline-flex items-center space-x-1 text-slate-900 font-bold font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{course.timeSlot}</span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            ({course.periodsCount || 3}節)
                          </span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center space-x-1 text-slate-700">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{course.classroom || '未排定教室'}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center space-x-1 text-slate-600">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{course.studentCount || (course.studentIds?.length ?? 0)} 位學生</span>
                        </span>
                      </div>

                      {course.courseName && course.courseName !== course.className && (
                        <div className="text-xs sm:text-sm font-semibold text-slate-700 pt-0.5 break-words">
                          {course.courseName}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 pt-1 sm:pt-0">
                      {activeApprovedReq ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartAttendance(course);
                          }}
                          className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center space-x-1.5 transition-colors shadow-xs"
                        >
                          <span>前往補點名</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : isCompleted || isOverdueCourse ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRecord(course);
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center space-x-1.5 transition-colors"
                        >
                          <Eye className="w-4 h-4 text-slate-500" />
                          <span>{isOverdueCourse ? '檢視／申請補點' : '檢視紀錄'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartAttendance(course);
                          }}
                          className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs hover:shadow transition-all inline-flex items-center justify-center space-x-2 text-white ${
                            isInSession
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-indigo-600 hover:bg-indigo-700'
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
            })}

            {/* Modified / Cancelled / Rescheduled-out courses retained with explicit badges */}
            {modifiedTodayCourses.map((course) => {
              const isRescheduledOut = course.status === 'rescheduled_out';
              const targetDate = course.rescheduleInfo?.targetDate;
              const reasonText = isRescheduledOut
                ? targetDate
                  ? `調至 ${targetDate}`
                  : course.rescheduleInfo?.reason || ''
                : course.cancelReason || '';

              return (
                <div
                  key={course.id}
                  className={`rounded-2xl border p-4 sm:p-5 shadow-2xs ${
                    isRescheduledOut
                      ? 'bg-amber-50/30 border-amber-200/80'
                      : 'bg-rose-50/30 border-rose-200/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg sm:text-xl font-black text-slate-600 line-through tracking-tight break-words">
                          {course.className}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${
                            isRescheduledOut
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {isRescheduledOut ? '已調出' : '停課'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 font-medium">
                        <span className="inline-flex items-center space-x-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{course.timeSlot}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{course.classroom || '未排定教室'}</span>
                        </span>
                        {reasonText && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-600">{reasonText}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                        免點名
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Date Picker Wheel Modal */}
      <DatePickerWheelModal
        isOpen={isDatePickerModalOpen}
        onClose={() => setIsDatePickerModalOpen(false)}
        selectedDate={selectedDate}
        onConfirm={(newDate) => onSelectDate(newDate)}
      />
    </div>
  );
};

