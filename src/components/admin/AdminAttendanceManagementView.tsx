import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  Eye, 
  X, 
  CheckCircle,
  Image as ImageIcon,
  ExternalLink,
  ClipboardCheck,
  History,
  Check,
  XCircle,
  RefreshCw,
  Search
} from 'lucide-react';
import {
  CourseSession,
  Student,
  ClassEntity,
  TransferClassRecord,
  AttendanceMakeupRequest,
  AttendanceAuditLog,
} from '../../types';
import { getTodayDateStr } from '../../utils/quarterScheduler';
import { calculateAttendanceStats, isSessionCancelledOrSuspended } from '../../utils/attendanceUtils';
import { getSessionRoster } from '../../utils/studentTimelineUtils';
import { StudentAvatar } from '../StudentAvatar';
import { InfoTooltip } from '../common/InfoTooltip';

type AdminAttendanceSubTab = 'monitor' | 'makeup_requests' | 'audit_logs';

interface AdminAttendanceManagementViewProps {
  allCourses: CourseSession[];
  students: Student[];
  classes: ClassEntity[];
  transferRecords?: TransferClassRecord[];
  makeupRequests?: AttendanceMakeupRequest[];
  auditLogs?: AttendanceAuditLog[];
  onSelectStudentDetail: (student: Student) => void;
  onReviewMakeupRequest?: (params: {
    requestId: string;
    decision: 'APPROVED' | 'REJECTED';
    reviewNotes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onRefresh?: () => Promise<void> | void;
}

export const AdminAttendanceManagementView: React.FC<AdminAttendanceManagementViewProps> = ({
  allCourses,
  students,
  classes,
  transferRecords = [],
  makeupRequests = [],
  auditLogs = [],
  onSelectStudentDetail,
  onReviewMakeupRequest,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<AdminAttendanceSubTab>('monitor');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStr());
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  // Inspect Modal
  const [inspectSession, setInspectSession] = useState<CourseSession | null>(null);

  // Makeup Review State
  const [makeupStatusFilter, setMakeupStatusFilter] = useState<string>('ALL');
  const [reviewingReq, setReviewingReq] = useState<{
    request: AttendanceMakeupRequest;
    decision: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Audit Log Filter State
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditClassFilter, setAuditClassFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const classMap = useMemo(() => {
    const map = new Map<string, ClassEntity>();
    classes.forEach((c) => map.set(String(c.id), c));
    return map;
  }, [classes]);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => map.set(String(s.id), s));
    return map;
  }, [students]);

  const pendingMakeupCount = useMemo(
    () => (makeupRequests || []).filter((r) => r.status === 'PENDING').length,
    [makeupRequests]
  );

  // Courses on selected date (exact class matching by classId or exact className)
  const dateCourses = useMemo(() => {
    return allCourses.filter((c) => {
      const matchDate = c.date === selectedDate;
      const matchClass =
        selectedClassId === 'ALL' ||
        c.classId === selectedClassId ||
        c.className === selectedClassId;
      return matchDate && matchClass;
    });
  }, [allCourses, selectedDate, selectedClassId]);

  // School-wide statistics across all classes for selected date
  const dayStats = useMemo(() => {
    let totalPresentHours = 0;
    let totalLeaveHours = 0;
    let totalAbsentHours = 0;
    let totalExpectedHours = 0;
    let totalStudentsCount = 0;
    let period1Present = 0, period1Leave = 0, period1Absent = 0;
    let period2Present = 0, period2Leave = 0, period2Absent = 0;
    let period3Present = 0, period3Leave = 0, period3Absent = 0;
    let period4Present = 0, period4Leave = 0, period4Absent = 0;
    let has3HClasses = false;
    let has4HClasses = false;

    dateCourses.forEach((session) => {
      const isCancelled = isSessionCancelledOrSuspended(session);
      const pCount = session.periodsCount || 3;
      if (pCount >= 3) has3HClasses = true;
      if (pCount >= 4) has4HClasses = true;

      const enrolled = getSessionRoster(session, students, transferRecords);

      if (isCancelled) {
        return;
      }

      totalStudentsCount += enrolled.length;

      if (session.status === 'completed' || session.attendanceData) {
        const sessionStats = calculateAttendanceStats(enrolled, session.attendanceData, pCount);
        totalPresentHours += sessionStats.totalPresentHours;
        totalLeaveHours += sessionStats.totalLeaveHours;
        totalAbsentHours += sessionStats.totalAbsentHours;
        totalExpectedHours += sessionStats.totalHours;

        period1Present += sessionStats.period1.present;
        period1Leave += sessionStats.period1.leave;
        period1Absent += sessionStats.period1.absent;

        period2Present += sessionStats.period2.present;
        period2Leave += sessionStats.period2.leave;
        period2Absent += sessionStats.period2.absent;

        if (sessionStats.period3) {
          period3Present += sessionStats.period3.present;
          period3Leave += sessionStats.period3.leave;
          period3Absent += sessionStats.period3.absent;
        }
        if (sessionStats.period4) {
          period4Present += sessionStats.period4.present;
          period4Leave += sessionStats.period4.leave;
          period4Absent += sessionStats.period4.absent;
        }
      }
    });

    const attendanceRate: number | null =
      totalExpectedHours > 0 ? Math.round((totalPresentHours / totalExpectedHours) * 100) : null;

    return {
      totalCourses: dateCourses.length,
      completedCourses: dateCourses.filter((c) => c.status === 'completed').length,
      totalStudentsCount,
      totalPresentHours,
      totalLeaveHours,
      totalAbsentHours,
      totalExpectedHours,
      attendanceRate,
      has3HClasses,
      has4HClasses,
      period1: { present: period1Present, leave: period1Leave, absent: period1Absent },
      period2: { present: period2Present, leave: period2Leave, absent: period2Absent },
      period3: { present: period3Present, leave: period3Leave, absent: period3Absent },
      period4: { present: period4Present, leave: period4Leave, absent: period4Absent },
    };
  }, [dateCourses, students, transferRecords]);

  const filteredMakeupRequests = useMemo(() => {
    return (makeupRequests || []).filter((r) => {
      if (makeupStatusFilter !== 'ALL' && r.status !== makeupStatusFilter) return false;
      return true;
    });
  }, [makeupRequests, makeupStatusFilter]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearchQuery.trim().toLowerCase();
    return (auditLogs || []).filter((log) => {
      if (auditClassFilter !== 'ALL' && log.classId !== auditClassFilter) return false;
      if (q) {
        const stu = studentMap.get(String(log.studentId));
        const cls = log.classId ? classMap.get(String(log.classId)) : undefined;
        const haystack = [
          stu?.name || '',
          stu?.englishName || '',
          stu?.studentNumber || '',
          cls?.name || '',
          log.sessionDate || '',
          log.reason || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditSearchQuery, auditClassFilter, studentMap, classMap]);

  const handleManualRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingReq || !onReviewMakeupRequest) return;
    setIsSubmittingReview(true);
    try {
      const res = await onReviewMakeupRequest({
        requestId: reviewingReq.request.id,
        decision: reviewingReq.decision,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      if (res.success) {
        setReviewingReq(null);
        setReviewNotes('');
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const formatPeriodBadge = (val?: string | null) => {
    if (!val) return '-';
    const u = String(val).toUpperCase();
    if (u === 'PRESENT') return '出席';
    if (u === 'LEAVE') return '請假';
    if (u === 'ABSENT') return '缺席';
    return val;
  };

  const formatAuditValue = (obj?: Record<string, any> | null) => {
    if (!obj) return '（無紀錄）';
    const parts: string[] = [];
    if (obj.period_1) parts.push(`1:${formatPeriodBadge(obj.period_1)}`);
    if (obj.period_2) parts.push(`2:${formatPeriodBadge(obj.period_2)}`);
    if (obj.period_3) parts.push(`3:${formatPeriodBadge(obj.period_3)}`);
    if (obj.period_4) parts.push(`4:${formatPeriodBadge(obj.period_4)}`);
    return parts.length > 0 ? parts.join(' / ') : '—';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#DCE2E6] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-[#536B7A] shrink-0 mt-0.5 sm:mt-0" />
            <h1 className="text-base sm:text-lg font-bold text-[#26313B] leading-snug">全校班級點名即時監控與歷史存檔</h1>
            <InfoTooltip
              title="點名監控與歷史存檔"
              content="即時監控全校所有班級與各排課日期的點名執行狀態、逾七天補點名申請審核及點名異動稽核紀錄。"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {subTab === 'monitor' && (
              <>
                <div className="flex items-center space-x-1.5 bg-[#F5F7F9] p-1.5 rounded-lg border border-[#DCE2E6] flex-1 sm:flex-none">
                  <Calendar className="w-4 h-4 text-[#536B7A] ml-1.5 shrink-0" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full sm:w-auto px-2 py-1 text-base sm:text-xs border-0 bg-transparent font-mono font-bold text-[#26313B] focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setSelectedDate(getTodayDateStr())}
                  className="px-3 py-2 bg-[#536B7A] hover:bg-[#455865] text-white font-semibold rounded-lg text-xs transition-colors shadow-2xs shrink-0"
                >
                  今日 ({getTodayDateStr().slice(5).replace('-', '/')})
                </button>
              </>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] border border-[#DCE2E6] font-semibold rounded-lg text-xs transition-colors flex items-center space-x-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>重新整理</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#F0F4F7]">
          <button
            id="tab-admin-att-monitor"
            type="button"
            onClick={() => setSubTab('monitor')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors border ${
              subTab === 'monitor'
                ? 'bg-[#26313B] text-white border-[#26313B]'
                : 'bg-[#F8FAFC] text-[#536B7A] border-[#DCE2E6] hover:bg-[#E8EEF2]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>即時點名監控</span>
          </button>

          <button
            id="tab-admin-att-makeup"
            type="button"
            onClick={() => setSubTab('makeup_requests')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors border ${
              subTab === 'makeup_requests'
                ? 'bg-[#26313B] text-white border-[#26313B]'
                : 'bg-[#F8FAFC] text-[#536B7A] border-[#DCE2E6] hover:bg-[#E8EEF2]'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>逾七天補點名審核</span>
            {pendingMakeupCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingMakeupCount}
              </span>
            )}
          </button>

          <button
            id="tab-admin-att-audit"
            type="button"
            onClick={() => setSubTab('audit_logs')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors border ${
              subTab === 'audit_logs'
                ? 'bg-[#26313B] text-white border-[#26313B]'
                : 'bg-[#F8FAFC] text-[#536B7A] border-[#DCE2E6] hover:bg-[#E8EEF2]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>點名異動稽核紀錄</span>
          </button>
        </div>
      </div>

      {subTab === 'monitor' && (
        <>
          {/* Real-time Attendance Statistics Dashboard */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 sm:p-5 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                    全校即時點名統計儀表板 • {selectedDate}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                    排課 {dayStats.totalCourses} 班 • 已點名 {dayStats.completedCourses} 班
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  當日綜合出席率：
                  {dayStats.attendanceRate === null ? (
                    <span className="text-2xl font-black ml-2 font-mono text-slate-400">—</span>
                  ) : (
                    <span
                      className={`text-2xl font-black ml-2 font-mono ${
                        dayStats.attendanceRate >= 90
                          ? 'text-emerald-400'
                          : dayStats.attendanceRate >= 80
                          ? 'text-yellow-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {dayStats.attendanceRate}%
                    </span>
                  )}
                </h2>
              </div>

              {/* Total Hours Breakdown */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <span className="text-slate-300">實到總時數:</span>
                  <span className="text-sm font-extrabold text-white font-mono">{dayStats.totalPresentHours} 小時</span>
                </div>

                <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                  <span className="text-slate-300">請假總時數:</span>
                  <span className="text-sm font-extrabold text-blue-300 font-mono">{dayStats.totalLeaveHours} 小時</span>
                </div>

                <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                  <span className="text-slate-300">缺席總時數:</span>
                  <span className="text-sm font-extrabold text-rose-300 font-mono">{dayStats.totalAbsentHours} 小時</span>
                </div>
              </div>
            </div>

            {/* Periods Individual Counters */}
            <div
              className={`grid grid-cols-1 ${
                dayStats.has4HClasses
                  ? 'md:grid-cols-4'
                  : dayStats.has3HClasses
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-2'
              } gap-3 pt-4`}
            >
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-teal-300">第 1 節 全校出缺</span>
                  <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-400">出席 {dayStats.period1.present}</span>
                  <span className="text-blue-300">請假 {dayStats.period1.leave}</span>
                  <span className="text-rose-400">缺席 {dayStats.period1.absent}</span>
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-teal-300">第 2 節 全校出缺</span>
                  <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-400">出席 {dayStats.period2.present}</span>
                  <span className="text-blue-300">請假 {dayStats.period2.leave}</span>
                  <span className="text-rose-400">缺席 {dayStats.period2.absent}</span>
                </div>
              </div>

              {dayStats.has3HClasses && (
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-300">第 3 節 全校出缺</span>
                    <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-emerald-400">出席 {dayStats.period3.present}</span>
                    <span className="text-blue-300">請假 {dayStats.period3.leave}</span>
                    <span className="text-rose-400">缺席 {dayStats.period3.absent}</span>
                  </div>
                </div>
              )}

              {dayStats.has4HClasses && (
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-300">第 4 節 全校出缺</span>
                    <span className="text-[11px] text-slate-400 font-mono">共 {dayStats.totalStudentsCount} 人次</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-emerald-400">出席 {dayStats.period4.present}</span>
                    <span className="text-blue-300">請假 {dayStats.period4.leave}</span>
                    <span className="text-rose-400">缺席 {dayStats.period4.absent}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Class Filter Badges (Exact ID match) */}
          <div className="bg-white p-3 rounded-xl border border-[#DCE2E6] shadow-2xs flex items-center space-x-2 overflow-x-auto">
            <span className="text-xs font-semibold text-[#66717C] shrink-0">班級篩選：</span>
            <button
              onClick={() => setSelectedClassId('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                selectedClassId === 'ALL'
                  ? 'bg-[#536B7A] text-white border-[#536B7A]'
                  : 'bg-[#F0F4F7] text-[#26313B] border-[#DCE2E6] hover:bg-[#E8EEF2]'
              }`}
            >
              全校所有班級
            </button>
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                  selectedClassId === c.id
                    ? 'bg-[#536B7A] text-white border-[#536B7A]'
                    : 'bg-[#F0F4F7] text-[#26313B] border-[#DCE2E6] hover:bg-[#E8EEF2]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Courses List on Selected Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dateCourses.length === 0 ? (
              <div className="col-span-full py-16 bg-white rounded-xl border border-[#DCE2E6] text-center text-[#66717C] text-xs">
                {selectedDate} 本日無排定課程或尚未安排課堂明細
              </div>
            ) : (
              dateCourses.map((session) => {
                const isCancelled = isSessionCancelledOrSuspended(session);
                const isCompleted = session.status === 'completed';
                const enrolledStudents = getSessionRoster(session, students, transferRecords);
                const sessionStats =
                  !isCancelled && session.attendanceData
                    ? calculateAttendanceStats(enrolledStudents, session.attendanceData, session.periodsCount || 3)
                    : null;

                return (
                  <div
                    key={session.id}
                    className="bg-white rounded-xl border border-[#DCE2E6] p-4 sm:p-5 shadow-2xs hover:border-[#536B7A]/40 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#26313B]">{session.className}</span>
                            <span className="text-xs font-semibold text-[#536B7A] bg-[#E8EEF2] px-2 py-0.5 rounded border border-[#DCE2E6]">
                              {session.classroom}
                            </span>
                          </div>
                          <div className="text-xs text-[#66717C] mt-1 break-words">
                            授課教師：<strong>{session.teacherName} 老師</strong> • 時段：{session.timeSlot}
                          </div>
                        </div>

                        {isCancelled ? (
                          <span className="inline-flex items-center self-start px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                            已停課（免點名）
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center self-start px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            已完成點名 {sessionStats ? `(${sessionStats.attendanceRate}%)` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center self-start px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8EEF2] text-slate-700 border border-[#DCE2E6] shrink-0">
                            <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />
                            待教師回報
                          </span>
                        )}
                      </div>

                      <div className="mt-3.5 p-3 bg-[#F8FAFC] rounded-lg text-xs space-y-1 border border-[#F0F4F7]">
                        <div className="text-[#26313B] font-semibold break-words">
                          進度教材：<strong>{session.textbook}</strong>
                        </div>
                        <div className="text-[#66717C] text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span>在班學生：{enrolledStudents.length} 人 • 授課節數：{session.periodsCount || 3} 節</span>
                          {isCancelled ? (
                            <span className="font-mono font-semibold text-rose-600">
                              {session.cancelReason || '停課不計出缺勤'}
                            </span>
                          ) : isCompleted && sessionStats ? (
                            <span className="font-mono font-bold text-emerald-700">
                              實到 {sessionStats.totalPresentHours}H / 請假 {sessionStats.totalLeaveHours}H
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#F0F4F7] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <span className="text-[11px] text-slate-400">點名資料與佐證文件即時同步中</span>
                      <button
                        onClick={() => setInspectSession(session)}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-[#536B7A] hover:bg-[#455865] text-white rounded-md text-xs font-semibold transition-colors inline-flex items-center justify-center space-x-1 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>查看點名表與佐證</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Sub-Tab 2: Over-7-Day Makeup Requests Review */}
      {subTab === 'makeup_requests' && (
        <div className="bg-white rounded-xl border border-[#DCE2E6] p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#26313B]">逾七天補點名／修改紀錄申請審核</h2>
              <p className="text-xs text-[#66717C] mt-0.5">
                核准後教師可於該堂課進行單次補點名或修正，送出成功後系統將自動鎖定該紀錄並記錄異動稽核。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: 'ALL', label: '全部' },
                { key: 'PENDING', label: '待審核' },
                { key: 'APPROVED', label: '已核准（待送出）' },
                { key: 'COMPLETED', label: '已完成補點' },
                { key: 'REJECTED', label: '已駁回' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMakeupStatusFilter(item.key)}
                  className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                    makeupStatusFilter === item.key
                      ? 'bg-[#536B7A] text-white border-[#536B7A]'
                      : 'bg-[#F8FAFC] text-[#26313B] border-[#DCE2E6] hover:bg-[#E8EEF2]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Card List (< md) */}
          <div className="block md:hidden space-y-3">
            {filteredMakeupRequests.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#66717C] bg-[#F8FAFC] rounded-xl border border-[#DCE2E6]">
                目前無符合條件的補點名申請紀錄
              </div>
            ) : (
              filteredMakeupRequests.map((req) => {
                const cls = classMap.get(String(req.classId));
                return (
                  <div
                    key={`mobile-req-${req.id}`}
                    className="rounded-xl border border-[#DCE2E6] bg-[#F8FAFC]/60 p-3.5 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-[#26313B] text-sm">{cls?.name || req.classId}</div>
                        <div className="font-mono text-[11px] text-[#536B7A] mt-0.5">
                          上課日：{req.sessionDate} • {req.teacherName || '授課教師'}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {req.status === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            待審核
                          </span>
                        )}
                        {req.status === 'APPROVED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            已核准（單次有效）
                          </span>
                        )}
                        {req.status === 'COMPLETED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            已完成補點
                          </span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            已駁回
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#66717C]">
                      <span className="px-2 py-0.5 rounded bg-white text-slate-700 font-semibold border border-slate-200">
                        {req.requestType === 'EDIT' ? '修改既有點名' : '補點名'}
                      </span>
                      <span className="font-mono">
                        申請時間：{req.createdAt ? req.createdAt.slice(0, 16).replace('T', ' ') : '—'}
                      </span>
                    </div>

                    <div className="bg-white rounded-lg p-2.5 border border-[#DCE2E6] space-y-1">
                      <div className="text-[#26313B] leading-relaxed break-words">{req.reason}</div>
                      {req.reviewNotes && (
                        <div className="text-[11px] text-[#66717C]">
                          審核備註：{req.reviewNotes}
                        </div>
                      )}
                    </div>

                    {req.status === 'PENDING' && onReviewMakeupRequest ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingReq({ request: req, decision: 'APPROVED' });
                            setReviewNotes('');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center justify-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>核准</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingReq({ request: req, decision: 'REJECTED' });
                            setReviewNotes('');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center justify-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>駁回</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#66717C] flex flex-wrap items-center justify-between gap-1 pt-0.5">
                        <span>
                          {req.reviewedAt ? `審核：${req.reviewerName || '管理員'} (${req.reviewedAt.slice(0, 10)})` : '—'}
                        </span>
                        {req.status === 'COMPLETED' && req.usedAt && (
                          <span className="text-[10px] font-mono text-emerald-700">
                            已核銷：{req.usedAt.slice(0, 16).replace('T', ' ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                  <th className="py-3 px-3">申請時間</th>
                  <th className="py-3 px-3">班級與日期</th>
                  <th className="py-3 px-3">申請教師</th>
                  <th className="py-3 px-3">申請類型</th>
                  <th className="py-3 px-3">申請原因</th>
                  <th className="py-3 px-3 text-center">審核狀態</th>
                  <th className="py-3 px-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F7]">
                {filteredMakeupRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#66717C]">
                      目前無符合條件的補點名申請紀錄
                    </td>
                  </tr>
                ) : (
                  filteredMakeupRequests.map((req) => {
                    const cls = classMap.get(String(req.classId));
                    return (
                      <tr key={req.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-3 font-mono text-[11px] text-[#66717C]">
                          {req.createdAt ? req.createdAt.slice(0, 16).replace('T', ' ') : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#26313B]">{cls?.name || req.classId}</div>
                          <div className="font-mono text-[11px] text-[#536B7A]">{req.sessionDate}</div>
                        </td>
                        <td className="py-3 px-3 font-medium text-[#26313B]">
                          {req.teacherName || '授課教師'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                            {req.requestType === 'EDIT' ? '修改既有點名' : '補點名'}
                          </span>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="text-[#26313B] leading-relaxed">{req.reason}</div>
                          {req.reviewNotes && (
                            <div className="text-[11px] text-[#66717C] mt-0.5">
                              審核備註：{req.reviewNotes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {req.status === 'PENDING' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              待審核
                            </span>
                          )}
                          {req.status === 'APPROVED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                              已核准（單次有效）
                            </span>
                          )}
                          {req.status === 'COMPLETED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              已完成補點
                            </span>
                          )}
                          {req.status === 'REJECTED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              已駁回
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {req.status === 'PENDING' && onReviewMakeupRequest ? (
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewingReq({ request: req, decision: 'APPROVED' });
                                  setReviewNotes('');
                                }}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center space-x-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>核准</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewingReq({ request: req, decision: 'REJECTED' });
                                  setReviewNotes('');
                                }}
                                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center space-x-1"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>駁回</span>
                              </button>
                            </div>
                          ) : (
                            <div className="text-[11px] text-[#66717C] space-y-0.5">
                              <div>
                                {req.reviewedAt ? `${req.reviewerName || '管理員'} (${req.reviewedAt.slice(0, 10)})` : '—'}
                              </div>
                              {req.status === 'COMPLETED' && req.usedAt && (
                                <div className="text-[10px] font-mono text-emerald-700">
                                  已核銷：{req.usedAt.slice(0, 16).replace('T', ' ')}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Attendance Audit Logs */}
      {subTab === 'audit_logs' && (
        <div className="bg-white rounded-xl border border-[#DCE2E6] p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#26313B]">全校點名異動稽核紀錄</h2>
              <p className="text-xs text-[#66717C] mt-0.5">
                追蹤點名修改前後的節次狀態變化、異動時間與原因說明。
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <select
                value={auditClassFilter}
                onChange={(e) => setAuditClassFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 sm:py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-[#F8FAFC] font-medium"
              >
                <option value="ALL">全部班級</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  placeholder="搜尋學生姓名 / 學號 / 異動原因"
                  className="pl-8 pr-3 py-2 sm:py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-[#F8FAFC] w-full focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Mobile Card List (< md) */}
          <div className="block md:hidden space-y-2.5">
            {filteredAuditLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#66717C] bg-[#F8FAFC] rounded-xl border border-[#DCE2E6]">
                目前查無符合條件的點名異動稽核紀錄
              </div>
            ) : (
              filteredAuditLogs.map((log) => {
                const stu = studentMap.get(String(log.studentId));
                const cls = log.classId ? classMap.get(String(log.classId)) : undefined;
                return (
                  <div
                    key={`mobile-audit-${log.id}`}
                    className="rounded-xl border border-[#DCE2E6] bg-[#F8FAFC]/60 p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {stu ? (
                          <button
                            type="button"
                            onClick={() => onSelectStudentDetail(stu)}
                            className="text-left hover:underline font-bold text-[#26313B] text-sm"
                          >
                            {stu.name} <span className="font-mono font-normal text-xs text-[#66717C]">({stu.studentNumber})</span>
                          </button>
                        ) : (
                          <span className="font-mono text-[#66717C]">{log.studentId}</span>
                        )}
                        <div className="text-[11px] text-[#536B7A] font-semibold mt-0.5">
                          {cls?.name || log.classId || '—'} • <span className="font-mono">{log.sessionDate || '—'}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-[#66717C] shrink-0">
                        {log.createdAt ? log.createdAt.slice(0, 16).replace('T', ' ') : '—'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 bg-white p-2.5 rounded-lg border border-[#DCE2E6] font-mono text-[11px]">
                      <div className="text-slate-600">
                        <span className="font-sans font-semibold text-slate-400 mr-1">變更前：</span>
                        {formatAuditValue(log.oldValue)}
                      </div>
                      <div className="font-bold text-teal-700">
                        <span className="font-sans font-semibold text-slate-400 mr-1">變更後：</span>
                        {formatAuditValue(log.newValue)}
                      </div>
                    </div>

                    <div className="text-[11px] text-[#26313B] break-words">
                      <span className="text-[#66717C]">原因：</span>
                      {log.reason || '點名狀態變更'}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                  <th className="py-3 px-3">異動時間</th>
                  <th className="py-3 px-3">班級與上課日期</th>
                  <th className="py-3 px-3">學生</th>
                  <th className="py-3 px-3">變更前</th>
                  <th className="py-3 px-3">變更後</th>
                  <th className="py-3 px-3">原因 / 備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F7]">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#66717C]">
                      目前查無符合條件的點名異動稽核紀錄
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => {
                    const stu = studentMap.get(String(log.studentId));
                    const cls = log.classId ? classMap.get(String(log.classId)) : undefined;
                    return (
                      <tr key={log.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-3 font-mono text-[11px] text-[#66717C]">
                          {log.createdAt ? log.createdAt.slice(0, 19).replace('T', ' ') : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#26313B]">{cls?.name || log.classId || '—'}</div>
                          <div className="font-mono text-[11px] text-[#536B7A]">{log.sessionDate || '—'}</div>
                        </td>
                        <td className="py-3 px-3">
                          {stu ? (
                            <button
                              type="button"
                              onClick={() => onSelectStudentDetail(stu)}
                              className="text-left hover:underline font-bold text-[#26313B]"
                            >
                              {stu.name} <span className="font-mono font-normal text-[#66717C]">({stu.studentNumber})</span>
                            </button>
                          ) : (
                            <span className="font-mono text-[#66717C]">{log.studentId}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                          {formatAuditValue(log.oldValue)}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] font-bold text-teal-700">
                          {formatAuditValue(log.newValue)}
                        </td>
                        <td className="py-3 px-3 text-[#26313B]">
                          {log.reason || '點名狀態變更'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Confirm Modal */}
      {reviewingReq && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden p-4 sm:p-5 shadow-2xl border border-[#DCE2E6] my-auto">
            <div className="shrink-0">
              <h3 className="text-sm font-bold text-[#26313B]">
                {reviewingReq.decision === 'APPROVED' ? '核准補點名申請（單次有效）' : '駁回補點名申請'}
              </h3>
              <p className="text-xs text-[#66717C] mt-1">
                班級：{classMap.get(String(reviewingReq.request.classId))?.name || reviewingReq.request.classId} • 日期：{reviewingReq.request.sessionDate}
              </p>
            </div>

            <form onSubmit={handleConfirmReview} className="mt-3 space-y-3 flex-1 overflow-y-auto">
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#DCE2E6] text-xs text-[#26313B] break-words">
                申請原因：{reviewingReq.request.reason}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26313B] mb-1">
                  審核備註（選填{reviewingReq.decision === 'REJECTED' ? '，建議說明駁回理由' : ''}）
                </label>
                <textarea
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="輸入審核備註..."
                  className="w-full px-3 py-2 text-base sm:text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A]/30"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:space-x-2 sm:gap-0 pt-2 border-t border-[#F0F4F7]">
                <button
                  type="button"
                  onClick={() => setReviewingReq(null)}
                  disabled={isSubmittingReview}
                  className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg text-center"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className={`w-full sm:w-auto px-4 py-2 sm:py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-50 text-center ${
                    reviewingReq.decision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingReview
                    ? '處理中...'
                    : reviewingReq.decision === 'APPROVED'
                    ? '確認核准'
                    : '確認駁回'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Attendance Sheet Modal */}
      {inspectSession && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90dvh] flex flex-col overflow-hidden p-4 sm:p-6 shadow-2xl border border-[#DCE2E6] my-auto">
            <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-[#F0F4F7] shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-[#26313B] flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="truncate">{inspectSession.className} • 點名表與事由稽核</span>
                </h2>
                <div className="text-xs text-[#66717C] mt-0.5 break-words">
                  日期：{inspectSession.date} • 授課教師：{inspectSession.teacherName} 老師 ({inspectSession.classroom})
                </div>
              </div>
              <button
                onClick={() => setInspectSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 flex-1 overflow-auto pr-1">
              <table className="w-full min-w-[600px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">學員</th>
                    <th className="py-2.5 px-3 text-center">第 1 節</th>
                    <th className="py-2.5 px-3 text-center">第 2 節</th>
                    {(inspectSession.periodsCount || 3) >= 3 && (
                      <th className="py-2.5 px-3 text-center">第 3 節</th>
                    )}
                    {(inspectSession.periodsCount || 3) >= 4 && (
                      <th className="py-2.5 px-3 text-center">第 4 節</th>
                    )}
                    <th className="py-2.5 px-3 text-left">點名備註事由</th>
                    <th className="py-2.5 px-3 text-center">佐證照片</th>
                    <th className="py-2.5 px-3 text-right">當日折算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {getSessionRoster(inspectSession, students, transferRecords).map((student) => {
                    const pCount = inspectSession.periodsCount || 3;
                    const att = inspectSession.attendanceData?.[student.id] || {
                      period1: 'present',
                      period2: 'present',
                      period3: pCount >= 3 ? 'present' : undefined,
                      period4: pCount >= 4 ? 'present' : undefined,
                    };

                    const renderBadge = (status?: string) => {
                      if (status === 'present')
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">出席</span>;
                      if (status === 'leave')
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8EEF2] text-[#536B7A] border border-[#DCE2E6]">請假</span>;
                      if (status === 'absent')
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">缺席</span>;
                      return <span className="text-slate-300">-</span>;
                    };

                    return (
                      <tr key={student.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectSession(null);
                              onSelectStudentDetail(student);
                            }}
                            className="flex items-center space-x-2 text-left hover:underline"
                          >
                            <StudentAvatar
                              avatarUrl={student.avatarUrl}
                              name={student.name}
                              sizeClassName="w-7 h-7"
                            />
                            <div>
                              <div className="font-bold text-[#26313B]">{student.name}</div>
                              <div className="text-[10px] text-[#66717C] font-mono">{student.studentNumber}</div>
                            </div>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center">{renderBadge(att.period1)}</td>
                        <td className="py-2.5 px-3 text-center">{renderBadge(att.period2)}</td>
                        {pCount >= 3 && (
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period3)}</td>
                        )}
                        {pCount >= 4 && (
                          <td className="py-2.5 px-3 text-center">{renderBadge(att.period4)}</td>
                        )}

                        {/* Remarks */}
                        <td className="py-2.5 px-3">
                          {att.remarks ? (
                            <span
                              className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block max-w-[150px] truncate"
                              title={att.remarks}
                            >
                              {att.remarks}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Evidence Image */}
                        <td className="py-2.5 px-3 text-center">
                          {att.evidenceImageUrl ? (
                            <a
                              href={att.evidenceImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-[11px] font-medium"
                              title="點擊檢視佐證照片"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                              <span>佐證圖</span>
                              <ExternalLink className="w-3 h-3 text-teal-500" />
                            </a>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Earned Hours / Ratio */}
                        <td className="py-2.5 px-3 text-right font-bold text-[#26313B] font-mono">
                          {(() => {
                            const periods = [att.period1, att.period2];
                            if (pCount >= 3) periods.push(att.period3);
                            if (pCount >= 4) periods.push(att.period4);
                            let sessionEarned = 0;
                            let sessionTotal = 0;
                            periods.forEach((p) => {
                              if (p) {
                                sessionTotal += 1;
                                if (p.toLowerCase() === 'present') sessionEarned += 1.0;
                                else if (p.toLowerCase() === 'leave') sessionEarned += 0.5;
                              }
                            });
                            return sessionTotal > 0 ? `${Math.round((sessionEarned / sessionTotal) * 100)}%` : '—';
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-[#F0F4F7] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shrink-0">
              <span className="text-[#66717C] text-[11px]">
                計分規則：每節出席 100% • 請假 50% • 缺席 0%
              </span>
              <button
                onClick={() => setInspectSession(null)}
                className="w-full sm:w-auto px-4 py-2 bg-[#F0F4F7] hover:bg-[#E8EEF2] text-[#26313B] border border-[#DCE2E6] rounded-xl font-semibold transition-colors text-center"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
