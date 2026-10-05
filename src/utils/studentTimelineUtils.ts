import { Student, CourseSession, TransferClassRecord } from '../types';
import { getTodayDateStr } from './quarterScheduler';

export interface StudentClassPeriod {
  className: string;
  classId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Builds chronological class enrollment periods for a student based on transfers and history.
 * Precedence:
 * 1. student_enrollment_history / transferRecords effective_date
 * 2. class_students.joined_at / dropped_at
 * 3. Formal admissionDate (if explicitly recorded, never guessed with created_at)
 */
export function getStudentClassTimeline(
  student: Student,
  transferRecords?: TransferClassRecord[]
): StudentClassPeriod[] {
  if (!student) return [];

  const transfers: Array<{
    date: string;
    fromClassId?: string;
    fromClassName?: string;
    toClassId?: string;
    toClassName?: string;
    createdAt?: string;
  }> = [];

  if (Array.isArray(transferRecords)) {
    transferRecords.forEach((tr: any) => {
      if (String(tr.studentId) === String(student.id)) {
        transfers.push({
          date: tr.transferDate,
          fromClassId: tr.fromClassId,
          fromClassName: tr.fromClassName,
          toClassId: tr.toClassId,
          toClassName: tr.toClassName,
          createdAt: tr.createdAt,
        });
      }
    });
  }

  if (Array.isArray(student.enrollmentHistory)) {
    student.enrollmentHistory.forEach((eh: any) => {
      const d = eh.effective_date || eh.actionDate || eh.date;
      const toId = eh.toClassId || eh.to_class_id;
      const toName = eh.toClass || eh.to_class_name;
      if (d && !transfers.some((t) => t.date === d && (t.toClassId === toId || t.toClassName === toName))) {
        transfers.push({
          date: d,
          fromClassId: eh.fromClassId || eh.from_class_id,
          fromClassName: eh.fromClass || eh.from_class_name,
          toClassId: toId,
          toClassName: toName,
          createdAt: eh.createdAt || eh.created_at,
        });
      }
    });
  }

  transfers.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    // If a's destination is b's origin, a happened before b
    if (
      (a.toClassId && b.fromClassId && a.toClassId === b.fromClassId) ||
      (a.toClassName && b.fromClassName && a.toClassName === b.fromClassName)
    ) {
      return -1;
    }
    if (
      (b.toClassId && a.fromClassId && b.toClassId === a.fromClassId) ||
      (b.toClassName && a.fromClassName && b.toClassName === a.fromClassName)
    ) {
      return 1;
    }
    // Prefer student's current active class as final destination
    if (student.classId) {
      if (a.toClassId === student.classId && b.toClassId !== student.classId) return 1;
      if (b.toClassId === student.classId && a.toClassId !== student.classId) return -1;
    }
    if (a.createdAt && b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return 0;
  });

  // If no transfer history: student belongs to current class strictly starting from joinedAt or admissionDate
  if (transfers.length === 0) {
    const startDate = student.joinedAt || student.admissionDate;
    if (!startDate || (!student.classId && !student.className)) {
      // Historical data missing or unassigned: do NOT guess, leave blank per rule IV
      return [];
    }
    return [
      {
        className: student.className || '',
        classId: student.classId,
        startDate: startDate,
        endDate: student.droppedAt || undefined,
      },
    ];
  }

  const periods: StudentClassPeriod[] = [];

  // If earliest transfer had a fromClassId:
  // Only include fromClass if there is a verified joinedAt/admissionDate for it.
  // Never assume the student was in that class indefinitely back in time without a verified start date!
  if (transfers[0].fromClassId || transfers[0].fromClassName) {
    const fromStart = (student.joinedAt && student.joinedAt < transfers[0].date)
      ? student.joinedAt
      : (student.admissionDate && student.admissionDate < transfers[0].date)
        ? student.admissionDate
        : undefined;

    if (fromStart) {
      periods.push({
        className: transfers[0].fromClassName || '',
        classId: transfers[0].fromClassId,
        startDate: fromStart,
        endDate: transfers[0].date,
      });
    }
  }

  // Intermediate transfers
  for (let i = 0; i < transfers.length - 1; i++) {
    periods.push({
      className: transfers[i].toClassName || transfers[i + 1].fromClassName || '',
      classId: transfers[i].toClassId || transfers[i + 1].fromClassId,
      startDate: transfers[i].date,
      endDate: transfers[i + 1].date,
    });
  }

  // After last transfer
  const last = transfers[transfers.length - 1];
  periods.push({
    className: last.toClassName || student.className || '',
    classId: last.toClassId || student.classId,
    startDate: last.date,
  });

  return periods;
}

/**
 * Checks whether a given class session belonged to the student on that date.
 * Strict comparison: matches strictly by classId if both present, or exact className.
 * Never uses fuzzy string contains matching!
 */
export function isStudentInSessionClass(
  sessionDate: string,
  sessionClassId?: string,
  sessionClassName?: string,
  timeline: StudentClassPeriod[] = []
): boolean {
  if (!timeline || timeline.length === 0) return false;

  const invalidNames = ['華語班級', '班級', '未命名班級', '原班級', '新班級', '華語課程', '未設定班級', '華語密集班', '預設班級'];

  for (const period of timeline) {
    // A period must have a verified startDate to match dates
    if (!period.startDate) {
      continue;
    }
    if (sessionDate < period.startDate) {
      continue;
    }
    if (period.endDate && sessionDate >= period.endDate) {
      continue;
    }

    // Strict match by classId
    if (sessionClassId && period.classId) {
      if (String(sessionClassId) === String(period.classId)) return true;
      continue;
    }

    // Strict match by exact className (excluding placeholder strings)
    if (
      sessionClassName &&
      period.className &&
      !invalidNames.includes(sessionClassName.trim()) &&
      !invalidNames.includes(period.className.trim())
    ) {
      if (sessionClassName.trim() === period.className.trim()) return true;
      continue;
    }
  }

  return false;
}

/**
 * Checks whether a session has already ended in real time.
 * Only sessions where current datetime >= session end datetime are considered "ended" (已結束/已發生).
 * Future sessions or today sessions not yet ended return false.
 */
export function isSessionEnded(sessionDate: string, endTime?: string): boolean {
  if (!sessionDate) return false;
  const now = new Date();

  const [year, month, day] = sessionDate.split('-').map(Number);
  if (!year || !month || !day) return false;

  let endHour = 12;
  let endMinute = 0;
  if (endTime) {
    const parts = endTime.split(':').map(Number);
    if (!isNaN(parts[0])) endHour = parts[0];
    if (!isNaN(parts[1])) endMinute = parts[1];
  }

  const sessionEnd = new Date(year, month - 1, day, endHour, endMinute, 0);
  if (isNaN(sessionEnd.getTime())) {
    const today = getTodayDateStr();
    return sessionDate < today;
  }
  return now.getTime() >= sessionEnd.getTime();
}

/**
 * Checks whether a student belonged to a class on a specific session date.
 */
export function isStudentInClassOnDate(
  student: Student,
  classId?: string,
  sessionDate?: string,
  transferRecords?: TransferClassRecord[],
  className?: string
): boolean {
  if (!student || !sessionDate) return false;
  const timeline = getStudentClassTimeline(student, transferRecords);
  return isStudentInSessionClass(sessionDate, classId, className, timeline);
}

/**
 * Reconstructs the exact, legitimate roster of students who belonged to a session on sessionDate.
 * Priority:
 * 1. Formal attendance_records for student_id + session_id are historical facts and ALWAYS included.
 * 2. If no formal record, only students who belonged to classId on sessionDate per timeline.
 */
export function getSessionRoster(
  session: {
    id?: string;
    date: string;
    classId?: string;
    className?: string;
    attendanceData?: Record<string, any>;
  },
  allStudents: Student[],
  transferRecords?: TransferClassRecord[]
): Student[] {
  if (!session) return [];
  const result: Student[] = [];
  const addedIds = new Set<string>();

  const safeStudents = Array.isArray(allStudents) ? allStudents : [];

  for (const s of safeStudents) {
    if (!s || !s.id) continue;

    // 1. Explicit attendance record is historical fact
    const hasExplicitRecord = Boolean(session.attendanceData && session.attendanceData[s.id]);
    if (hasExplicitRecord) {
      result.push(s);
      addedIds.add(s.id);
      continue;
    }

    // 2. Timeline check on session.date
    if (isStudentInClassOnDate(s, session.classId, session.date, transferRecords, session.className)) {
      result.push(s);
      addedIds.add(s.id);
    }
  }

  return result;
}
