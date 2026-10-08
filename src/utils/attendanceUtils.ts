import { Student, StudentPeriodAttendance, LeaveRecord, CourseSession, AttendanceStatus, TransferClassRecord } from '../types';
import { getTodayDateStr } from './quarterScheduler';

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
  attendanceRate: number; // 0 - 100
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

  const hasAttendanceData = Boolean(attendanceData && Object.keys(attendanceData).length > 0);

  safeStudents.forEach((student) => {
    if (!student || !student.id) return;
    const record = safeAttData[student.id];
    if (!record) return;

    // Period 1
    if (record.period1) {
      if (record.period1 === 'present') { period1.present++; totalPresentHours++; }
      else if (record.period1 === 'leave') { period1.leave++; totalLeaveHours++; }
      else if (record.period1 === 'absent') { period1.absent++; totalAbsentHours++; }
    }

    // Period 2
    if (record.period2) {
      if (record.period2 === 'present') { period2.present++; totalPresentHours++; }
      else if (record.period2 === 'leave') { period2.leave++; totalLeaveHours++; }
      else if (record.period2 === 'absent') { period2.absent++; totalAbsentHours++; }
    }

    // Period 3 (if >= 3-hour class)
    if (periodsCount >= 3 && record.period3) {
      if (record.period3 === 'present') { period3.present++; totalPresentHours++; }
      else if (record.period3 === 'leave') { period3.leave++; totalLeaveHours++; }
      else if (record.period3 === 'absent') { period3.absent++; totalAbsentHours++; }
    }

    // Period 4 (if >= 4-hour class)
    if (periodsCount >= 4 && record.period4) {
      if (record.period4 === 'present') { period4.present++; totalPresentHours++; }
      else if (record.period4 === 'leave') { period4.leave++; totalLeaveHours++; }
      else if (record.period4 === 'absent') { period4.absent++; totalAbsentHours++; }
    }
  });

  const totalHours = totalStudents * periodsCount;
  // Actual attendance rate = (totalPresentHours / totalHours) * 100%
  // Present = 100%, Leave = 0% (student was not in class), Absent = 0%
  const attendanceRate = totalHours > 0 && hasAttendanceData
    ? Math.round((totalPresentHours / totalHours) * 1000) / 10
    : 100;

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
    allMarked: hasAttendanceData,
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

export function applyApprovedLeaves(
  currentAttendance: { [studentId: string]: StudentPeriodAttendance } = {},
  students: Student[] = [],
  leaveRecords: LeaveRecord[] = [],
  courseDate: string,
  periodsCount: number = 3
): { updatedAttendance: { [studentId: string]: StudentPeriodAttendance }; appliedCount: number } {
  const updated = { ...(currentAttendance || {}) };
  let appliedCount = 0;

  // Filter leaves for this date and these students
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
  if (!record) return { present: periodsCount, leave: 0, absent: 0 };
  let present = 0;
  let leave = 0;
  let absent = 0;

  const statuses = [record.period1, record.period2];
  if (periodsCount >= 3 && record.period3) {
    statuses.push(record.period3);
  }
  if (periodsCount >= 4 && record.period4) {
    statuses.push(record.period4);
  }

  statuses.forEach((status) => {
    if (status === 'present') present++;
    else if (status === 'leave') leave++;
    else if (status === 'absent') absent++;
  });

  return { present, leave, absent };
}

export type { StudentClassPeriod } from './studentTimelineUtils';
export {
  getStudentClassTimeline,
  isStudentInSessionClass,
  isSessionEnded,
  isStudentInClassOnDate,
  getSessionRoster,
} from './studentTimelineUtils';
import type { StudentClassPeriod } from './studentTimelineUtils';
import {
  getStudentClassTimeline,
  isStudentInSessionClass,
  isSessionEnded,
} from './studentTimelineUtils';

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
  if (s === 'holiday' || s === 'cancelled' || s === 'suspended' || s === 'rescheduled_out') return true;
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

// Calculate individual student history across all completed courses in the quarter
export function calculateStudentAttendanceHistory(
  student?: Student | null,
  allCourses: CourseSession[] = [],
  transferRecords?: TransferClassRecord[]
): {
  requiredHours: number;
  completedHours: number;
  presentHours: number;
  leaveHours: number;
  absentHours: number;
  attendanceRate: number;
  attendanceScore: number;
  dailyRecords: Array<{
    date: string;
    courseName: string;
    className: string;
    periodsCount: number;
    period1: AttendanceStatus;
    period2: AttendanceStatus;
    period3?: AttendanceStatus;
    period4?: AttendanceStatus;
    totalHours: number;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    statusSummary: string;
    remarks?: string;
    isDefaultPresent?: boolean;
    isCancelled?: boolean;
  }>;
} {
  if (!student || !student.id) {
    return {
      requiredHours: 165,
      completedHours: 0,
      presentHours: 0,
      leaveHours: 0,
      absentHours: 0,
      attendanceRate: 100,
      attendanceScore: 100,
      dailyRecords: [],
    };
  }

  const safeCourses = Array.isArray(allCourses) ? allCourses : [];
  const timeline = getStudentClassTimeline(student, transferRecords);

  const requiredHours = student.totalRequiredHours || 165;
  let completedHours = 0;
  let presentHours = 0;
  let leaveHours = 0;
  let absentHours = 0;

  const dailyRecords: Array<{
    date: string;
    courseName: string;
    className: string;
    periodsCount: number;
    period1: AttendanceStatus;
    period2: AttendanceStatus;
    period3?: AttendanceStatus;
    period4?: AttendanceStatus;
    totalHours: number;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    statusSummary: string;
    remarks?: string;
    isDefaultPresent?: boolean;
    isCancelled?: boolean;
  }> = [];

  const processedSessionKeys = new Set<string>();

  // Filter and process all sessions that belonged to this student
  safeCourses.forEach((c) => {
    if (!c) return;
    const isCancelled = isSessionCancelledOrSuspended(c);

    // Rule: Strictly verify genuine class. Never process sessions with empty or fake placeholder class names
    const invalidClassNames = ['華語班級', '班級', '未命名班級', '原班級', '新班級', '華語課程', '未設定班級', '華語密集班', '預設班級'];
    const cleanClassName = (c.className || '').trim();
    if (!cleanClassName || invalidClassNames.includes(cleanClassName)) {
      return;
    }

    // Check if session belonged to the student on c.date
    const isSessionInStudentClass = isStudentInSessionClass(
      c.date,
      c.classId,
      cleanClassName,
      timeline
    );

    // If session is cancelled or suspended:
    // STRICT RULE: Exclude 100% from completedHours, presentHours, leaveHours, absentHours, attendanceRate, attendanceScore.
    // If student was in this class, show in dailyRecords as "停課（不計出缺勤）" with 0 hours for UI clarity.
    if (isCancelled) {
      if (isSessionInStudentClass) {
        const sessionKey = `${c.id || c.date}_${cleanClassName}_${c.timeSlot || ''}`;
        if (!processedSessionKeys.has(sessionKey)) {
          processedSessionKeys.add(sessionKey);
          const periodsCount = c.periodsCount || 3;
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
            statusSummary: '停課（不計出缺勤）',
            remarks: c.cancelReason || '中心停課免點名',
            isDefaultPresent: false,
            isCancelled: true,
          });
        }
      }
      return;
    }

    // Check if student has explicit attendance record
    const hasExplicitRecord = Boolean(c.attendanceData && student.id && c.attendanceData[student.id]);

    // Rule: Strictly check if session has already ended in real time
    const sessionHasEnded = isSessionEnded(c.date, c.endTime);

    // If no explicit record, only include if:
    // 1) Session has actually ended in real time
    // 2) Student was legitimately in this session's class on c.date per timeline
    if (!hasExplicitRecord && (!sessionHasEnded || !isSessionInStudentClass)) {
      return;
    }

    // Deduplicate by session key
    const sessionKey = `${c.id || c.date}_${cleanClassName}_${c.timeSlot || ''}`;
    if (processedSessionKeys.has(sessionKey)) return;
    processedSessionKeys.add(sessionKey);

    const periodsCount = c.periodsCount || 3;
    const rec = c.attendanceData ? c.attendanceData[student.id] : undefined;

    if (rec && (rec.period1 || rec.period2 || rec.period3 || rec.period4)) {
      // 1. Teacher submitted / marked attendance for this student
      const hours = getStudentIndividualHours(rec, periodsCount);
      completedHours += periodsCount;
      presentHours += hours.present;
      leaveHours += hours.leave;
      absentHours += hours.absent;

      let statusSummary = `${periodsCount}H 全勤出席`;
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
        totalHours: periodsCount,
        presentHours: hours.present,
        leaveHours: hours.leave,
        absentHours: hours.absent,
        statusSummary,
        remarks: rec.remarks,
        isDefaultPresent: false,
        isCancelled: false,
      });
    } else if (sessionHasEnded) {
      // 2. Past session where teacher did not mark attendance:
      // Official CLC System Rule: Default Present (預設學生有到)
      // Only valid teaching sessions produce default_present (cancelled sessions already returned above!)
      completedHours += periodsCount;
      presentHours += periodsCount; // 100% present
      leaveHours += 0;
      absentHours += 0;

      dailyRecords.push({
        date: c.date,
        courseName: c.courseName || cleanClassName,
        className: cleanClassName,
        periodsCount,
        period1: 'present',
        period2: 'present',
        period3: periodsCount >= 3 ? 'present' : undefined,
        period4: periodsCount >= 4 ? 'present' : undefined,
        totalHours: periodsCount,
        presentHours: periodsCount,
        leaveHours: 0,
        absentHours: 0,
        statusSummary: `${periodsCount}H 全勤出席`,
        remarks: '系統預設到課（未點名）',
        isDefaultPresent: true,
        isCancelled: false,
      });
    }
  });

  // Sort dailyRecords descending by date
  dailyRecords.sort((a, b) => b.date.localeCompare(a.date));

  // Actual Attendance Rate Formula:
  // 實際出席率 = 實際出席時數 (presentHours) ÷ 應到時數 (completedHours) × 100%
  // present = 100%, default_present = 100%, leave = 0%, absent = 0%
  const attendanceRate =
    completedHours > 0
      ? Math.round((presentHours / completedHours) * 1000) / 10
      : (student.overallAttendanceRate ?? 100);

  // Attendance Score (出席成績評分, 滿分 100):
  // 出席 = 1.0, 請假 = 0.5, 缺席 = 0.0
  // (present + default_present + leave * 0.5) ÷ 應到時數 × 100
  const attendanceScore =
    completedHours > 0
      ? Math.round(((presentHours + leaveHours * 0.5) / completedHours) * 1000) / 10
      : 100;

  return {
    requiredHours,
    completedHours,
    presentHours,
    leaveHours,
    absentHours,
    attendanceRate,
    attendanceScore,
    dailyRecords,
  };
}
