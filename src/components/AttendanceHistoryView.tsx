import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  Search, 
  Calendar, 
  Download, 
  Eye, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  Filter,
  Users
} from 'lucide-react';
import { CourseSession, Student, Teacher, AttendanceMakeupRequest } from '../types';
import { calculateAttendanceStats } from '../utils/attendanceUtils';
import { exportAttendanceSummaryToCsv } from '../utils/csvExport';

interface AttendanceHistoryViewProps {
  courses: CourseSession[];
  onOpenAttendance: (course: CourseSession) => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  currentTeacher?: Teacher;
  makeupRequests?: AttendanceMakeupRequest[];
}

export const AttendanceHistoryView: React.FC<AttendanceHistoryViewProps> = ({
  courses,
  onOpenAttendance,
  onShowToast,
  currentTeacher,
  makeupRequests = [],
}) => {
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('current');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Strictly scope courses to currentTeacher (Fail-Closed) if logged in as teacher
  const scopedCourses = useMemo(() => {
    if (currentTeacher) {
      const assignedIdSet = new Set(currentTeacher.assignedClassIds || []);
      const assignedSet = new Set(currentTeacher.assignedClasses || []);
      return courses.filter((c) => {
        const matchesTeacherId = Boolean(c.teacherId && c.teacherId === currentTeacher.id);
        const matchesClassId = Boolean(c.classId && assignedIdSet.has(c.classId));
        if (matchesTeacherId || matchesClassId) return true;
        const hasIdMetadata = Boolean(
          c.teacherId || (currentTeacher.assignedClassIds && currentTeacher.assignedClassIds.length > 0 && c.classId)
        );
        if (hasIdMetadata) return false;
        const matchesTeacherName = Boolean(c.teacherName && c.teacherName === currentTeacher.name);
        const matchesClassName = Boolean(
          (c.className && assignedSet.has(c.className)) ||
          (c.courseName && assignedSet.has(c.courseName))
        );
        return matchesTeacherName || matchesClassName;
      });
    }
    return courses;
  }, [courses, currentTeacher]);

  // Extract unique, valid, non-empty class names
  const availableClasses = useMemo(() => {
    return Array.from(
      new Set(
        scopedCourses
          .map((c) => c.className)
          .filter((name): name is string => Boolean(name && name.trim().length > 0))
      )
    ).sort();
  }, [scopedCourses]);

  const completedOrPastCourses = useMemo(() => {
    return scopedCourses.filter((c) => {
      // ScopedCourses already strictly filters by currentTeacher
      if (teacherFilter === 'current' && !currentTeacher) {
        return true;
      }
      if (selectedClassFilter !== 'all' && c.className !== selectedClassFilter) return false;
      if (selectedStatusFilter !== 'all') {
        if (selectedStatusFilter === 'completed' && c.status !== 'completed') return false;
        if (selectedStatusFilter === 'unmarked' && (c.status !== 'unmarked' || c.isCancelled || c.status === 'holiday')) return false;
        if (selectedStatusFilter === 'rescheduled' && !c.rescheduleInfo) return false;
        if (selectedStatusFilter === 'cancelled' && !c.isCancelled && c.status !== 'holiday') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.courseName.toLowerCase().includes(q) ||
          c.className.toLowerCase().includes(q) ||
          c.date.includes(q) ||
          c.textbook.toLowerCase().includes(q) ||
          c.classroom.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scopedCourses, teacherFilter, currentTeacher, selectedClassFilter, selectedStatusFilter, searchQuery]);

  const handleExportCSV = () => {
    if (completedOrPastCourses.length === 0) {
      onShowToast('目前查無符合條件之點名紀錄可匯出', 'warning');
      return;
    }
    const records = completedOrPastCourses.map((c) => {
      const isCancelled = c.isCancelled || c.isSuspended || c.status === 'holiday' || (c.status as string) === 'CANCELLED';
      let stats = undefined;
      if (!isCancelled && c.status === 'completed' && c.attendanceData) {
        const studentList = (c.studentIds || []).map((id) => ({ id, name: id } as Student));
        stats = calculateAttendanceStats(studentList, c.attendanceData);
      }
      const statusText =
        isCancelled
          ? '已停課（免點名）'
          : c.status === 'completed'
          ? '已完成點名'
          : c.status === 'unmarked'
          ? '待點名'
          : c.status === 'rescheduled_out'
          ? '已調課移出'
          : c.status === 'rescheduled_in'
          ? '調課移入'
          : c.status === 'locked'
          ? '已鎖定'
          : c.status;

      return {
        date: c.date,
        timeSlot: c.timeSlot,
        courseName: c.courseName,
        className: c.className,
        classroom: c.classroom,
        textbook: c.textbook,
        studentCount: c.studentCount,
        attendanceRate: isCancelled ? undefined : stats?.attendanceRate,
        presentHours: isCancelled ? 0 : stats?.totalPresentHours,
        totalHours: isCancelled ? 0 : stats?.totalHours,
        statusText,
      };
    });
    exportAttendanceSummaryToCsv(records, `學生出席紀錄總表_${selectedClassFilter !== 'all' ? selectedClassFilter : '全部班級'}`);
    onShowToast(`📥 已成功匯出 ${records.length} 筆點名與出席紀錄 (CSV)！`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              點名紀錄與補點名
            </h1>
          </div>

          <button
            onClick={handleExportCSV}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>匯出本學期點名總表 (CSV)</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 sm:mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-500 flex items-center mr-1">
              <Filter className="w-3.5 h-3.5 mr-1" />
              班級：
            </span>
            <button
              onClick={() => setSelectedClassFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                selectedClassFilter === 'all'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              全部班級
            </button>
            {availableClasses.map((cls) => (
              <button
                key={cls}
                onClick={() => setSelectedClassFilter(cls)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  selectedClassFilter === cls
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>

          <div className="w-full md:w-64">
            <input
              type="text"
              placeholder="搜尋課程名稱 / 日期 / 教材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-base sm:text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* History Cards - Mobile View (< md) */}
      <div className="block md:hidden space-y-3">
        {completedOrPastCourses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            查無符合條件之點名紀錄
          </div>
        ) : (
          completedOrPastCourses.map((course) => {
            const isCancelled = course.isCancelled || course.status === 'holiday' || (course.status as string) === 'CANCELLED';
            const isCompleted = !isCancelled && course.status === 'completed';
            const isRescheduledOut = course.status === 'rescheduled_out';
            const isRescheduledIn = course.status === 'rescheduled_in' || course.rescheduleInfo?.type === 'in';
            const isLocked = course.status === 'locked' || course.isLocked;

            const studentList = (course.studentIds || []).map((id) => ({ id, name: id } as Student));
            const stats = isCompleted && course.attendanceData
              ? calculateAttendanceStats(studentList, course.attendanceData)
              : null;

            const sessionReqs = (makeupRequests || [])
              .filter((r) => r.classId === course.classId && r.sessionDate === course.date)
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            const activeReq = sessionReqs.find((r) => r.status === 'APPROVED') || sessionReqs[0];

            return (
              <div
                key={`mobile-${course.id}`}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-slate-900">{course.date}</span>
                      <span className="text-[11px] font-mono text-slate-500">{course.timeSlot}</span>
                    </div>
                    <div className="font-extrabold text-slate-800 text-sm mt-1 break-words">{course.courseName}</div>
                    <div className="text-teal-700 font-semibold text-xs mt-0.5">{course.className} • {course.classroom}</div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {course.isCancelled || course.status === 'holiday' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        停課
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        已完成
                      </span>
                    ) : isRescheduledOut ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        已調出
                      </span>
                    ) : isRescheduledIn ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                        補課堂次
                      </span>
                    ) : isLocked ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                        已鎖定
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        待補點名
                      </span>
                    )}

                    {activeReq && activeReq.status === 'PENDING' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        待審核補點名
                      </span>
                    )}
                    {activeReq && activeReq.status === 'APPROVED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
                        已核准可補點
                      </span>
                    )}
                    {activeReq && activeReq.status === 'COMPLETED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                        已補點完成
                      </span>
                    )}
                    {activeReq && activeReq.status === 'REJECTED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        補點名已駁回
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-600 truncate max-w-full">
                    教材：{course.textbook} • {course.studentCount} 人
                  </span>
                  {stats && stats.attendanceRate !== null ? (
                    <span className="font-mono font-bold text-emerald-700">
                      出席 {stats.attendanceRate}% ({stats.totalPresentHours}/{stats.totalHours}H)
                    </span>
                  ) : isCancelled ? (
                    <span className="text-slate-400 text-[11px]">停課免計</span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">尚未結算</span>
                  )}
                </div>

                {!(course.isCancelled || course.status === 'holiday' || isRescheduledOut) && (
                  <button
                    onClick={() => onOpenAttendance(course)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center space-x-1.5 transition-colors cursor-pointer ${
                      activeReq?.status === 'APPROVED'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Eye className={`w-3.5 h-3.5 ${activeReq?.status === 'APPROVED' ? 'text-white' : 'text-slate-500'}`} />
                    <span>
                      {activeReq?.status === 'APPROVED'
                        ? '前往補點名'
                        : isLocked && !isCompleted
                        ? '檢視／申請補點'
                        : isCompleted
                        ? '檢視紀錄'
                        : '前往點名'}
                    </span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* History Table - Desktop View (>= md) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3.5 px-4">上課日期與時段</th>
                <th className="py-3.5 px-4">課程與班級</th>
                <th className="py-3.5 px-4">教材單元進度</th>
                <th className="py-3.5 px-3 text-center">學生人數</th>
                <th className="py-3.5 px-4 text-center">出席率統計</th>
                <th className="py-3.5 px-3 text-center">狀態</th>
                <th className="py-3.5 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {completedOrPastCourses.map((course) => {
                const isCancelled = course.isCancelled || course.status === 'holiday' || (course.status as string) === 'CANCELLED';
                const isCompleted = !isCancelled && course.status === 'completed';
                const isRescheduledOut = course.status === 'rescheduled_out';
                const isRescheduledIn = course.status === 'rescheduled_in' || course.rescheduleInfo?.type === 'in';
                const isLocked = course.status === 'locked' || course.isLocked;

                // Calculate rates
                const studentList = (course.studentIds || []).map((id) => ({ id, name: id } as Student));
                let rateBadge = null;
                if (isCompleted && course.attendanceData) {
                  const stats = calculateAttendanceStats(studentList, course.attendanceData);
                  if (stats.attendanceRate !== null) {
                    rateBadge = (
                      <div className="flex flex-col items-center space-y-0.5">
                        <span className="font-mono font-extrabold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {stats.attendanceRate}%
                        </span>
                        <span className="text-[10px] text-slate-500">
                          實到 {stats.totalPresentHours} / 應到 {stats.totalHours}H
                        </span>
                      </div>
                    );
                  }
                } else if (isCancelled) {
                  rateBadge = (
                    <span className="text-slate-400 text-[11px]">停課免計</span>
                  );
                }

                const sessionReqs = (makeupRequests || [])
                  .filter((r) => r.classId === course.classId && r.sessionDate === course.date)
                  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                const activeReq = sessionReqs.find((r) => r.status === 'APPROVED') || sessionReqs[0];

                return (
                  <tr key={course.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-slate-900">{course.date}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{course.timeSlot}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-800 text-sm">{course.courseName}</div>
                      <div className="text-teal-700 font-semibold text-[11px] mt-0.5">{course.className}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-700 line-clamp-1 max-w-xs">{course.textbook}</div>
                      <div className="text-slate-400 text-[10px] mt-0.5">{course.classroom}</div>
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-800">
                      {course.studentCount} 人
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {rateBadge || (
                        <span className="text-slate-400 text-[11px]">尚未結算</span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {course.isCancelled || course.status === 'holiday' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            停課
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            已完成
                          </span>
                        ) : isRescheduledOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            已調出
                          </span>
                        ) : isRescheduledIn ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                            補課堂次
                          </span>
                        ) : isLocked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                            已鎖定
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            待補點名
                          </span>
                        )}
                        {activeReq && activeReq.status === 'PENDING' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            待審核補點名
                          </span>
                        )}
                        {activeReq && activeReq.status === 'APPROVED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
                            已核准可補點
                          </span>
                        )}
                        {activeReq && activeReq.status === 'COMPLETED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                            已補點完成
                          </span>
                        )}
                        {activeReq && activeReq.status === 'REJECTED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            補點名已駁回
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {course.isCancelled || course.status === 'holiday' ? (
                        <span className="text-slate-400 text-[11px]">停課免點名</span>
                      ) : isRescheduledOut ? (
                        <span className="text-slate-400 text-[11px]">已移轉至補課日</span>
                      ) : (
                        <button
                          onClick={() => onOpenAttendance(course)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1 transition-colors cursor-pointer ${
                            activeReq?.status === 'APPROVED'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                          }`}
                        >
                          <Eye className={`w-3.5 h-3.5 ${activeReq?.status === 'APPROVED' ? 'text-white' : 'text-slate-500'}`} />
                          <span>
                            {activeReq?.status === 'APPROVED'
                              ? '前往補點名'
                              : isLocked && !isCompleted
                              ? '檢視／申請補點'
                              : isCompleted
                              ? '檢視紀錄'
                              : '前往點名'}
                          </span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
