import { Student, StudentPeriodAttendance, LeaveRecord, CourseSession, AttendanceStatus } from '../types';

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
  // Rule: Present = 100% (1.0), Leave = 50% (0.5), Absent = 0% (0.0)
  const earnedHours = totalPresentHours + totalLeaveHours * 0.5;
  const attendanceRate = totalHours > 0 && hasAttendanceData
    ? Math.round((earnedHours / totalHours) * 1000) / 10
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
      (s) => s && (s.id === leave.studentId || s.name === leave.studentName)
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

// Calculate individual student history across all completed courses in the quarter
export function calculateStudentAttendanceHistory(
  student?: Student | null,
  allCourses: CourseSession[] = []
): {
  requiredHours: number;
  completedHours: number;
  presentHours: number;
  leaveHours: number;
  absentHours: number;
  attendanceRate: number;
  dailyRecords: Array<{
    date: string;
    courseName: string;
    className: string;
    periodsCount: number;
    period1: AttendanceStatus;
    period2: AttendanceStatus;
    period3?: AttendanceStatus;
    totalHours: number;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    statusSummary: string;
    remarks?: string;
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
      dailyRecords: [],
    };
  }

  const safeCourses = Array.isArray(allCourses) ? allCourses : [];
  const classCourses = safeCourses.filter(
    (c) => c && c.className === student.className && c.status !== 'holiday' && c.status !== 'rescheduled_out'
  );

  const requiredHours = 165;
  let completedHours = 0;
  let presentHours = 0;
  let leaveHours = 0;
  let absentHours = 0;

  const dailyRecords: any[] = [];

  classCourses.forEach((c) => {
    if (c?.attendanceData && student?.id && c.attendanceData[student.id]) {
      const rec = c.attendanceData[student.id];

      const hours = getStudentIndividualHours(rec, c.periodsCount);
      completedHours += c.periodsCount;
      presentHours += hours.present;
      leaveHours += hours.leave;
      absentHours += hours.absent;

      let statusSummary = `${c.periodsCount}H 全勤出席`;
      if (hours.absent > 0) {
        statusSummary = `${hours.absent}H 曠課缺席`;
      } else if (hours.leave > 0) {
        statusSummary = `${hours.leave}H 請假`;
      }

      dailyRecords.push({
        date: c.date,
        courseName: c.courseName,
        className: c.className,
        periodsCount: c.periodsCount,
        period1: rec.period1,
        period2: rec.period2,
        period3: rec.period3,
        totalHours: c.periodsCount,
        presentHours: hours.present,
        leaveHours: hours.leave,
        absentHours: hours.absent,
        statusSummary,
        remarks: rec.remarks,
      });
    }
  });

  // Sort dailyRecords descending by date
  dailyRecords.sort((a, b) => b.date.localeCompare(a.date));

  // Present = 100%, Leave = 50%, Absent = 0%
  const earnedHours = presentHours + leaveHours * 0.5;
  const attendanceRate =
    completedHours > 0
      ? Math.round((earnedHours / completedHours) * 1000) / 10
      : (student.overallAttendanceRate || 0);

  return {
    requiredHours,
    completedHours,
    presentHours,
    leaveHours,
    absentHours,
    attendanceRate,
    dailyRecords,
  };
}
