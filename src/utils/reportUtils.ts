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
  currentStudentCount: number;
  periodStudentCount: number;
  transferredOutInPeriodCount: number;
  studentCount: number; // backward-compatible alias of periodStudentCount
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
  enrollmentScopeStatus: 'current' | 'transferred_out' | 'historical';
  enrollmentScopeLabel: string;
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
  currentStudents: number;
  periodStudents: number;
  totalStudents: number; // alias of periodStudents (denominator Y)
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
 * Deduplicates students strictly by id and non-empty studentNumber so transferred students are never counted twice.
 */
export function deduplicateStudents(students: Student[] = []): Student[] {
  const result: Student[] = [];
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();

  for (const s of students || []) {
    if (!s || !s.id) continue;
    const idKey = String(s.id).trim();
    const numKey = s.studentNumber ? s.studentNumber.trim().toLowerCase() : '';
    if (seenIds.has(idKey) || (numKey && seenNumbers.has(numKey))) {
      continue;
    }
    seenIds.add(idKey);
    if (numKey) seenNumbers.add(numKey);
    result.push(s);
  }
  return result;
}

function isStudentCurrentlyInClass(student: Student, cls: ClassEntity): boolean {
  return Boolean(
    (student.classId && String(student.classId) === String(cls.id)) ||
      (student.className && student.className.trim() === cls.name.trim())
  );
}

/**
 * Returns students currently enrolled in cls (matches「學生分班與轉班」roster 1:1).
 */
export function getCurrentClassStudents(
  cls: ClassEntity,
  students: Student[] = []
): Student[] {
  return deduplicateStudents(
    (students || []).filter((s) => s && s.id && isStudentCurrentlyInClass(s, cls))
  );
}

function resolveEffectiveDateBounds(
  cls: ClassEntity | undefined,
  terms: Term[] = [],
  options?: ReportFilterOptions
): { startDate?: string; endDate?: string } {
  const activeTerm = options?.termId && options.termId !== 'ALL'
    ? terms.find((t) => t.id === options.termId)
    : cls
    ? terms.find((t) => (cls.termId && t.id === cls.termId) || (cls.term && t.name === cls.term))
    : undefined;

  let startDate = options?.startDate || undefined;
  let endDate = options?.endDate || undefined;

  if (activeTerm?.startDate) {
    if (!startDate || activeTerm.startDate > startDate) {
      startDate = activeTerm.startDate;
    }
  }
  if (activeTerm?.endDate) {
    if (!endDate || activeTerm.endDate < endDate) {
      endDate = activeTerm.endDate;
    }
  }
  return { startDate, endDate };
}

/**
 * Returns deduplicated students who were enrolled in cls during the selected term/date window
 * (currently enrolled in scope + transferred out/historical period + formal class attendance in window).
 */
export function getStudentsForClassReport(
  cls: ClassEntity,
  students: Student[] = [],
  allCourses: CourseSession[] = [],
  transferRecords: TransferClassRecord[] = [],
  options?: ReportFilterOptions,
  terms: Term[] = []
): Student[] {
  const candidates: Student[] = [];
  const { startDate: effStart, endDate: effEnd } = resolveEffectiveDateBounds(cls, terms, options);
  const explicitDateFiltered = Boolean(options?.startDate || options?.endDate);

  const classSessionHasStudent = (studentId: string) =>
    (allCourses || []).some((c) => {
      if (!c) return false;
      const matchClass =
        (c.classId && String(c.classId) === String(cls.id)) ||
        (c.className && c.className.trim() === cls.name.trim());
      if (!matchClass) return false;
      if (effStart && c.date < effStart) return false;
      if (effEnd && c.date > effEnd) return false;
      return Boolean(c.attendanceData && c.attendanceData[studentId]);
    });

  const hasRawTransferOverlap = (s: Student): boolean => {
    const rawEvents: Array<{
      date: string;
      fromClassId?: string;
      fromClassName?: string;
      toClassId?: string;
      toClassName?: string;
    }> = [];

    (transferRecords || []).forEach((tr) => {
      if (tr && String(tr.studentId) === String(s.id) && tr.transferDate) {
        rawEvents.push({
          date: tr.transferDate,
          fromClassId: tr.fromClassId ? String(tr.fromClassId) : undefined,
          fromClassName: tr.fromClassName?.trim(),
          toClassId: tr.toClassId ? String(tr.toClassId) : undefined,
          toClassName: tr.toClassName?.trim(),
        });
      }
    });

    if (Array.isArray(s.enrollmentHistory)) {
      s.enrollmentHistory.forEach((eh: any) => {
        const d = eh.effective_date || eh.actionDate || eh.date;
        if (!d) return;
        rawEvents.push({
          date: d,
          fromClassId: eh.fromClassId || eh.from_class_id ? String(eh.fromClassId || eh.from_class_id) : undefined,
          fromClassName: (eh.fromClass || eh.from_class_name || '').trim() || undefined,
          toClassId: eh.toClassId || eh.to_class_id ? String(eh.toClassId || eh.to_class_id) : undefined,
          toClassName: (eh.toClass || eh.to_class_name || '').trim() || undefined,
        });
      });
    }

    return rawEvents.some((ev) => {
      const matchesFrom =
        (ev.fromClassId && ev.fromClassId === String(cls.id)) ||
        (ev.fromClassName && ev.fromClassName === cls.name.trim());
      const matchesTo =
        (ev.toClassId && ev.toClassId === String(cls.id)) ||
        (ev.toClassName && ev.toClassName === cls.name.trim());

      if (matchesFrom) {
        // Student was in cls up until ev.date (excluded if they already left on or before effStart)
        if (effStart && ev.date <= effStart) return false;
        // If explicit endDate precedes ev.date and student also has a known start after effEnd, skip
        const knownStart = s.admissionDate || s.registrationStartDate;
        if (effEnd && knownStart && knownStart > effEnd) return false;
        return true;
      }

      if (matchesTo) {
        if (effEnd && ev.date > effEnd) return false;
        return true;
      }

      return false;
    });
  };

  for (const s of students || []) {
    if (!s || !s.id) continue;
    const isCurrentMember = isStudentCurrentlyInClass(s, cls);

    if (isCurrentMember) {
      let excludedByExplicitDateWindow = false;
      if (explicitDateFiltered) {
        const memberStart = s.joinedAt || s.admissionDate || s.registrationStartDate;
        if (options?.endDate && memberStart && memberStart > options.endDate) {
          excludedByExplicitDateWindow = true;
        }
        if (options?.startDate && s.droppedAt && s.droppedAt <= options.startDate) {
          excludedByExplicitDateWindow = true;
        }
      }
      if (!excludedByExplicitDateWindow) {
        candidates.push(s);
        continue;
      }
    }

    const timeline = getStudentClassTimeline(s, transferRecords);
    const hadTimelinePeriod = timeline.some((p) => {
      const matchCls =
        (p.classId && String(p.classId) === String(cls.id)) ||
        (p.className && p.className.trim() === cls.name.trim());
      if (!matchCls) return false;
      if (effEnd && p.startDate && p.startDate > effEnd) return false;
      if (effStart && p.endDate && p.endDate <= effStart) return false;
      return true;
    });

    if (hadTimelinePeriod || hasRawTransferOverlap(s) || classSessionHasStudent(s.id)) {
      candidates.push(s);
    }
  }

  return deduplicateStudents(candidates);
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

  const currentClassStudentMap = new Map<string, Student[]>();
  const periodClassStudentMap = new Map<string, Student[]>();

  const classRows: ClassReportRow[] = filteredClasses.map((cls) => {
    const progress = getClassTeachingProgress(cls, allCourses, classes, terms, filters);
    const currentStudents = getCurrentClassStudents(cls, students);
    const periodStudents = getStudentsForClassReport(
      cls,
      students,
      allCourses,
      transferRecords,
      filters,
      terms
    );
    currentClassStudentMap.set(String(cls.id), currentStudents);
    periodClassStudentMap.set(String(cls.id), periodStudents);

    const currentStudentIdSet = new Set(currentStudents.map((s) => String(s.id)));
    const transferredOutInPeriodCount = periodStudents.filter(
      (s) => !currentStudentIdSet.has(String(s.id))
    ).length;

    const clsTerm = terms.find((t) => (cls.termId && t.id === cls.termId) || (cls.term && t.name === cls.term));

    let evaluatedCount = 0;
    let nonCompliantCount = 0;
    let rateSum = 0;
    let scoreSum = 0;

    periodStudents.forEach((s) => {
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
      if (hist.hasAttendanceData && hist.completedHours > 0 && hist.attendanceRate !== null) {
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
      currentStudentCount: currentStudents.length,
      periodStudentCount: periodStudents.length,
      transferredOutInPeriodCount,
      studentCount: periodStudents.length,
      evaluatedStudentCount: evaluatedCount,
      nonCompliantStudentCount: nonCompliantCount,
      averageAttendanceRate,
      averageAttendanceScore,
      progress,
      complianceStatus,
      complianceLabel: formatComplianceLabel(complianceStatus),
    };
  });

  // Determine deduplicated school/scoped current & period student lists
  const scopedClass = activeClassId
    ? filteredClasses[0] || classes.find((c) => c.id === activeClassId || c.name === activeClassId)
    : undefined;

  let currentScopedStudents: Student[] = [];
  let targetStudents: Student[] = [];

  if (scopedClass) {
    currentScopedStudents =
      currentClassStudentMap.get(String(scopedClass.id)) ||
      getCurrentClassStudents(scopedClass, students);
    targetStudents =
      periodClassStudentMap.get(String(scopedClass.id)) ||
      getStudentsForClassReport(scopedClass, students, allCourses, transferRecords, filters, terms);
  } else if (activeTermId || filters.startDate || filters.endDate) {
    currentScopedStudents = deduplicateStudents(
      filteredClasses.flatMap((cls) => currentClassStudentMap.get(String(cls.id)) || [])
    );
    targetStudents = deduplicateStudents(
      filteredClasses.flatMap((cls) => periodClassStudentMap.get(String(cls.id)) || [])
    );
  } else {
    currentScopedStudents = deduplicateStudents(
      filteredClasses.flatMap((cls) => currentClassStudentMap.get(String(cls.id)) || [])
    );
    targetStudents = deduplicateStudents([
      ...filteredClasses.flatMap((cls) => periodClassStudentMap.get(String(cls.id)) || []),
      ...students,
    ]);
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

    let enrollmentScopeStatus: 'current' | 'transferred_out' | 'historical' = 'current';
    let enrollmentScopeLabel = '目前在班';
    if (scopedClass) {
      const isCurrInScoped = isStudentCurrentlyInClass(student, scopedClass);
      if (!isCurrInScoped) {
        if (student.className && student.className !== '尚未分班') {
          enrollmentScopeStatus = 'transferred_out';
          enrollmentScopeLabel = `已轉出（現屬 ${student.className}）`;
        } else {
          enrollmentScopeStatus = 'historical';
          enrollmentScopeLabel = '期間曾在班（目前未分班）';
        }
      }
    } else if (!student.classId && !student.className) {
      enrollmentScopeStatus = 'historical';
      enrollmentScopeLabel = '尚未分班';
    }

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
      enrollmentScopeStatus,
      enrollmentScopeLabel,
      expectedHours: hist.completedHours,
      presentHours: hist.presentHours,
      leaveHours: hist.leaveHours,
      absentHours: hist.absentHours,
      hasAttendanceData: hist.hasAttendanceData && hist.completedHours > 0,
      attendanceRate: hist.attendanceRate,
      attendanceScore: hist.attendanceScore,
      complianceStatus: hist.complianceStatus,
      complianceLabel: formatComplianceLabel(hist.complianceStatus),
      effectiveGrade,
    };
  });

  const evaluatedRows = studentRows.filter(
    (r) => r.hasAttendanceData && r.expectedHours > 0 && r.attendanceRate !== null
  );
  const averageAttendanceRate =
    evaluatedRows.length > 0
      ? Math.round(
          (evaluatedRows.reduce((acc, r) => acc + (r.attendanceRate || 0), 0) / evaluatedRows.length) * 10
        ) / 10
      : null;

  const schoolSummary: SchoolReportSummary = {
    currentStudents: currentScopedStudents.length,
    periodStudents: studentRows.length,
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
