import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Save, 
  RotateCcw, 
  FileText, 
  Users, 
  BookOpen, 
  MapPin, 
  AlertCircle, 
  Check, 
  X, 
  UserMinus, 
  MessageSquare,
  Lock,
  Calendar,
  Sparkles
} from 'lucide-react';
import { 
  CourseSession, 
  Student, 
  StudentPeriodAttendance, 
  AttendanceStatus, 
  LeaveRecord 
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import { 
  calculateAttendanceStats, 
  getDefaultAttendanceForStudents, 
  applyApprovedLeaves,
  getStudentIndividualHours 
} from '../utils/attendanceUtils';
import { TODAY_DATE, getDaysDifference } from '../utils/quarterScheduler';

interface AttendanceSheetProps {
  course: CourseSession;
  students: Student[];
  leaveRecords: LeaveRecord[];
  onSave: (courseId: string, attendanceData: { [studentId: string]: StudentPeriodAttendance }, status: 'in_progress' | 'completed') => void;
  onBack: () => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  isReadOnly?: boolean;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  course,
  students,
  leaveRecords,
  onSave,
  onBack,
  onShowToast,
  isReadOnly: explicitReadOnly = false,
}) => {
  const periodsCount = course.periodsCount || 3;
  const is3H = periodsCount >= 3;
  const is4H = periodsCount >= 4;

  // Check 7-day makeup deadline:
  // If course.date < TODAY_DATE and days difference > 7 days, it's overdue
  const daysSinceCourse = getDaysDifference(TODAY_DATE, course.date);
  const isOverdue = daysSinceCourse > 7;
  const isReadOnly = explicitReadOnly || isOverdue || course.isLocked;

  // Initialize state: default to all present
  const [attendance, setAttendance] = useState<{ [studentId: string]: StudentPeriodAttendance }>(() => {
    if (course.attendanceData && Object.keys(course.attendanceData).length > 0) {
      return JSON.parse(JSON.stringify(course.attendanceData));
    }
    return getDefaultAttendanceForStudents(students, periodsCount);
  });

  const [activeRemarkStudentId, setActiveRemarkStudentId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');

  // Calculate live statistics
  const stats = useMemo(() => {
    return calculateAttendanceStats(students, attendance, periodsCount);
  }, [students, attendance, periodsCount]);

  // Check approved leaves for this date
  const applicableLeaves = useMemo(() => {
    return leaveRecords.filter((l) => l.date === course.date && l.status === 'approved');
  }, [leaveRecords, course.date]);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!filterQuery.trim()) return students;
    const q = filterQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.englishName.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.nationality.toLowerCase().includes(q)
    );
  }, [students, filterQuery]);

  // Set single period status
  const handleSetPeriodStatus = (
    studentId: string, 
    periodKey: 'period1' | 'period2' | 'period3' | 'period4', 
    status: AttendanceStatus
  ) => {
    if (isReadOnly) return;
    setAttendance((prev) => {
      const current = prev[studentId] || { 
        period1: 'present', 
        period2: 'present', 
        period3: is3H ? 'present' : undefined,
        period4: is4H ? 'present' : undefined,
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          [periodKey]: status,
        },
      };
    });
  };

  // Batch set for single student (All Present / All Leave / All Absent)
  const handleBatchStudentStatus = (studentId: string, status: AttendanceStatus) => {
    if (isReadOnly) return;
    setAttendance((prev) => {
      const current = prev[studentId] || { 
        period1: 'present', 
        period2: 'present', 
        period3: is3H ? 'present' : undefined,
        period4: is4H ? 'present' : undefined,
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          period1: status,
          period2: status,
          period3: is3H ? status : undefined,
          period4: is4H ? status : undefined,
          remarks: status === 'leave' ? (current.remarks || '整堂請假') : status === 'absent' ? (current.remarks || '整堂曠課缺席') : '',
        },
      };
    });
    onShowToast(`已將該學生全部 ${periodsCount} 節課設為「${status === 'present' ? '出席' : status === 'leave' ? '請假' : '缺席'}」`, 'info');
  };

  // Batch set ALL students all periods to Present
  const handleSetAllPresent = () => {
    if (isReadOnly) return;
    const reset = getDefaultAttendanceForStudents(students, periodsCount);
    setAttendance(reset);
    onShowToast(`已將全班學生共 ${periodsCount} 節課全數設為「🟢 出席」`, 'success');
  };

  // Apply approved leave list
  const handleApplyApprovedLeaves = () => {
    if (isReadOnly) return;
    const { updatedAttendance, appliedCount } = applyApprovedLeaves(
      attendance,
      students,
      leaveRecords,
      course.date,
      periodsCount
    );
    setAttendance(updatedAttendance);
    if (appliedCount > 0) {
      onShowToast(`成功依請假系統自動套用 ${appliedCount} 筆已核准請假紀錄！`, 'success');
    } else {
      onShowToast('本日無此班級之核准請假紀錄', 'info');
    }
  };

  // Save remark
  const handleSaveRemark = (studentId: string) => {
    setAttendance((prev) => {
      const current = prev[studentId] || { 
        period1: 'present', 
        period2: 'present', 
        period3: is3H ? 'present' : undefined 
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          remarks: remarkInput,
        },
      };
    });
    setActiveRemarkStudentId(null);
    setRemarkInput('');
    onShowToast('備註已更新', 'info');
  };

  // Submit Handler
  const handleSubmit = (targetStatus: 'in_progress' | 'completed') => {
    onSave(course.id, attendance, targetStatus);
    onShowToast(
      targetStatus === 'completed'
        ? `🎉 點名已完成！${course.courseName}（${course.className}）出席率 ${stats.attendanceRate}%`
        : `點名紀錄已暫存為「進行中」`,
      'success'
    );
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Top Breadcrumb & Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <button
                id="btn-back-to-courses"
                onClick={onBack}
                className="flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回課程列表</span>
              </button>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                教師{periodsCount}節分節點名表 ({periodsCount} 小時班)
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {course.courseName}
              </h1>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-600 text-white">
                {course.className}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 text-white">
                {course.date} ({course.timeSlot})
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                {periodsCount} 節課制
              </span>
              {course.rescheduleInfo && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  🔵 補課／調課堂次（原定 {course.rescheduleInfo.originalDate}）
                </span>
              )}
            </div>

            <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2">
              <span className="flex items-center">
                <BookOpen className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {course.textbook}
              </span>
              <span>•</span>
              <span className="flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {course.classroom}
              </span>
              <span>•</span>
              <span className="flex items-center font-semibold text-slate-700">
                <Users className="w-3.5 h-3.5 mr-1 text-slate-400" />
                應到學生 {students.length} 人 (共 {periodsCount} 節課 / 總計 {students.length * periodsCount} 小時)
              </span>
            </div>
          </div>

          {/* Quick Status Tag on top right */}
          <div className="flex flex-col items-end justify-center">
            {isOverdue ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300">
                <Lock className="w-3.5 h-3.5 mr-1" />
                🔒 已超過補點名期限 (逾一週鎖定)
              </span>
            ) : isReadOnly ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                🔒 僅供檢視紀錄
              </span>
            ) : course.status === 'completed' ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                🟢 已完成狀態 (可再次修改更新)
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                🟠 待點名 / 點名編輯中
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Statistics Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
          <div>
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">即時點名統計儀表板</span>
            <h2 className="text-lg font-bold text-white mt-0.5">
              全堂出席率：
              <span className={`text-2xl font-black ml-2 ${
                stats.attendanceRate >= 90 ? 'text-emerald-400' : stats.attendanceRate >= 80 ? 'text-yellow-400' : 'text-rose-400'
              }`}>
                {stats.attendanceRate}%
              </span>
            </h2>
          </div>

          {/* Total Hours Breakdown */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300">出席總時數:</span>
              <span className="text-sm font-extrabold text-white font-mono">{stats.totalPresentHours} 小時</span>
            </div>

            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <span className="text-slate-300">請假總時數:</span>
              <span className="text-sm font-extrabold text-blue-300 font-mono">{stats.totalLeaveHours} 小時</span>
            </div>

            <div className="bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span className="text-slate-300">缺席總時數:</span>
              <span className="text-sm font-extrabold text-rose-300 font-mono">{stats.totalAbsentHours} 小時</span>
            </div>
          </div>
        </div>

        {/* Periods Individual Counters */}
        <div className={`grid grid-cols-1 ${is3H ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3 pt-4`}>
          {/* Period 1 */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-teal-300">第 1 節 ({course.periodTimes[0] || '第1節'})</span>
              <span className="text-[11px] text-slate-400 font-mono">共 {stats.totalStudents} 人</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-400">🟢 出席 {stats.period1.present}</span>
              <span className="text-blue-300">🔵 請假 {stats.period1.leave}</span>
              <span className="text-rose-400">🔴 缺席 {stats.period1.absent}</span>
            </div>
          </div>

          {/* Period 2 */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-teal-300">第 2 節 ({course.periodTimes[1] || '第2節'})</span>
              <span className="text-[11px] text-slate-400 font-mono">共 {stats.totalStudents} 人</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-400">🟢 出席 {stats.period2.present}</span>
              <span className="text-blue-300">🔵 請假 {stats.period2.leave}</span>
              <span className="text-rose-400">🔴 缺席 {stats.period2.absent}</span>
            </div>
          </div>

          {/* Period 3 (Only if 3-hour class!) */}
          {is3H && stats.period3 && (
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-teal-300">第 3 節 ({course.periodTimes[2] || '第3節'})</span>
                <span className="text-[11px] text-slate-400 font-mono">共 {stats.totalStudents} 人</span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-emerald-400">🟢 出席 {stats.period3.present}</span>
                <span className="text-blue-300">🔵 請假 {stats.period3.leave}</span>
                <span className="text-rose-400">🔴 缺席 {stats.period3.absent}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Batch Actions & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Quick Batch Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {!isReadOnly && (
            <>
              <button
                id="btn-all-present"
                onClick={handleSetAllPresent}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
                title={`所有學生的 ${periodsCount} 節課都預設為出席`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>全部{periodsCount}節設為出席</span>
              </button>

              <button
                id="btn-apply-leaves"
                onClick={handleApplyApprovedLeaves}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
                title="自動將今日已核准之請假單套用至學生節次"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>依請假名單一鍵套用 ({applicableLeaves.length} 筆)</span>
              </button>

              <button
                onClick={handleSetAllPresent}
                className="flex items-center space-x-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-medium text-xs transition-colors"
                title="重設所有狀態為預設值"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重設</span>
              </button>
            </>
          )}
        </div>

        {/* Right: Search Filter */}
        <div className="w-full md:w-64">
          <input
            type="text"
            placeholder="搜尋學生姓名 / 學號 / 國籍..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Student Attendance Roster Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-4 w-12 text-center">#</th>
                <th className="py-3.5 px-4 min-w-[200px]">學生資訊</th>
                <th className="py-3.5 px-3 text-center min-w-[150px]">
                  <div>第 1 節</div>
                  <div className="text-[10px] font-normal text-slate-500">{course.periodTimes[0] || '09:00-09:50'}</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[150px]">
                  <div>第 2 節</div>
                  <div className="text-[10px] font-normal text-slate-500">{course.periodTimes[1] || '10:00-10:50'}</div>
                </th>
                {is3H && (
                  <th className="py-3.5 px-3 text-center min-w-[150px]">
                    <div>第 3 節</div>
                    <div className="text-[10px] font-normal text-slate-500">{course.periodTimes[2] || '11:00-11:50'}</div>
                  </th>
                )}
                {is4H && (
                  <th className="py-3.5 px-3 text-center min-w-[150px]">
                    <div>第 4 節</div>
                    <div className="text-[10px] font-normal text-slate-500">{course.periodTimes[3] || '12:00-12:50'}</div>
                  </th>
                )}
                <th className="py-3.5 px-3 text-center min-w-[140px]">整堂快捷</th>
                <th className="py-3.5 px-4 text-center min-w-[110px]">今日統計</th>
                <th className="py-3.5 px-4 text-right min-w-[100px]">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.map((student, index) => {
                const record = attendance[student.id] || {
                  period1: 'present',
                  period2: 'present',
                  period3: is3H ? 'present' : undefined,
                };
                const studentHours = getStudentIndividualHours(record, periodsCount);
                const approvedLeave = applicableLeaves.find(
                  (l) => l.studentId === student.id || l.studentName === student.name
                );

                const hasIssue = record.period1 !== 'present' || record.period2 !== 'present' || (is3H && record.period3 !== 'present');

                return (
                  <tr
                    key={student.id}
                    id={`student-row-${student.id}`}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      hasIssue ? 'bg-amber-50/20' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="py-3 px-4 text-center font-mono text-slate-400 font-semibold">
                      {index + 1}
                    </td>

                    {/* Student Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-10 h-10" />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-extrabold text-slate-900 text-sm">{student.name}</span>
                            <span className="text-[11px] font-medium text-slate-500">{student.englishName}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono">{student.studentNumber}</span>
                            <span>•</span>
                            <span className="bg-slate-100 text-slate-700 px-1 rounded font-medium">
                              {student.nationality}
                            </span>
                          </div>
                          {approvedLeave && (
                            <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                              <span>📝 {approvedLeave.typeName}已核准</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Period 1 Toggle Buttons */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period1', 'present')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period1 === 'present'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          出席
                        </button>
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period1', 'leave')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period1 === 'leave'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          請假
                        </button>
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period1', 'absent')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period1 === 'absent'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          缺席
                        </button>
                      </div>
                    </td>

                    {/* Period 2 Toggle Buttons */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period2', 'present')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period2 === 'present'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          出席
                        </button>
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period2', 'leave')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period2 === 'leave'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          請假
                        </button>
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleSetPeriodStatus(student.id, 'period2', 'absent')}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            record.period2 === 'absent'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          缺席
                        </button>
                      </div>
                    </td>

                    {/* Period 3 Toggle Buttons (If >= 3-hour class) */}
                    {is3H && (
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period3', 'present')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period3 === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            出席
                          </button>
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period3', 'leave')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period3 === 'leave'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            請假
                          </button>
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period3', 'absent')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period3 === 'absent'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            缺席
                          </button>
                        </div>
                      </td>
                    )}

                    {/* Period 4 Toggle Buttons (If >= 4-hour class) */}
                    {is4H && (
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period4', 'present')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period4 === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            出席
                          </button>
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period4', 'leave')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period4 === 'leave'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            請假
                          </button>
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, 'period4', 'absent')}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                              record.period4 === 'absent'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            缺席
                          </button>
                        </div>
                      </td>
                    )}

                    {/* Batch Actions for this student */}
                    <td className="py-3 px-3 text-center">
                      {!isReadOnly ? (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleBatchStudentStatus(student.id, 'present')}
                            title={`一鍵將 ${periodsCount} 節全設為出席`}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold transition-colors"
                          >
                            全到
                          </button>
                          <button
                            onClick={() => handleBatchStudentStatus(student.id, 'leave')}
                            title={`一鍵將 ${periodsCount} 節全設為請假`}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[11px] font-bold transition-colors"
                          >
                            整堂請假
                          </button>
                          <button
                            onClick={() => handleBatchStudentStatus(student.id, 'absent')}
                            title={`一鍵將 ${periodsCount} 節全設為缺席`}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold transition-colors"
                          >
                            整堂缺席
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Today Summary */}
                    <td className="py-3 px-4 text-center">
                      <div className="font-mono text-xs">
                        {studentHours.present === periodsCount ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            {periodsCount}H 全勤
                          </span>
                        ) : studentHours.absent > 0 ? (
                          <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded">
                            缺 {studentHours.absent}H
                          </span>
                        ) : (
                          <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                            假 {studentHours.leave}H
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Remarks */}
                    <td className="py-3 px-4 text-right">
                      {activeRemarkStudentId === student.id ? (
                        <div className="flex items-center justify-end space-x-1">
                          <input
                            type="text"
                            value={remarkInput}
                            onChange={(e) => setRemarkInput(e.target.value)}
                            placeholder="輸入事由..."
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRemark(student.id)}
                            className="p-1 bg-teal-600 text-white rounded hover:bg-teal-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setActiveRemarkStudentId(null)}
                            className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-1">
                          {record.remarks ? (
                            <span 
                              onClick={() => {
                                if (!isReadOnly) {
                                  setActiveRemarkStudentId(student.id);
                                  setRemarkInput(record.remarks || '');
                                }
                              }}
                              className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded max-w-[120px] truncate cursor-pointer hover:bg-slate-200"
                              title={record.remarks}
                            >
                              {record.remarks}
                            </span>
                          ) : !isReadOnly ? (
                            <button
                              onClick={() => {
                                setActiveRemarkStudentId(student.id);
                                setRemarkInput('');
                              }}
                              className="text-slate-400 hover:text-slate-600 p-1"
                              title="新增備註"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bottom Sticky Action Bar */}
      {!isReadOnly && (
        <div className="fixed bottom-4 left-64 right-4 z-40 flex items-center justify-between bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-xs text-slate-400">目前點名進度</span>
              <div className="text-sm font-extrabold text-white">
                全堂出席率 <span className="text-teal-400 font-mono text-base">{stats.attendanceRate}%</span> (實到 {stats.totalPresentHours} / 應到 {stats.totalHours} 小時)
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              id="btn-save-draft"
              onClick={() => handleSubmit('in_progress')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-colors"
            >
              暫存草稿
            </button>

            <button
              id="btn-submit-attendance"
              onClick={() => handleSubmit('completed')}
              className="flex items-center space-x-1.5 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-teal-900/50 transition-all hover:scale-[1.02]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>完成點名並送出紀錄</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
