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
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { 
  CourseSession, 
  Student, 
  StudentPeriodAttendance, 
  AttendanceStatus, 
  LeaveRecord 
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import { StudentRemarkModal } from './StudentRemarkModal';
import { 
  calculateAttendanceStats, 
  getDefaultAttendanceForStudents, 
  applyApprovedLeaves,
  getStudentIndividualHours 
} from '../utils/attendanceUtils';
import { getTodayDateStr, getDaysDifference } from '../utils/quarterScheduler';

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
  // If course.date < today and days difference > 7 days, it's overdue
  const todayDateStr = getTodayDateStr();
  const daysSinceCourse = getDaysDifference(todayDateStr, course.date);
  const isOverdue = course.date < todayDateStr && daysSinceCourse > 7;
  const isReadOnly = explicitReadOnly || isOverdue || course.isLocked;

  // Initialize state: default to all present
  const [attendance, setAttendance] = useState<{ [studentId: string]: StudentPeriodAttendance }>(() => {
    if (course.attendanceData && Object.keys(course.attendanceData).length > 0) {
      return JSON.parse(JSON.stringify(course.attendanceData));
    }
    return getDefaultAttendanceForStudents(students, periodsCount);
  });

  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Calculate live statistics
  const stats = useMemo(() => {
    return calculateAttendanceStats(students, attendance, periodsCount);
  }, [students, attendance, periodsCount]);

  // Live count of actual present students (實到人數)
  const actualPresentStudentsCount = useMemo(() => {
    return students.filter((s) => {
      const record = attendance[s.id];
      if (!record) return false;
      const periods = [record.period1, record.period2, record.period3, record.period4].slice(0, periodsCount);
      return periods.some((p) => p === 'present');
    }).length;
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

  // Multi-Student Selection Handlers
  const handleToggleSelectStudent = (studentId: string) => {
    if (isReadOnly) return;
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleSelectAllFilteredStudents = () => {
    if (isReadOnly || filteredStudents.length === 0) return;
    const allSelected = filteredStudents.every((s) => selectedStudentIds.has(s.id));
    if (allSelected) {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const handleClearStudentSelection = () => {
    setSelectedStudentIds(new Set());
  };

  // Batch set status for selected students (respecting period_1 ~ period_4)
  const handleBatchSetSelectedStatus = (status: AttendanceStatus) => {
    if (isReadOnly) return;
    const ids: string[] = Array.from(selectedStudentIds);
    if (ids.length === 0) return;

    setAttendance((prev) => {
      const updated = { ...prev };
      ids.forEach((id: string) => {
        const current = updated[id] || {
          period1: 'present',
          period2: 'present',
          period3: is3H ? 'present' : undefined,
          period4: is4H ? 'present' : undefined,
        };
        updated[id] = {
          ...current,
          period1: status,
          period2: status,
          period3: is3H ? status : undefined,
          period4: is4H ? status : undefined,
          remarks:
            status === 'leave'
              ? current.remarks || '整堂請假'
              : status === 'absent'
              ? current.remarks || '整堂曠課缺席'
              : current.remarks,
        };
      });
      return updated;
    });

    const statusLabel = status === 'present' ? '出席' : status === 'leave' ? '請假' : '缺席';
    onShowToast(`已將已選取的 ${ids.length} 位學生 ${periodsCount} 節課全數設為「${statusLabel}」`, 'success');
  };

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

  // Save remark & evidence from modal
  const handleRemarksUpdate = (studentId: string, updatedRemarks: string, evidenceImagePath?: string, evidenceImageUrl?: string) => {
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
          remarks: updatedRemarks || undefined,
          evidenceImagePath: evidenceImagePath || undefined,
          evidenceImageUrl: evidenceImageUrl || undefined,
        },
      };
    });
    onShowToast('學生點名備註與佐證資料已更新', 'success');
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
                className="flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回課程列表</span>
              </button>
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
              <span className="flex items-center font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                <Users className="w-3.5 h-3.5 mr-1.5 text-teal-600" />
                應到 {students.length} 人 / 實到 {actualPresentStudentsCount} 人
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

      {/* Multi-Student Selection Batch Action Bar */}
      {selectedStudentIds.size > 0 && !isReadOnly && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center space-x-2 text-teal-900 font-bold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
            <span>已選取 {selectedStudentIds.size} 位學生（共 {filteredStudents.length} 位）</span>
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <button
              onClick={() => handleBatchSetSelectedStatus('present')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center space-x-1 shadow-2xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>設為出席</span>
            </button>
            <button
              onClick={() => handleBatchSetSelectedStatus('leave')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center space-x-1 shadow-2xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>設為請假</span>
            </button>
            <button
              onClick={() => handleBatchSetSelectedStatus('absent')}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center space-x-1 shadow-2xs transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>設為缺席</span>
            </button>
            <button
              onClick={handleClearStudentSelection}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-medium transition-colors"
            >
              取消選取
            </button>
          </div>
        </div>
      )}

      {/* Student Attendance Roster Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))}
                    onChange={handleSelectAllFilteredStudents}
                    className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
                    title="全選 / 取消全選目前學生"
                  />
                </th>
                <th className="py-3.5 px-3 w-10 text-center">#</th>
                <th className="py-3.5 px-4 min-w-[160px]">學生資訊</th>
                <th className="py-3.5 px-2 text-center min-w-[95px]">
                  <div>第 1 節</div>
                  <div className="text-[10px] font-normal text-slate-500">{course?.periodTimes?.[0] || '09:00-09:50'}</div>
                </th>
                <th className="py-3.5 px-2 text-center min-w-[95px]">
                  <div>第 2 節</div>
                  <div className="text-[10px] font-normal text-slate-500">{course?.periodTimes?.[1] || '10:00-10:50'}</div>
                </th>
                {is3H && (
                  <th className="py-3.5 px-2 text-center min-w-[95px]">
                    <div>第 3 節</div>
                    <div className="text-[10px] font-normal text-slate-500">{course?.periodTimes?.[2] || '11:00-11:50'}</div>
                  </th>
                )}
                {is4H && (
                  <th className="py-3.5 px-2 text-center min-w-[95px]">
                    <div>第 4 節</div>
                    <div className="text-[10px] font-normal text-slate-500">{course?.periodTimes?.[3] || '12:00-12:50'}</div>
                  </th>
                )}
                <th className="py-3.5 px-3 text-center min-w-[140px]">整堂快捷</th>
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
                  (l) => String(l.studentId) === String(student.id)
                );

                const hasIssue = record.period1 !== 'present' || record.period2 !== 'present' || (is3H && record.period3 !== 'present');
                const isSelected = selectedStudentIds.has(student.id);

                return (
                  <tr
                    key={student.id}
                    id={`student-row-${student.id}`}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      isSelected
                        ? 'bg-teal-50/50 ring-1 ring-teal-400'
                        : hasIssue
                        ? 'bg-amber-50/20'
                        : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={isSelected}
                        onChange={() => handleToggleSelectStudent(student.id)}
                        className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
                      />
                    </td>

                    {/* Index */}
                    <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">
                      {index + 1}
                    </td>

                    {/* Student Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-10 h-10" />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-slate-900 text-sm">{student.name}</span>
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-medium border border-slate-200">
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

                    {/* Period 1 Compact Dropdown */}
                    <td className="py-3 px-2 text-center">
                      <select
                        disabled={isReadOnly}
                        value={record.period1 || 'present'}
                        onChange={(e) => handleSetPeriodStatus(student.id, 'period1', e.target.value as AttendanceStatus)}
                        className={`w-full max-w-[85px] mx-auto px-2 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                          record.period1 === 'present'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : record.period1 === 'leave'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        <option value="present" className="text-emerald-700 font-bold bg-white">出席</option>
                        <option value="leave" className="text-blue-700 font-bold bg-white">請假</option>
                        <option value="absent" className="text-rose-700 font-bold bg-white">缺席</option>
                      </select>
                    </td>

                    {/* Period 2 Compact Dropdown */}
                    <td className="py-3 px-2 text-center">
                      <select
                        disabled={isReadOnly}
                        value={record.period2 || 'present'}
                        onChange={(e) => handleSetPeriodStatus(student.id, 'period2', e.target.value as AttendanceStatus)}
                        className={`w-full max-w-[85px] mx-auto px-2 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                          record.period2 === 'present'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : record.period2 === 'leave'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        <option value="present" className="text-emerald-700 font-bold bg-white">出席</option>
                        <option value="leave" className="text-blue-700 font-bold bg-white">請假</option>
                        <option value="absent" className="text-rose-700 font-bold bg-white">缺席</option>
                      </select>
                    </td>

                    {/* Period 3 Compact Dropdown (If >= 3-hour class) */}
                    {is3H && (
                      <td className="py-3 px-2 text-center">
                        <select
                          disabled={isReadOnly}
                          value={record.period3 || 'present'}
                          onChange={(e) => handleSetPeriodStatus(student.id, 'period3', e.target.value as AttendanceStatus)}
                          className={`w-full max-w-[85px] mx-auto px-2 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                            record.period3 === 'present'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : record.period3 === 'leave'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          <option value="present" className="text-emerald-700 font-bold bg-white">出席</option>
                          <option value="leave" className="text-blue-700 font-bold bg-white">請假</option>
                          <option value="absent" className="text-rose-700 font-bold bg-white">缺席</option>
                        </select>
                      </td>
                    )}

                    {/* Period 4 Compact Dropdown (If >= 4-hour class) */}
                    {is4H && (
                      <td className="py-3 px-2 text-center">
                        <select
                          disabled={isReadOnly}
                          value={record.period4 || 'present'}
                          onChange={(e) => handleSetPeriodStatus(student.id, 'period4', e.target.value as AttendanceStatus)}
                          className={`w-full max-w-[85px] mx-auto px-2 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                            record.period4 === 'present'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : record.period4 === 'leave'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          <option value="present" className="text-emerald-700 font-bold bg-white">出席</option>
                          <option value="leave" className="text-blue-700 font-bold bg-white">請假</option>
                          <option value="absent" className="text-rose-700 font-bold bg-white">缺席</option>
                        </select>
                      </td>
                    )}

                    {/* Batch Actions for this student (整堂快捷) */}
                    <td className="py-3 px-3 text-center">
                      {!isReadOnly ? (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleBatchStudentStatus(student.id, 'present')}
                            title={`一鍵將 ${periodsCount} 節全設為出席`}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            全到
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchStudentStatus(student.id, 'leave')}
                            title={`一鍵將 ${periodsCount} 節全設為請假`}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            整堂請假
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchStudentStatus(student.id, 'absent')}
                            title={`一鍵將 ${periodsCount} 節全設為缺席`}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            整堂缺席
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Remarks & Evidence Button */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {record.remarks && (
                          <span 
                            onClick={() => setModalStudent(student)}
                            className="text-[11px] text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md max-w-[120px] truncate cursor-pointer border border-slate-200"
                            title={record.remarks}
                          >
                            {record.remarks}
                          </span>
                        )}

                        {record.evidenceImageUrl && (
                          <a
                            href={record.evidenceImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                            title="檢視佐證照片"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {!isReadOnly ? (
                          <button
                            type="button"
                            onClick={() => setModalStudent(student)}
                            className={`p-1 rounded-md transition-colors ${
                              record.remarks || record.evidenceImagePath 
                                ? 'text-teal-600 hover:bg-teal-50' 
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title={record.remarks ? "編輯事由與佐證照片" : "新增事由與佐證照片"}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        ) : !record.remarks && !record.evidenceImageUrl ? (
                          <span className="text-slate-400 text-[11px]">-</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Remark Modal */}
      {modalStudent && (
        <StudentRemarkModal
          isOpen={Boolean(modalStudent)}
          onClose={() => setModalStudent(null)}
          student={modalStudent}
          sessionId={course.id}
          courseName={course.courseName}
          className={course.className}
          currentAttendance={attendance[modalStudent.id] || { period1: 'present', period2: 'present' }}
          onSave={(newRemarks, imgPath, imgUrl) => handleRemarksUpdate(modalStudent.id, newRemarks, imgPath, imgUrl)}
          isReadOnly={isReadOnly}
        />
      )}

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
