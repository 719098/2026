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
  students: Student[],
  attendanceData: { [studentId: string]: StudentPeriodAttendance },
  periodsCount: number = 3
): AttendanceCalculationResult {
  const totalStudents = students.length;
  const period1 = { present: 0, leave: 0, absent: 0 };
  const period2 = { present: 0, leave: 0, absent: 0 };
  const period3 = { present: 0, leave: 0, absent: 0 };
  const period4 = { present: 0, leave: 0, absent: 0 };

  let totalPresentHours = 0;
  let totalLeaveHours = 0;
  let totalAbsentHours = 0;

  students.forEach((student) => {
    const record = attendanceData[student.id] || {
      period1: 'present',
      period2: 'present',
      period3: periodsCount >= 3 ? 'present' : undefined,
      period4: periodsCount >= 4 ? 'present' : undefined,
    };

    // Period 1
    if (record.period1) {
      period1[record.period1]++;
      if (record.period1 === 'present') totalPresentHours++;
      if (record.period1 === 'leave') totalLeaveHours++;
      if (record.period1 === 'absent') totalAbsentHours++;
    }

    // Period 2
    if (record.period2) {
      period2[record.period2]++;
      if (record.period2 === 'present') totalPresentHours++;
      if (record.period2 === 'leave') totalLeaveHours++;
      if (record.period2 === 'absent') totalAbsentHours++;
    }

    // Period 3 (if >= 3-hour class)
    if (periodsCount >= 3 && record.period3) {
      period3[record.period3]++;
      if (record.period3 === 'present') totalPresentHours++;
      if (record.period3 === 'leave') totalLeaveHours++;
      if (record.period3 === 'absent') totalAbsentHours++;
    }

    // Period 4 (if >= 4-hour class)
    if (periodsCount >= 4 && record.period4) {
      period4[record.period4]++;
      if (record.period4 === 'present') totalPresentHours++;
      if (record.period4 === 'leave') totalLeaveHours++;
      if (record.period4 === 'absent') totalAbsentHours++;
    }
  });

  const totalHours = totalStudents * periodsCount;
  // Rule: Present = 100% (1.0), Leave = 50% (0.5), Absent = 0% (0.0)
  const earnedHours = totalPresentHours + totalLeaveHours * 0.5;
  const attendanceRate = totalHours > 0 ? Math.round((earnedHours / totalHours) * 1000) / 10 : 100;

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
    allMarked: true,
  };
}

export function getDefaultAttendanceForStudents(
  students: Student[],
  periodsCount: number = 3
): { [studentId: string]: StudentPeriodAttendance } {
  const initial: { [studentId: string]: StudentPeriodAttendance } = {};
  students.forEach((student) => {
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
  currentAttendance: { [studentId: string]: StudentPeriodAttendance },
  students: Student[],
  leaveRecords: LeaveRecord[],
  courseDate: string,
  periodsCount: number = 3
): { updatedAttendance: { [studentId: string]: StudentPeriodAttendance }; appliedCount: number } {
  const updated = { ...currentAttendance };
  let appliedCount = 0;

  // Filter leaves for this date and these students
  const applicableLeaves = leaveRecords.filter(
    (l) => l.date === courseDate && l.status === 'approved'
  );

  applicableLeaves.forEach((leave) => {
    const student = students.find(
      (s) => s.id === leave.studentId || s.name === leave.studentName
    );
    if (student) {
      const existing = updated[student.id] || {
        period1: 'present',
        period2: 'present',
        period3: periodsCount >= 3 ? 'present' : undefined,
        period4: periodsCount >= 4 ? 'present' : undefined,
      };

      const newRecord = { ...existing };
      if (leave.periods.includes(1)) newRecord.period1 = 'leave';
      if (leave.periods.includes(2)) newRecord.period2 = 'leave';
      if (periodsCount >= 3 && leave.periods.includes(3)) newRecord.period3 = 'leave';
      if (periodsCount >= 4 && leave.periods.includes(4)) newRecord.period4 = 'leave';
      newRecord.remarks = `${leave.typeName}：${leave.reason}`;

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
  student: Student,
  allCourses: CourseSession[]
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
  const classCourses = allCourses.filter(
    (c) => c.className === student.className && c.status !== 'holiday' && c.status !== 'rescheduled_out'
  );

  const requiredHours = 165;
  let completedHours = 0;
  let presentHours = 0;
  let leaveHours = 0;
  let absentHours = 0;

  const dailyRecords: any[] = [];

  classCourses.forEach((c) => {
    if (c.status === 'completed' && c.attendanceData) {
      const rec = c.attendanceData[student.id] || {
        period1: 'present',
        period2: 'present',
        period3: c.periodsCount === 3 ? 'present' : undefined,
      };

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
      : student.overallAttendanceRate;

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
