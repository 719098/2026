import {
  Student,
  StudentPeriodAttendance,
  LeaveRecord,
  CourseSession,
  AttendanceStatus,
  TransferClassRecord,
  ClassEntity,
  Term,
  DailyAttendanceRecord,
} from '../types';

export type { StudentClassPeriod } from './studentTimelineUtils';
export {
  getStudentClassTimeline,
  isStudentInSessionClass,
  isSessionEnded,
  isStudentInClassOnDate,
  getSessionRoster,
} from './studentTimelineUtils';
import {
  getStudentClassTimeline,
  isStudentInSessionClass,
} from './studentTimelineUtils';

export interface AttendanceCalculationResult {
  totalStudents: number;
  periodsCount: number;
  period1: { present: number; leave: number; absent: number };
  period2: { present: number; leave: number; absent: number };
  period3?: { present: number; leave: number; absent: number };
  period4?: { present: number; leave: number; absent: number };
  totalHours: number;
  totalPresentHours: number;
  totalLeaveHours: number;
  totalAbsentHours: number;
  attendanceRate: number | null; // 0 - 100, null when no formal attendance data
  allMarked: boolean;
}

export function calculateAttendanceStats(
  students: Student[] = [],
  attendanceData?: { [studentId: string]: StudentPeriodAttendance } | null,
  periodsCount: number = 3
): AttendanceCalculationResult {
  const safeStudents = Array.isArray(students) ? students : [];
  const safeAttData = attendanceData || {};
  const totalStudents = safeStudents.length;
  const period1 = { present: 0, leave: 0, absent: 0 };
  const period2 = { present: 0, leave: 0, absent: 0 };
  const period3 = { present: 0, leave: 0, absent: 0 };
  const period4 = { present: 0, leave: 0, absent: 0 };

  let totalPresentHours = 0;
  let totalLeaveHours = 0;
  let totalAbsentHours = 0;
  let recordedPeriods = 0;

  const hasAttendanceData = Boolean(attendanceData && Object.keys(attendanceData).length > 0);

  safeStudents.forEach((student) => {
    if (!student || !student.id) return;
    const record = safeAttData[student.id];
    if (!record) return;

    // Period 1
    if (record.period1) {
      recordedPeriods++;
      if (record.period1 === 'present') { period1.present++; totalPresentHours++; }
      else if (record.period1 === 'leave') { period1.leave++; totalLeaveHours++; }
      else if (record.period1 === 'absent') { period1.absent++; totalAbsentHours++; }
    }

    // Period 2
    if (record.period2) {
      recordedPeriods++;
      if (record.period2 === 'present') { period2.present++; totalPresentHours++; }
      else if (record.period2 === 'leave') { period2.leave++; totalLeaveHours++; }
      else if (record.period2 === 'absent') { period2.absent++; totalAbsentHours++; }
    }

    // Period 3 (if >= 3-hour class)
    if (periodsCount >= 3 && record.period3) {
      recordedPeriods++;
      if (record.period3 === 'present') { period3.present++; totalPresentHours++; }
      else if (record.period3 === 'leave') { period3.leave++; totalLeaveHours++; }
      else if (record.period3 === 'absent') { period3.absent++; totalAbsentHours++; }
    }

    // Period 4 (if >= 4-hour class)
    if (periodsCount >= 4 && record.period4) {
      recordedPeriods++;
      if (record.period4 === 'present') { period4.present++; totalPresentHours++; }
      else if (record.period4 === 'leave') { period4.leave++; totalLeaveHours++; }
      else if (record.period4 === 'absent') { period4.absent++; totalAbsentHours++; }
    }
  });

  const totalHours = totalStudents * periodsCount;
  // Actual attendance rate = (totalPresentHours / totalHours) * 100%
  // Present = 100%, Leave = 0%, Absent = 0%; null when unevaluated
  const attendanceRate = totalHours > 0 && hasAttendanceData && recordedPeriods > 0
    ? Math.round((totalPresentHours / totalHours) * 1000) / 10
    : null;

  return {
    totalStudents,
    periodsCount,
    period1,
    period2,
    period3: periodsCount >= 3 ? period3 : undefined,
    period4: periodsCount >= 4 ? period4 : undefined,
    totalHours,
    totalPresentHours,
    totalLeaveHours,
    totalAbsentHours,
    attendanceRate,
    allMarked: hasAttendanceData && recordedPeriods > 0,
  };
}

export function getDefaultAttendanceForStudents(
  students: Student[] = [],
  periodsCount: number = 3
): { [studentId: string]: StudentPeriodAttendance } {
  const initial: { [studentId: string]: StudentPeriodAttendance } = {};
  (students || []).forEach((student) => {
    if (!student || !student.id) return;
    initial[student.id] = {
      period1: 'present',
      period2: 'present',
      period3: periodsCount >= 3 ? 'present' : undefined,
      period4: periodsCount >= 4 ? 'present' : undefined,
    };
  });
  return initial;
}

/**
 * Builds a complete, normalized attendance map strictly scoped to the given session roster
 * and periodsCount (2, 3, or 4). Ensures every enrolled student on the session date is included
 * and prevents stale/foreign student keys from being submitted.
 */
export function buildNormalizedAttendanceMap(
  students: Student[] = [],
  rawAttendanceData?: { [studentId: string]: StudentPeriodAttendance } | null,
  periodsCount: number = 3
): { [studentId: string]: StudentPeriodAttendance } {
  const safeData = rawAttendanceData || {};
  const normalized: { [studentId: string]: StudentPeriodAttendance } = {};

  (students || []).forEach((student) => {
    if (!student || !student.id) return;
    const existing = safeData[student.id];
    normalized[student.id] = {
      period1: existing?.period1 || 'present',
      period2: periodsCount >= 2 ? (existing?.period2 || 'present') : 'present',
      period3: periodsCount >= 3 ? (existing?.period3 || 'present') : undefined,
      period4: periodsCount >= 4 ? (existing?.period4 || 'present') : undefined,
      remarks: existing?.remarks,
      evidenceImagePath: existing?.evidenceImagePath,
      evidenceImageUrl: existing?.evidenceImageUrl,
    };
  });

  return normalized;
}

export function applyApprovedLeaves(
  currentAttendance: { [studentId: string]: StudentPeriodAttendance } = {},
  students: Student[] = [],
  leaveRecords: LeaveRecord[] = [],
  courseDate: string,
  periodsCount: number = 3
): { updatedAttendance: { [studentId: string]: StudentPeriodAttendance }; appliedCount: number } {
  const updated = { ...(currentAttendance || {}) };
  let appliedCount = 0;

  const applicableLeaves = (leaveRecords || []).filter(
    (l) => l && l.date === courseDate && l.status === 'approved'
  );

  applicableLeaves.forEach((leave) => {
    const student = (students || []).find(
      (s) => s && String(s.id) === String(leave.studentId)
    );
    if (student && student.id) {
      const existing = updated[student.id] || {
        period1: 'present',
        period2: 'present',
        period3: periodsCount >= 3 ? 'present' : undefined,
        period4: periodsCount >= 4 ? 'present' : undefined,
      };

      const newRecord = { ...existing };
      if (leave.periods?.includes(1)) newRecord.period1 = 'leave';
      if (leave.periods?.includes(2)) newRecord.period2 = 'leave';
      if (periodsCount >= 3 && leave.periods?.includes(3)) newRecord.period3 = 'leave';
      if (periodsCount >= 4 && leave.periods?.includes(4)) newRecord.period4 = 'leave';
      newRecord.remarks = `${leave.typeName || '請假'}：${leave.reason || '事假/病假'}`;

      updated[student.id] = newRecord;
      appliedCount++;
    }
  });

  return { updatedAttendance: updated, appliedCount };
}

export function getStudentIndividualHours(
  record?: StudentPeriodAttendance,
  periodsCount: number = 3
): {
  present: number;
  leave: number;
  absent: number;
} {
  if (!record) return { present: 0, leave: 0, absent: 0 };
  let present = 0;
  let leave = 0;
  let absent = 0;

  const statuses: Array<AttendanceStatus | undefined> = [record.period1, record.period2];
  if (periodsCount >= 3) statuses.push(record.period3);
  if (periodsCount >= 4) statuses.push(record.period4);

  statuses.slice(0, periodsCount).forEach((status) => {
    if (status === 'present') present++;
    else if (status === 'leave') leave++;
    else if (status === 'absent') absent++;
  });

  return { present, leave, absent };
}

/**
 * Universal checker: returns true if a session is cancelled, suspended, or rescheduled-out.
 */
export function isSessionCancelledOrSuspended(session?: {
  status?: string;
  isCancelled?: boolean;
  isSuspended?: boolean;
  rescheduleInfo?: { type?: string };
} | null): boolean {
  if (!session) return true;
  if (session.isCancelled === true || session.isSuspended === true) return true;
  const s = String(session.status || '').toLowerCase();
  if (s === 'holiday' || s === 'cancelled' || s === 'suspended' || s === 'rescheduled_out' || s === 'rescheduled') {
    return true;
  }
  if (session.rescheduleInfo?.type === 'out') return true;
  return false;
}

/**
 * Universal checker: returns true if a session is a valid, active teaching session.
 */
export function isSessionValidForAttendance(session?: {
  status?: string;
  isCancelled?: boolean;
  isSuspended?: boolean;
  rescheduleInfo?: { type?: string };
} | null): boolean {
  return !isSessionCancelledOrSuspended(session);
}

/**
 * Universal checker: returns true iff a valid active session has formal submitted attendance.
 * Unsubmitted drafts (in_progress) and cancelled/rescheduled-out sessions return false.
 */
export function isSessionSubmittedAttendance(session?: CourseSession | null): boolean {
  if (!session) return false;
  if (isSessionCancelledOrSuspended(session)) return false;
  if (session.status === 'in_progress') return false;
  if (!session.attendanceData) return false;
  return Object.values(session.attendanceData).some(
    (rec) => rec && Boolean(rec.period1 || rec.period2 || rec.period3 || rec.period4)
  );
}

export interface AttendanceHistoryOptions {
  classId?: string;
  className?: string;
  termId?: string;
  startDate?: string;
  endDate?: string;
  classes?: ClassEntity[];
  terms?: Term[];
  requiredHoursOverride?: number;
}

export interface StudentAttendanceHistoryResult {
  requiredHours: number;
  completedHours: number;
  presentHours: number;
  leaveHours: number;
  absentHours: number;
  hasAttendanceData: boolean;
  attendanceRate: number | null;
  attendanceScore: number | null;
  complianceStatus: 'unevaluated' | 'compliant' | 'non_compliant';
  dailyRecords: DailyAttendanceRecord[];
}

function resolveTargetHoursFromContext(
  student: Student,
  options?: AttendanceHistoryOptions
): number {
  if (options?.requiredHoursOverride && options.requiredHoursOverride > 0) {
    return options.requiredHoursOverride;
  }
  if (student.totalRequiredHours && student.totalRequiredHours > 0) {
    return student.totalRequiredHours;
  }
  const classes = options?.classes || [];
  const terms = options?.terms || [];
  const matchedClass = classes.find(
    (c) =>
      (options?.classId && c.id === options.classId) ||
      (options?.className && c.name === options.className) ||
      (student.classId && c.id === student.classId) ||
      (student.className && c.name === student.className)
  );
  if (matchedClass && matchedClass.totalTargetHours > 0) {
    return matchedClass.totalTargetHours;
  }
  const termIdToCheck = options?.termId || matchedClass?.termId;
  const termNameToCheck = matchedClass?.term;
  const matchedTerm = terms.find(
    (t) =>
      (termIdToCheck && t.id === termIdToCheck) ||
      (termNameToCheck && t.name === termNameToCheck)
  );
  if (matchedTerm?.targetHours && matchedTerm.targetHours > 0) {
    return matchedTerm.targetHours;
  }
  if (termIdToCheck) {
    const siblingTarget = classes.find(
      (c) => c.termId === termIdToCheck && c.totalTargetHours > 0
    )?.totalTargetHours;
    if (siblingTarget && siblingTarget > 0) return siblingTarget;
  }
  return 0;
}

function doesSessionMatchOptions(
  session: CourseSession,
  options?: AttendanceHistoryOptions
): boolean {
  if (!options) return true;
  if (options.startDate && session.date < options.startDate) return false;
  if (options.endDate && session.date > options.endDate) return false;

  if (options.classId || options.className) {
    const cleanName = (session.className || '').trim();
    const matchById = Boolean(options.classId && session.classId && String(session.classId) === String(options.classId));
    const matchByName = Boolean(options.className && cleanName === options.className.trim());
    if (!matchById && !matchByName) return false;
  }

  if (options.termId && options.termId !== 'ALL') {
    const terms = options.terms || [];
    const classes = options.classes || [];
    const termObj = terms.find((t) => t.id === options.termId);
    const termClasses = classes.filter(
      (c) => c.termId === options.termId || (termObj && c.term === termObj.name)
    );
    const matchesClass = termClasses.some(
      (c) =>
        (session.classId && String(c.id) === String(session.classId)) ||
        (session.className && c.name === session.className.trim())
    );
    const matchesTermDates = Boolean(
      termObj &&
      termObj.startDate &&
      termObj.endDate &&
      session.date >= termObj.startDate &&
      session.date <= termObj.endDate
    );
    if (termClasses.length > 0 || termObj) {
      if (!matchesClass && !matchesTermDates) return false;
    }
  }

  return true;
}

/**
 * Calculates individual student attendance history strictly from formal submitted attendance records.
 * - Never fabricates "default present" for past unmarked sessions.
 * - Excludes cancelled, suspended, and rescheduled-out sessions from attendance metrics.
 * - Deduplicates sessions so replacement/makeup classes never double-count.
 * - Returns null for attendanceRate & attendanceScore and 'unevaluated' when completedHours === 0.
 */
export function calculateStudentAttendanceHistory(
  student?: Student | null,
  allCourses: CourseSession[] = [],
  transferRecords?: TransferClassRecord[],
  options?: AttendanceHistoryOptions
): StudentAttendanceHistoryResult {
  if (!student || !student.id) {
    return {
      requiredHours: 0,
      completedHours: 0,
      presentHours: 0,
      leaveHours: 0,
      absentHours: 0,
      hasAttendanceData: false,
      attendanceRate: null,
      attendanceScore: null,
      complianceStatus: 'unevaluated',
      dailyRecords: [],
    };
  }

  const safeCourses = Array.isArray(allCourses) ? allCourses : [];
  const timeline = getStudentClassTimeline(student, transferRecords);
  const requiredHours = resolveTargetHoursFromContext(student, options);

  let completedHours = 0;
  let presentHours = 0;
  let leaveHours = 0;
  let absentHours = 0;

  const dailyRecords: DailyAttendanceRecord[] = [];
  const processedSessionKeys = new Set<string>();
  const invalidClassNames = [
    '華語班級',
    '班級',
    '未命名班級',
    '原班級',
    '新班級',
    '華語課程',
    '未設定班級',
    '華語密集班',
    '預設班級',
  ];

  safeCourses.forEach((c) => {
    if (!c || !c.date) return;
    if (!doesSessionMatchOptions(c, options)) return;

    const cleanClassName = (c.className || '').trim();
    if (!cleanClassName || invalidClassNames.includes(cleanClassName)) {
      return;
    }

    const isCancelled = isSessionCancelledOrSuspended(c);
    const isSessionInStudentClass = isStudentInSessionClass(
      c.date,
      c.classId,
      cleanClassName,
      timeline
    );

    // Cancelled / suspended / rescheduled-out sessions NEVER count toward attended/expected hours
    if (isCancelled) {
      if (isSessionInStudentClass) {
        const cancelKey = c.id
          ? `cancel_id_${c.id}`
          : `cancel_${c.date}_${cleanClassName}_${c.timeSlot || ''}`;
        if (!processedSessionKeys.has(cancelKey)) {
          processedSessionKeys.add(cancelKey);
          const periodsCount = c.periodsCount || 3;
          const isRescheduledOut =
            String(c.status || '').toLowerCase() === 'rescheduled_out' ||
            c.rescheduleInfo?.type === 'out';
          dailyRecords.push({
            date: c.date,
            courseName: c.courseName || cleanClassName,
            className: cleanClassName,
            periodsCount,
            period1: 'present',
            period2: 'present',
            period3: periodsCount >= 3 ? 'present' : undefined,
            period4: periodsCount >= 4 ? 'present' : undefined,
            totalHours: 0,
            presentHours: 0,
            leaveHours: 0,
            absentHours: 0,
            statusSummary: isRescheduledOut ? '已調課（原堂次不計）' : '停課（不計出缺勤）',
            remarks: c.cancelReason || (isRescheduledOut ? c.rescheduleInfo?.reason || '已調課至補課日' : '中心停課免點名'),
            isDefaultPresent: false,
            isCancelled: true,
          });
        }
      }
      return;
    }

    // Only sessions with formal submitted attendance for this student count
    if (c.status === 'in_progress') return;
    const rec = c.attendanceData ? c.attendanceData[student.id] : undefined;
    if (!rec || !(rec.period1 || rec.period2 || rec.period3 || rec.period4)) {
      return;
    }

    // Deduplicate active session
    const sessionKey = c.id
      ? `active_id_${c.id}`
      : `active_${c.date}_${c.classId || cleanClassName}_${c.timeSlot || ''}`;
    if (processedSessionKeys.has(sessionKey)) return;
    processedSessionKeys.add(sessionKey);

    const periodsCount = c.periodsCount || 3;
    const hours = getStudentIndividualHours(rec, periodsCount);
    const countedHours = hours.present + hours.leave + hours.absent;
    if (countedHours === 0) return;

    completedHours += countedHours;
    presentHours += hours.present;
    leaveHours += hours.leave;
    absentHours += hours.absent;

    let statusSummary = `${countedHours}H 全勤出席`;
    if (hours.absent > 0 && hours.leave > 0) {
      statusSummary = `${hours.absent}H 缺席 / ${hours.leave}H 請假`;
    } else if (hours.absent > 0) {
      statusSummary = `${hours.absent}H 曠課缺席`;
    } else if (hours.leave > 0) {
      statusSummary = `${hours.leave}H 請假`;
    }

    dailyRecords.push({
      date: c.date,
      courseName: c.courseName || cleanClassName,
      className: cleanClassName,
      periodsCount,
      period1: rec.period1 || 'present',
      period2: rec.period2 || 'present',
      period3: rec.period3,
      period4: rec.period4,
      totalHours: countedHours,
      presentHours: hours.present,
      leaveHours: hours.leave,
      absentHours: hours.absent,
      statusSummary,
      remarks: rec.remarks,
      isDefaultPresent: false,
      isCancelled: false,
    });
  });

  dailyRecords.sort((a, b) => b.date.localeCompare(a.date));

  const hasAttendanceData = completedHours > 0;

  // Actual Attendance Rate: presentHours / completedHours * 100% (leave = 0%, absent = 0%)
  const attendanceRate = hasAttendanceData
    ? Math.round((presentHours / completedHours) * 1000) / 10
    : null;

  // Attendance Score (出席成績評分): (presentHours + leaveHours * 0.5) / completedHours * 100
  const attendanceScore = hasAttendanceData
    ? Math.round(((presentHours + leaveHours * 0.5) / completedHours) * 1000) / 10
    : null;

  const complianceStatus: 'unevaluated' | 'compliant' | 'non_compliant' =
    !hasAttendanceData || attendanceRate === null
      ? 'unevaluated'
      : attendanceRate >= 80
      ? 'compliant'
      : 'non_compliant';

  return {
    requiredHours,
    completedHours,
    presentHours,
    leaveHours,
    absentHours,
    hasAttendanceData,
    attendanceRate,
    attendanceScore,
    complianceStatus,
    dailyRecords,
  };
}
