import {
  ClassEntity,
  CourseSession,
  Student,
  StudentGrade,
  StudentGradeWeight,
  Term,
  TransferClassRecord,
} from '../types';
import {
  calculateStudentAttendanceHistory,
  isSessionCancelledOrSuspended,
  isSessionEnded,
  isSessionSubmittedAttendance,
  getStudentClassTimeline,
} from './attendanceUtils';
import { getStudentEffectiveGrade } from './gradeUtils';

export type ClassProgressStatus =
  | 'unscheduled'
  | 'not_started'
  | 'pending_attendance'
  | 'in_progress'
  | 'completed';

export type ComplianceStatus = 'unevaluated' | 'compliant' | 'non_compliant';

export interface ReportFilterOptions {
  termId?: string;
  classId?: string;
  startDate?: string;
  endDate?: string;
  referenceTodayStr?: string; // Optional deterministic date override for testing
}

export interface ClassTeachingProgress {
  classId: string;
  className: string;
  scheduledHours: number;
  deliveredHours: number;
  targetHours: number;
  scheduledSessionCount: number;
  deliveredSessionCount: number;
  pendingAttendanceCount: number;
  futureSessionCount: number;
  cancelledOrRescheduledCount: number;
  progressStatus: ClassProgressStatus;
  progressLabel: string;
}

export interface ClassReportRow {
  cls: ClassEntity;
  termName: string;
  teacherName: string;
  studentCount: number;
  evaluatedStudentCount: number;
  nonCompliantStudentCount: number;
  averageAttendanceRate: number | null;
  averageAttendanceScore: number | null;
  progress: ClassTeachingProgress;
  complianceStatus: ComplianceStatus;
  complianceLabel: string;
}

export interface StudentReportRow {
  student: Student;
  scopedClassId?: string;
  scopedClassName: string;
  expectedHours: number;
  presentHours: number;
  leaveHours: number;
  absentHours: number;
  hasAttendanceData: boolean;
  attendanceRate: number | null;
  attendanceScore: number | null;
  complianceStatus: ComplianceStatus;
  complianceLabel: string;
  effectiveGrade: StudentGrade;
}

export interface SchoolReportSummary {
  totalStudents: number;
  evaluatedStudents: number;
  unevaluatedStudents: number;
  nonCompliantStudents: number;
  averageAttendanceRate: number | null;
  totalScheduledHours: number;
  totalDeliveredHours: number;
  totalTargetHours: number;
  classCount: number;
  unscheduledClassCount: number;
  notStartedClassCount: number;
  pendingAttendanceClassCount: number;
}

export function formatAttendanceRate(rate: number | null | undefined, hasData?: boolean): string {
  if (hasData === false || rate === null || rate === undefined || Number.isNaN(rate)) {
    return '—';
  }
  return `${rate}%`;
}

export function formatAttendanceScore(score: number | null | undefined, hasData?: boolean): string {
  if (hasData === false || score === null || score === undefined || Number.isNaN(score)) {
    return '尚未計算';
  }
  return `${score} 分`;
}

export function formatComplianceLabel(status: ComplianceStatus): string {
  if (status === 'compliant') return '合規';
  if (status === 'non_compliant') return '不合規';
  return '未評估';
}

export function formatTotalGradeDisplay(grade: StudentGrade): string {
  if (grade.totalScore === null || grade.totalScore === undefined || Number.isNaN(grade.totalScore)) {
    return '待計算';
  }
  if (grade.isEstimated) {
    return `${grade.totalScore} (暫估)`;
  }
  return `${grade.totalScore}`;
}

export function resolveTermTargetHours(
  termId: string | undefined,
  classes: ClassEntity[] = [],
  terms: Term[] = [],
  termName?: string
): number {
  const matchedTerm = terms.find(
    (t) => (termId && t.id === termId) || (termName && t.name === termName)
  );
  if (matchedTerm?.targetHours && matchedTerm.targetHours > 0) {
    return matchedTerm.targetHours;
  }
  const siblingTargets = classes
    .filter(
      (c) =>
        c.totalTargetHours > 0 &&
        ((termId && c.termId === termId) ||
          (matchedTerm && c.term === matchedTerm.name) ||
          (termName && c.term === termName))
    )
    .map((c) => c.totalTargetHours);
  if (siblingTargets.length > 0) {
    return siblingTargets[0];
  }
  return 0;
}

export function resolveClassTargetHours(
  cls: ClassEntity | undefined,
  classes: ClassEntity[] = [],
  terms: Term[] = []
): number {
  if (!cls) return 0;
  if (cls.totalTargetHours && cls.totalTargetHours > 0) {
    return cls.totalTargetHours;
  }
  return resolveTermTargetHours(cls.termId, classes, terms, cls.term);
}

export function evaluateStudentCompliance(
  attendanceRate: number | null | undefined,
  hasAttendanceData: boolean
): ComplianceStatus {
  if (!hasAttendanceData || attendanceRate === null || attendanceRate === undefined) {
    return 'unevaluated';
  }
  return attendanceRate >= 80 ? 'compliant' : 'non_compliant';
}

function checkSessionEndedWithRef(sessionDate: string, endTime?: string, referenceTodayStr?: string): boolean {
  if (referenceTodayStr) {
    if (sessionDate < referenceTodayStr) return true;
    if (sessionDate > referenceTodayStr) return false;
    return isSessionEnded(sessionDate, endTime);
  }
  return isSessionEnded(sessionDate, endTime);
}

export function getClassTeachingProgress(
  cls: ClassEntity,
  allCourses: CourseSession[] = [],
  classes: ClassEntity[] = [],
  terms: Term[] = [],
  options?: ReportFilterOptions
): ClassTeachingProgress {
  const targetHours = resolveClassTargetHours(cls, classes, terms);
  const classCourses = (allCourses || []).filter((c) => {
    if (!c) return false;
    const matchClass =
      (c.classId && String(c.classId) === String(cls.id)) ||
      (c.className && c.className.trim() === cls.name.trim());
    if (!matchClass) return false;
    if (options?.startDate && c.date < options.startDate) return false;
    if (options?.endDate && c.date > options.endDate) return false;
    return true;
  });

  let cancelledOrRescheduledCount = 0;
  const seenActiveKeys = new Set<string>();
  const activeSessions: CourseSession[] = [];

  for (const c of classCourses) {
    if (isSessionCancelledOrSuspended(c)) {
      cancelledOrRescheduledCount++;
      continue;
    }
    const dedupKey = c.id
      ? `id_${c.id}`
      : `${c.date}_${c.timeSlot || `${c.startTime || ''}-${c.endTime || ''}`}`;
    if (seenActiveKeys.has(dedupKey)) {
      continue;
    }
    seenActiveKeys.add(dedupKey);
    activeSessions.push(c);
  }

  let scheduledHours = 0;
  let deliveredHours = 0;
  let deliveredSessionCount = 0;
  let pendingAttendanceCount = 0;
  let futureSessionCount = 0;

  for (const s of activeSessions) {
    const hours = Number(s.periodsCount) || 3;
    scheduledHours += hours;

    if (isSessionSubmittedAttendance(s)) {
      deliveredHours += hours;
      deliveredSessionCount++;
    } else if (checkSessionEndedWithRef(s.date, s.endTime, options?.referenceTodayStr)) {
      pendingAttendanceCount++;
    } else {
      futureSessionCount++;
    }
  }

  const scheduledSessionCount = activeSessions.length;

  let progressStatus: ClassProgressStatus;
  let progressLabel: string;

  if (scheduledSessionCount === 0 && deliveredHours === 0) {
    progressStatus = 'unscheduled';
    progressLabel = '尚未安排課程';
  } else if (pendingAttendanceCount > 0) {
    progressStatus = 'pending_attendance';
    progressLabel = '待點名';
  } else if (deliveredHours === 0) {
    progressStatus = 'not_started';
    progressLabel = '尚未開課';
  } else if (futureSessionCount === 0 && targetHours > 0 && deliveredHours >= targetHours) {
    progressStatus = 'completed';
    progressLabel = '已結業';
  } else {
    progressStatus = 'in_progress';
    progressLabel = '授課中';
  }

  return {
    classId: cls.id,
    className: cls.name,
    scheduledHours,
    deliveredHours,
    targetHours,
    scheduledSessionCount,
    deliveredSessionCount,
    pendingAttendanceCount,
    futureSessionCount,
    cancelledOrRescheduledCount,
    progressStatus,
    progressLabel,
  };
}

/**
 * Returns students affiliated with cls (current enrollees + transfer-history/recorded enrollees).
 */
export function getStudentsForClassReport(
  cls: ClassEntity,
  students: Student[] = [],
  allCourses: CourseSession[] = [],
  transferRecords: TransferClassRecord[] = [],
  options?: ReportFilterOptions
): Student[] {
  const result: Student[] = [];
  const added = new Set<string>();

  const classSessionHasStudent = (studentId: string) =>
    (allCourses || []).some((c) => {
      if (!c) return false;
      const matchClass =
        (c.classId && String(c.classId) === String(cls.id)) ||
        (c.className && c.className.trim() === cls.name.trim());
      if (!matchClass) return false;
      if (options?.startDate && c.date < options.startDate) return false;
      if (options?.endDate && c.date > options.endDate) return false;
      return Boolean(c.attendanceData && c.attendanceData[studentId]);
    });

  for (const s of students || []) {
    if (!s || !s.id) continue;
    const isCurrentMember =
      (s.classId && String(s.classId) === String(cls.id)) ||
      (s.className && s.className.trim() === cls.name.trim());

    let hadTimelinePeriod = false;
    if (!isCurrentMember) {
      const timeline = getStudentClassTimeline(s, transferRecords);
      hadTimelinePeriod = timeline.some((p) => {
        const matchCls =
          (p.classId && String(p.classId) === String(cls.id)) ||
          (p.className && p.className.trim() === cls.name.trim());
        if (!matchCls) return false;
        if (options?.endDate && p.startDate && p.startDate > options.endDate) return false;
        if (options?.startDate && p.endDate && p.endDate <= options.startDate) return false;
        return true;
      });
    }

    if (isCurrentMember || hadTimelinePeriod || classSessionHasStudent(s.id)) {
      if (!added.has(s.id)) {
        added.add(s.id);
        result.push(s);
      }
    }
  }

  return result;
}

export function buildAdminReportData(params: {
  students: Student[];
  classes: ClassEntity[];
  allCourses: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  transferRecords?: TransferClassRecord[];
  gradeWeightsMap?: Record<string, StudentGradeWeight>;
  terms?: Term[];
  filters?: ReportFilterOptions;
}): {
  filteredClasses: ClassEntity[];
  classRows: ClassReportRow[];
  studentRows: StudentReportRow[];
  schoolSummary: SchoolReportSummary;
} {
  const {
    students = [],
    classes = [],
    allCourses = [],
    allGrades = {},
    transferRecords = [],
    gradeWeightsMap = {},
    terms = [],
    filters = {},
  } = params;

  const activeTermId = filters.termId && filters.termId !== 'ALL' ? filters.termId : undefined;
  const activeClassId = filters.classId && filters.classId !== 'ALL' ? filters.classId : undefined;
  const activeTermObj = activeTermId ? terms.find((t) => t.id === activeTermId) : undefined;

  const filteredClasses = classes.filter((cls) => {
    if (activeTermId) {
      const matchesTermId = cls.termId && String(cls.termId) === String(activeTermId);
      const matchesTermName = activeTermObj && cls.term === activeTermObj.name;
      if (!matchesTermId && !matchesTermName) return false;
    }
    if (activeClassId) {
      if (String(cls.id) !== String(activeClassId) && cls.name !== activeClassId) return false;
    }
    return true;
  });

  const classRows: ClassReportRow[] = filteredClasses.map((cls) => {
    const progress = getClassTeachingProgress(cls, allCourses, classes, terms, filters);
    const clsStudents = getStudentsForClassReport(cls, students, allCourses, transferRecords, filters);
    const clsTerm = terms.find((t) => (cls.termId && t.id === cls.termId) || (cls.term && t.name === cls.term));

    let evaluatedCount = 0;
    let nonCompliantCount = 0;
    let rateSum = 0;
    let scoreSum = 0;

    clsStudents.forEach((s) => {
      const hist = calculateStudentAttendanceHistory(s, allCourses, transferRecords, {
        classId: cls.id,
        className: cls.name,
        termId: activeTermId || cls.termId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        classes,
        terms,
        requiredHoursOverride: progress.targetHours > 0 ? progress.targetHours : undefined,
      });
      if (hist.hasAttendanceData && hist.attendanceRate !== null) {
        evaluatedCount++;
        rateSum += hist.attendanceRate;
        if (hist.attendanceScore !== null) scoreSum += hist.attendanceScore;
        if (hist.attendanceRate < 80) nonCompliantCount++;
      }
    });

    const averageAttendanceRate =
      evaluatedCount > 0 ? Math.round((rateSum / evaluatedCount) * 10) / 10 : null;
    const averageAttendanceScore =
      evaluatedCount > 0 ? Math.round((scoreSum / evaluatedCount) * 10) / 10 : null;

    let complianceStatus: ComplianceStatus = 'unevaluated';
    if (
      progress.progressStatus !== 'unscheduled' &&
      progress.progressStatus !== 'not_started' &&
      evaluatedCount > 0 &&
      averageAttendanceRate !== null
    ) {
      complianceStatus =
        nonCompliantCount > 0 || averageAttendanceRate < 80 ? 'non_compliant' : 'compliant';
    }

    return {
      cls,
      termName: clsTerm?.name || cls.term || '未設定學期',
      teacherName: cls.teacherName ? `${cls.teacherName}` : '未指派教師',
      studentCount: clsStudents.length,
      evaluatedStudentCount: evaluatedCount,
      nonCompliantStudentCount: nonCompliantCount,
      averageAttendanceRate,
      averageAttendanceScore,
      progress,
      complianceStatus,
      complianceLabel: formatComplianceLabel(complianceStatus),
    };
  });

  // Determine student rows scoped identically to active filters
  const scopedClass = activeClassId
    ? filteredClasses[0] || classes.find((c) => c.id === activeClassId || c.name === activeClassId)
    : undefined;

  let targetStudents: Student[] = [];
  if (scopedClass) {
    targetStudents = getStudentsForClassReport(scopedClass, students, allCourses, transferRecords, filters);
  } else if (activeTermId) {
    const seen = new Set<string>();
    filteredClasses.forEach((cls) => {
      getStudentsForClassReport(cls, students, allCourses, transferRecords, filters).forEach((s) => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          targetStudents.push(s);
        }
      });
    });
  } else {
    targetStudents = [...students];
  }

  const studentRows: StudentReportRow[] = targetStudents.map((student) => {
    const studentClassObj =
      scopedClass ||
      classes.find((c) => (student.classId && c.id === student.classId) || (student.className && c.name === student.className));
    const hist = calculateStudentAttendanceHistory(student, allCourses, transferRecords, {
      classId: scopedClass?.id,
      className: scopedClass?.name,
      termId: activeTermId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      classes,
      terms,
    });

    const termIdForGrade = activeTermId || studentClassObj?.termId;
    const classIdForGrade = scopedClass?.id || student.classId;
    const allowedClassIds = new Set(filteredClasses.map((c) => String(c.id)));
    const allowedClassNames = new Set(filteredClasses.map((c) => c.name.trim()));
    const scopedCoursesForGrade =
      scopedClass || activeTermId || filters.startDate || filters.endDate
        ? allCourses.filter((c) => {
            if (!c) return false;
            if (scopedClass) {
              const matchC =
                (c.classId && String(c.classId) === String(scopedClass.id)) ||
                (c.className && c.className.trim() === scopedClass.name.trim());
              if (!matchC) return false;
            } else if (activeTermId) {
              const matchTermCls =
                (c.classId && allowedClassIds.has(String(c.classId))) ||
                (c.className && allowedClassNames.has(c.className.trim()));
              const matchTermDates = Boolean(
                activeTermObj?.startDate &&
                  activeTermObj?.endDate &&
                  c.date >= activeTermObj.startDate &&
                  c.date <= activeTermObj.endDate
              );
              if (!matchTermCls && !matchTermDates) return false;
            }
            if (filters.startDate && c.date < filters.startDate) return false;
            if (filters.endDate && c.date > filters.endDate) return false;
            return true;
          })
        : allCourses;

    const effectiveGrade = getStudentEffectiveGrade(
      student,
      allGrades,
      scopedCoursesForGrade,
      transferRecords,
      gradeWeightsMap,
      termIdForGrade,
      classIdForGrade
    );

    return {
      student,
      scopedClassId: scopedClass?.id || student.classId,
      scopedClassName: scopedClass?.name || student.className || '尚未分班',
      expectedHours: hist.completedHours,
      presentHours: hist.presentHours,
      leaveHours: hist.leaveHours,
      absentHours: hist.absentHours,
      hasAttendanceData: hist.hasAttendanceData,
      attendanceRate: hist.attendanceRate,
      attendanceScore: hist.attendanceScore,
      complianceStatus: hist.complianceStatus,
      complianceLabel: formatComplianceLabel(hist.complianceStatus),
      effectiveGrade,
    };
  });

  const evaluatedRows = studentRows.filter((r) => r.hasAttendanceData && r.attendanceRate !== null);
  const averageAttendanceRate =
    evaluatedRows.length > 0
      ? Math.round(
          (evaluatedRows.reduce((acc, r) => acc + (r.attendanceRate || 0), 0) / evaluatedRows.length) * 10
        ) / 10
      : null;

  const schoolSummary: SchoolReportSummary = {
    totalStudents: studentRows.length,
    evaluatedStudents: evaluatedRows.length,
    unevaluatedStudents: studentRows.length - evaluatedRows.length,
    nonCompliantStudents: evaluatedRows.filter((r) => (r.attendanceRate ?? 100) < 80).length,
    averageAttendanceRate,
    totalScheduledHours: classRows.reduce((acc, r) => acc + r.progress.scheduledHours, 0),
    totalDeliveredHours: classRows.reduce((acc, r) => acc + r.progress.deliveredHours, 0),
    totalTargetHours: classRows.reduce((acc, r) => acc + r.progress.targetHours, 0),
    classCount: classRows.length,
    unscheduledClassCount: classRows.filter((r) => r.progress.progressStatus === 'unscheduled').length,
    notStartedClassCount: classRows.filter((r) => r.progress.progressStatus === 'not_started').length,
    pendingAttendanceClassCount: classRows.filter((r) => r.progress.progressStatus === 'pending_attendance').length,
  };

  return {
    filteredClasses,
    classRows,
    studentRows,
    schoolSummary,
  };
}
