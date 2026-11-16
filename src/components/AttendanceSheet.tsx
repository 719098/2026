import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  LeaveRecord,
  AttendanceMakeupRequest,
  MakeupRequestType
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import { StudentRemarkModal } from './StudentRemarkModal';
import { 
  calculateAttendanceStats, 
  getDefaultAttendanceForStudents,
  buildNormalizedAttendanceMap,
  applyApprovedLeaves,
  getStudentIndividualHours 
} from '../utils/attendanceUtils';
import { getTodayDateStr, getDaysDifference } from '../utils/quarterScheduler';

interface AttendanceSheetProps {
  course: CourseSession;
  students: Student[];
  leaveRecords: LeaveRecord[];
  onSave: (
    courseId: string,
    attendanceData: { [studentId: string]: StudentPeriodAttendance },
    status: 'in_progress' | 'completed',
    makeupRequest?: AttendanceMakeupRequest | null
  ) => void | Promise<boolean | void>;
  onBack: () => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  isReadOnly?: boolean;
  isTermLocked?: boolean;
  currentProfileId?: string;
  isAdmin?: boolean;
  makeupRequests?: AttendanceMakeupRequest[];
  onSubmitMakeupRequest?: (params: {
    requestType: MakeupRequestType;
    reason: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  course,
  students,
  leaveRecords,
  onSave,
  onBack,
  onShowToast,
  isReadOnly: explicitReadOnly = false,
  isTermLocked = false,
  currentProfileId,
  isAdmin = false,
  makeupRequests = [],
  onSubmitMakeupRequest,
}) => {
  const rawPeriodsCount = Number(course.periodsCount);
  const hasValidSchedule = Boolean(
    (rawPeriodsCount === 2 || rawPeriodsCount === 3 || rawPeriodsCount === 4) &&
      (course.startTime || '').trim() &&
      (course.endTime || '').trim()
  );
  const periodsCount = rawPeriodsCount === 2 || rawPeriodsCount === 3 || rawPeriodsCount === 4 ? rawPeriodsCount : 3;
  const is3H = periodsCount >= 3;
  const is4H = periodsCount >= 4;

  // Check 7-day makeup deadline:
  // If course.date < today and days difference > 7 days, it's overdue
  const todayDateStr = getTodayDateStr();
  const daysSinceCourse = getDaysDifference(todayDateStr, course.date);
  const isOverdue = course.date < todayDateStr && daysSinceCourse > 7;
  const isHardLocked = Boolean(
    isTermLocked ||
      course.isCancelled ||
      course.isSuspended ||
      course.status === 'holiday' ||
      course.status === 'rescheduled_out'
  );

  // Match makeup requests for this exact (classId, sessionDate)
  const sessionMakeupRequests = useMemo(() => {
    return (makeupRequests || [])
      .filter((r) => r.classId === course.classId && r.sessionDate === course.date)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [makeupRequests, course.classId, course.date]);

  const rawApprovedRequest = useMemo(
    () => sessionMakeupRequests.find((r) => r.status === 'APPROVED') || null,
    [sessionMakeupRequests]
  );
  const isApprovedByOtherRequester = Boolean(
    rawApprovedRequest &&
      !isAdmin &&
      currentProfileId &&
      rawApprovedRequest.requesterProfileId &&
      rawApprovedRequest.requesterProfileId !== currentProfileId
  );
  const activeApprovedRequest = isApprovedByOtherRequester ? null : rawApprovedRequest;

  const pendingMakeupRequest = useMemo(
    () => sessionMakeupRequests.find((r) => r.status === 'PENDING') || null,
    [sessionMakeupRequests]
  );
  const latestRejectedRequest = useMemo(
    () => (sessionMakeupRequests[0]?.status === 'REJECTED' ? sessionMakeupRequests[0] : null),
    [sessionMakeupRequests]
  );
  const latestCompletedRequest = useMemo(
    () => (sessionMakeupRequests[0]?.status === 'COMPLETED' ? sessionMakeupRequests[0] : null),
    [sessionMakeupRequests]
  );

  const isUnlockedByMakeup = Boolean(
    isOverdue && !isHardLocked && !explicitReadOnly && hasValidSchedule && activeApprovedRequest
  );
  const isReadOnly =
    explicitReadOnly ||
    isHardLocked ||
    !hasValidSchedule ||
    (isOverdue && !isUnlockedByMakeup) ||
    (!isOverdue && Boolean(course.isLocked));

  const [isSaving, setIsSaving] = useState(false);
  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  const [makeupRequestType, setMakeupRequestType] = useState<MakeupRequestType>(
    course.status === 'completed' ? 'EDIT' : 'MAKEUP'
  );
  const [makeupReason, setMakeupReason] = useState('');
  const [isSubmittingMakeup, setIsSubmittingMakeup] = useState(false);

  // Initialize state covering EVERY student in the session roster (prevents partial-roster RPC rejection)
  const [attendance, setAttendance] = useState<{ [studentId: string]: StudentPeriodAttendance }>(() =>
    buildNormalizedAttendanceMap(students, course.attendanceData, periodsCount)
  );
  const sessionSyncKeyRef = useRef<string>(`${course.id}_${course.date}_${periodsCount}`);

  useEffect(() => {
    const nextKey = `${course.id}_${course.date}_${periodsCount}`;
    if (sessionSyncKeyRef.current !== nextKey) {
      sessionSyncKeyRef.current = nextKey;
      setAttendance(buildNormalizedAttendanceMap(students, course.attendanceData, periodsCount));
      setSelectedStudentIds(new Set());
    } else {
      // Same session: preserve user edits while ensuring newly added roster students exist & stale keys removed
      setAttendance((prev) => buildNormalizedAttendanceMap(students, prev, periodsCount));
    }
  }, [course.id, course.date, periodsCount, course.attendanceData, students]);

  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Calculate live statistics
  const stats = useMemo(() => {
    return calculateAttendanceStats(students, attendance, periodsCount);
  }, [students, attendance, periodsCount]);

  // Live count of actual present students (實到人數：當日所有應上課節次皆為出席者始計入)
  const actualPresentStudentsCount = useMemo(() => {
    return students.filter((s) => {
      const record = attendance[s.id];
      if (!record) return false;
      const periods = [record.period1, record.period2, record.period3, record.period4].slice(0, periodsCount);
      return periods.length > 0 && periods.every((p) => p === 'present');
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

  // Submit Handler (awaits backend persistence before confirming)
  const handleSubmit = async (targetStatus: 'in_progress' | 'completed') => {
    if (isSaving) return;
    if (!hasValidSchedule) {
      onShowToast('此課堂缺少有效的排課節數（2/3/4 小時制）或上課起訖時間設定，請聯繫行政端確認排課設定。', 'warning');
      return;
    }
    if (!students || students.length === 0) {
      onShowToast('此課堂目前查無應到學生名單，無法送出點名紀錄', 'warning');
      return;
    }

    const normalizedPayload = buildNormalizedAttendanceMap(students, attendance, periodsCount);
    setIsSaving(true);
    try {
      const result = await onSave(
        course.id,
        normalizedPayload,
        targetStatus,
        isUnlockedByMakeup ? activeApprovedRequest : null
      );
      if (result === false || result === true) {
        return;
      }
      onShowToast(
        targetStatus === 'completed'
          ? `點名已完成！${course.courseName}（${course.className}）應到 ${students.length} 人／實到 ${actualPresentStudentsCount} 人`
          : `點名紀錄已暫存為「進行中」`,
        'success'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleMakeupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitMakeupRequest) return;
    const cleanReason = makeupReason.trim();
    if (!cleanReason) {
      onShowToast('請填寫補點名或修改原因', 'warning');
      return;
    }
    setIsSubmittingMakeup(true);
    try {
      const res = await onSubmitMakeupRequest({
        requestType: makeupRequestType,
        reason: cleanReason,
      });
      if (res.success) {
        setIsMakeupModalOpen(false);
        setMakeupReason('');
        onShowToast('已送出補點名申請，請靜候管理員審核。', 'success');
      } else {
        onShowToast(res.error || '送出補點名申請失敗', 'warning');
      }
    } finally {
      setIsSubmittingMakeup(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-44 sm:pb-28">
      {/* Top Breadcrumb & Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
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

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-3">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight break-words">
                {course.courseName}
              </h1>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-600 text-white shrink-0">
                {course.className}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 text-white max-w-full break-words">
                {course.date} ({course.timeSlot})
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">
                {periodsCount} 節課制
              </span>
              {course.rescheduleInfo && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 max-w-full break-words">
                  🔵 補課／調課堂次（原定 {course.rescheduleInfo.originalDate}）
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 mt-2">
              <span className="flex items-center">
                <BookOpen className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                <span>{course.textbook}</span>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                <span>{course.classroom}</span>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="flex items-center font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                <Users className="w-3.5 h-3.5 mr-1.5 text-teal-600 shrink-0" />
                <span>應到 {students.length} 人／實到 {actualPresentStudentsCount} 人</span>
              </span>
            </div>
          </div>

          {/* Quick Status Tag on top right */}
          <div className="flex flex-col items-start md:items-end justify-center max-w-full">
            {isUnlockedByMakeup ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 max-w-full text-center sm:text-left">
                ✓ 補點名已核准（單次修改開放中）
              </span>
            ) : isOverdue ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300 max-w-full">
                <Lock className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span>🔒 已超過補點名期限 (逾七天鎖定)</span>
              </span>
            ) : isReadOnly ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 max-w-full">
                🔒 僅供檢視紀錄
              </span>
            ) : course.status === 'completed' ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 max-w-full">
                🟢 已完成狀態 (可再次修改更新)
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 max-w-full">
                🟠 待點名 / 點名編輯中
              </span>
            )}
          </div>
        </div>

        {/* Invalid schedule or hard-lock banner */}
        {!hasValidSchedule && !isHardLocked && (
          <div className="mt-4 p-3.5 rounded-xl border bg-rose-50 border-rose-200 text-rose-900 flex items-start space-x-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div>
              <div className="font-bold">此堂課排課節數或上課時間設定不完整</div>
              <div className="text-[11px] text-rose-800 mt-0.5">
                僅支援排定明確上課起訖時間與 2 / 3 / 4 小時制之課堂進行點名或補點名申請，請聯繫中心行政人員確認課表。
              </div>
            </div>
          </div>
        )}

        {/* Over-7-Day Lock / Makeup Request Banner */}
        {isOverdue && !isHardLocked && !explicitReadOnly && hasValidSchedule && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isUnlockedByMakeup
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-start space-x-2.5 text-xs">
              <AlertCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isUnlockedByMakeup ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <div className="space-y-1">
                {isUnlockedByMakeup ? (
                  <>
                    <div className="font-bold">
                      管理員已核准您的補點名申請（單次有效）
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      本次修改儲存成功後，系統將自動重新鎖定本堂點名紀錄並留下異動稽核紀錄。
                      {activeApprovedRequest?.reviewNotes
                        ? ` 審核備註：${activeApprovedRequest.reviewNotes}`
                        : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold">
                      此課堂已超過可直接修改期限，如需補點名或修改紀錄，請提出申請。
                    </div>
                    {isApprovedByOtherRequester && (
                      <div className="text-[11px] font-semibold text-amber-800">
                        此課堂已有其他申請人取得單次補點名核准，僅原申請人或管理員可送出。
                      </div>
                    )}
                    {pendingMakeupRequest && (
                      <div className="text-[11px] font-semibold text-amber-800">
                        審核狀態：待管理員審核中（申請類型：{pendingMakeupRequest.requestType === 'EDIT' ? '修改既有點名' : '補點名'}）
                      </div>
                    )}
                    {!pendingMakeupRequest && latestRejectedRequest && (
                      <div className="text-[11px] font-semibold text-rose-700">
                        前次申請已駁回{latestRejectedRequest.reviewNotes ? `（原因：${latestRejectedRequest.reviewNotes}）` : ''}，您可重新提出申請。
                      </div>
                    )}
                    {!pendingMakeupRequest && latestCompletedRequest && (
                      <div className="text-[11px] font-semibold text-slate-600">
                        前次核准補點名已於 {latestCompletedRequest.usedAt ? latestCompletedRequest.usedAt.slice(0, 16).replace('T', ' ') : ''} 使用完畢並重新鎖定。
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {!isUnlockedByMakeup && !isApprovedByOtherRequester && onSubmitMakeupRequest && (
              <button
                id="btn-request-makeup"
                type="button"
                disabled={Boolean(pendingMakeupRequest)}
                onClick={() => {
                  setMakeupRequestType(course.status === 'completed' ? 'EDIT' : 'MAKEUP');
                  setMakeupReason('');
                  setIsMakeupModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer bg-amber-600 hover:bg-amber-700 text-white disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed text-center"
              >
                {pendingMakeupRequest ? '審核中（不可重複申請）' : '申請補點名'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Batch Actions & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Quick Batch Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
          {!isReadOnly && (
            <>
              <button
                id="btn-all-present"
                onClick={handleSetAllPresent}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
                title={`所有學生的 ${periodsCount} 節課都預設為出席`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>全部{periodsCount}節設為出席</span>
              </button>

              <button
                id="btn-apply-leaves"
                onClick={handleApplyApprovedLeaves}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
                title="自動將今日已核准之請假單套用至學生節次"
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>依請假名單一鍵套用 ({applicableLeaves.length} 筆)</span>
              </button>

              <button
                onClick={handleSetAllPresent}
                className="flex items-center justify-center space-x-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-medium text-xs transition-colors"
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
            className="w-full px-3 py-2 text-base sm:text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Multi-Student Selection Batch Action Bar */}
      {selectedStudentIds.size > 0 && !isReadOnly && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center space-x-2 text-teal-900 font-bold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
            <span>已選取 {selectedStudentIds.size} 位學生（共 {filteredStudents.length} 位）</span>
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <button
              onClick={() => handleBatchSetSelectedStatus('present')}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center space-x-1 shadow-2xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>設為出席</span>
            </button>
            <button
              onClick={() => handleBatchSetSelectedStatus('leave')}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center space-x-1 shadow-2xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>設為請假</span>
            </button>
            <button
              onClick={() => handleBatchSetSelectedStatus('absent')}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center justify-center space-x-1 shadow-2xs transition-colors"
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

      {/* Student Attendance Roster - DESKTOP VIEW (Table) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
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
                  period4: is4H ? 'present' : undefined,
                };
                const approvedLeave = applicableLeaves.find(
                  (l) => String(l.studentId) === String(student.id)
                );

                const hasIssue = record.period1 !== 'present' || record.period2 !== 'present' || (is3H && record.period3 !== 'present') || (is4H && record.period4 !== 'present');
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

      {/* Student Attendance Roster - MOBILE VIEW (Cards) */}
      <div className="block md:hidden space-y-3">
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
            查無符合條件之學生
          </div>
        ) : (
          filteredStudents.map((student, index) => {
            const record = attendance[student.id] || {
              period1: 'present',
              period2: 'present',
              period3: is3H ? 'present' : undefined,
              period4: is4H ? 'present' : undefined,
            };
            const approvedLeave = applicableLeaves.find(
              (l) => String(l.studentId) === String(student.id)
            );
            const isSelected = selectedStudentIds.has(student.id);
            const hasIssue = record.period1 !== 'present' || record.period2 !== 'present' || (is3H && record.period3 !== 'present') || (is4H && record.period4 !== 'present');

            return (
              <div
                key={student.id}
                id={`student-mobile-card-${student.id}`}
                className={`bg-white rounded-2xl border p-3.5 shadow-2xs space-y-3 transition-colors ${
                  isSelected
                    ? 'border-teal-400 bg-teal-50/30 ring-1 ring-teal-400'
                    : hasIssue
                    ? 'border-amber-300 bg-amber-50/10'
                    : 'border-slate-200'
                }`}
              >
                {/* Top Info Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={isSelected}
                      onChange={() => handleToggleSelectStudent(student.id)}
                      className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer disabled:opacity-50 shrink-0"
                    />
                    <span className="text-xs font-mono font-bold text-slate-400 w-5 shrink-0">
                      #{index + 1}
                    </span>
                    <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-10 h-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm truncate">
                          {student.name}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium border border-slate-200 shrink-0">
                          {student.nationality}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-1.5 mt-0.5 truncate">
                        <span>{student.studentNumber}</span>
                        {student.englishName && <span className="truncate">• {student.englishName}</span>}
                      </div>
                      {approvedLeave && (
                        <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                          <span>📝 {approvedLeave.typeName}已核准</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remarks Icon / Indicator */}
                  <div className="flex items-center space-x-1 shrink-0">
                    {record.evidenceImageUrl && (
                      <a
                        href={record.evidenceImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-teal-600 hover:text-teal-800 bg-teal-50 rounded-lg transition-colors"
                        title="檢視佐證照片"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </a>
                    )}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setModalStudent(student)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          record.remarks || record.evidenceImagePath
                            ? 'text-teal-700 bg-teal-50 border border-teal-200'
                            : 'text-slate-400 hover:text-slate-600 bg-slate-50 border border-slate-200'
                        }`}
                        title="編輯備註或假單"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Periods Status Segmented Controls */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  {[1, 2, ...(is3H ? [3] : []), ...(is4H ? [4] : [])].map((pNum) => {
                    const field = `period${pNum}` as keyof StudentPeriodAttendance;
                    const curStatus = (record[field] as AttendanceStatus) || 'present';
                    const timeLabel = course?.periodTimes?.[pNum - 1] || '';

                    return (
                      <div
                        key={pNum}
                        className="flex items-center justify-between gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200/70"
                      >
                        <div className="w-[70px] sm:w-20 shrink-0">
                          <div className="text-xs font-bold text-slate-800">第 {pNum} 節</div>
                          {timeLabel && (
                            <div className="text-[10px] text-slate-400 font-mono truncate">{timeLabel}</div>
                          )}
                        </div>

                        <div className="flex-1 grid grid-cols-3 gap-1 sm:gap-1.5 max-w-[230px]">
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, field as any, 'present')}
                            className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all text-center ${
                              curStatus === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                          >
                            出席
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, field as any, 'leave')}
                            className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all text-center ${
                              curStatus === 'leave'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            請假
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleSetPeriodStatus(student.id, field as any, 'absent')}
                            className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all text-center ${
                              curStatus === 'absent'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                            }`}
                          >
                            缺席
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Batch Actions for this student (整堂快捷) */}
                {!isReadOnly && (
                  <div className="pt-1 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBatchStudentStatus(student.id, 'present')}
                      className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors text-center"
                    >
                      全到
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStudentStatus(student.id, 'leave')}
                      className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors text-center"
                    >
                      整堂請假
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStudentStatus(student.id, 'absent')}
                      className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors text-center"
                    >
                      整堂缺席
                    </button>
                  </div>
                )}

                {/* Remarks Text Preview */}
                {record.remarks && (
                  <div
                    onClick={() => !isReadOnly && setModalStudent(student)}
                    className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-700 flex items-start space-x-1.5 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                    <span className="flex-1 line-clamp-2">{record.remarks}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
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
        <div className="fixed bottom-3 sm:bottom-4 left-3 sm:left-4 lg:left-72 right-3 sm:right-4 z-40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 bg-slate-900/95 backdrop-blur-md text-white p-3 sm:p-4 rounded-2xl shadow-2xl border border-slate-700 pb-safe">
          <div className="flex items-center space-x-3">
            <div>
              <span className="text-[11px] text-slate-400">
                {isUnlockedByMakeup ? '補點名開放中（送出後將鎖定）' : '目前點名統計'}
              </span>
              <div id="attendance-headcount-summary" className="text-xs sm:text-sm font-extrabold text-white">
                應到 <span className="text-slate-200 font-mono text-sm sm:text-base">{students.length}</span> 人／實到 <span className="text-teal-400 font-mono text-sm sm:text-base">{actualPresentStudentsCount}</span> 人
              </div>
            </div>
          </div>

          <div className={`grid ${isUnlockedByMakeup ? 'grid-cols-1' : 'grid-cols-2'} sm:flex items-center gap-2 sm:space-x-3`}>
            {!isUnlockedByMakeup && (
              <button
                id="btn-save-draft"
                disabled={isSaving}
                onClick={() => handleSubmit('in_progress')}
                className="w-full sm:w-auto px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-colors text-center disabled:opacity-50"
              >
                {isSaving ? '儲存中...' : '暫存草稿'}
              </button>
            )}

            <button
              id="btn-submit-attendance"
              disabled={isSaving}
              onClick={() => handleSubmit('completed')}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-teal-900/50 transition-all hover:scale-[1.02] text-center disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{isSaving ? '送出中...' : isUnlockedByMakeup ? '完成補點名並送出' : '完成點名並送出'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Makeup Attendance Request Modal */}
      {isMakeupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden my-auto">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">申請逾七天補點名／修改紀錄</h3>
                <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                  {course.className} • {course.date} ({course.timeSlot})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMakeupModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMakeupSubmit} className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">申請類型</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMakeupRequestType('MAKEUP')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      makeupRequestType === 'MAKEUP'
                        ? 'bg-teal-50 border-teal-500 text-teal-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    補點名
                  </button>
                  <button
                    type="button"
                    onClick={() => setMakeupRequestType('EDIT')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      makeupRequestType === 'EDIT'
                        ? 'bg-teal-50 border-teal-500 text-teal-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    修改既有點名
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="makeup-reason-input" className="block text-xs font-bold text-slate-700 mb-1.5">
                  申請原因 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="makeup-reason-input"
                  rows={3}
                  value={makeupReason}
                  onChange={(e) => setMakeupReason(e.target.value)}
                  placeholder="請說明需補點名或修改既有紀錄的原因..."
                  className="w-full px-3 py-2 text-base sm:text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:space-x-2 sm:gap-0 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMakeupModalOpen(false)}
                  disabled={isSubmittingMakeup}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl text-center"
                >
                  取消
                </button>
                <button
                  id="btn-confirm-makeup-request"
                  type="submit"
                  disabled={isSubmittingMakeup}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50 text-center"
                >
                  {isSubmittingMakeup ? '送出中...' : '送出申請'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
