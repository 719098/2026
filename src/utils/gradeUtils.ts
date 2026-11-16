import {
  Student,
  StudentGrade,
  CourseSession,
  TransferClassRecord,
  StudentGradeWeight,
} from '../types';
import {
  calculateStudentAttendanceHistory,
  isSessionCancelledOrSuspended,
  AttendanceHistoryOptions,
} from './attendanceUtils';

export const DEFAULT_GRADE_WEIGHTS: {
  attendanceWeight: number;
  quizWeight: number;
  midtermWeight: number;
  finalWeight: number;
  homeworkWeight: number;
  attitudeWeight: number;
} = {
  attendanceWeight: 20,
  quizWeight: 15,
  midtermWeight: 20,
  finalWeight: 20,
  homeworkWeight: 15,
  attitudeWeight: 10,
};

export const GRADE_WEIGHTS = {
  attendance: 0.20, // 20% 出席
  quiz: 0.15,       // 15% 平時考
  midterm: 0.20,    // 20% 期中考
  final: 0.20,      // 20% 期末考
  homework: 0.15,   // 15% 作業
  attitude: 0.10,   // 10% 學習態度
};

export interface StudentAttendanceCalculationResult {
  attendanceScore: number | null; // 0 ~ 100 percentage, null when no formal attendance records
  weightedScore: number | null;   // attendanceScore * 0.20 (0 ~ 20), null when no formal attendance records
  totalSessions: number;          // count of sessions with attendance recorded
  totalPeriods: number;           // total periods counted
  presentPeriods: number;         // periods marked present
  leavePeriods: number;           // periods marked leave
  absentPeriods: number;          // periods marked absent
  hasRecords: boolean;            // true if student has at least one formal recorded period
}

/**
 * Calculates student attendance score based on official CLC weighting:
 * - Present (出席) = 100% (weight 1.0)
 * - Leave (請假) = 50% (weight 0.5)
 * - Absent (缺席 / 曠課) = 0% (weight 0.0)
 *
 * Returns null for attendanceScore and weightedScore when hasRecords is false.
 */
export function calculateStudentAttendanceScore(
  studentId: string,
  courses: CourseSession[],
  studentClassName?: string,
  student?: Student,
  transferRecords?: TransferClassRecord[],
  options?: AttendanceHistoryOptions
): StudentAttendanceCalculationResult {
  if (student) {
    const history = calculateStudentAttendanceHistory(student, courses, transferRecords, options);
    const totalPeriods = history.completedHours;
    if (!history.hasAttendanceData || totalPeriods === 0 || history.attendanceScore === null) {
      return {
        attendanceScore: null,
        weightedScore: null,
        totalSessions: 0,
        totalPeriods: 0,
        presentPeriods: 0,
        leavePeriods: 0,
        absentPeriods: 0,
        hasRecords: false,
      };
    }
    const attendanceScore = history.attendanceScore;
    const weightedScore = Math.round(attendanceScore * GRADE_WEIGHTS.attendance * 10) / 10;
    return {
      attendanceScore,
      weightedScore,
      totalSessions: history.dailyRecords.filter((r) => !r.isCancelled).length,
      totalPeriods,
      presentPeriods: history.presentHours,
      leavePeriods: history.leaveHours,
      absentPeriods: history.absentHours,
      hasRecords: true,
    };
  }

  let totalPeriods = 0;
  let presentPeriods = 0;
  let leavePeriods = 0;
  let absentPeriods = 0;
  let sessionCount = 0;
  const seenKeys = new Set<string>();

  for (const c of courses || []) {
    if (!c || isSessionCancelledOrSuspended(c) || c.status === 'in_progress') {
      continue;
    }

    if (studentClassName && c.className && c.className !== studentClassName && c.classId !== studentClassName) {
      continue;
    }

    if (!c.attendanceData || !c.attendanceData[studentId]) {
      continue;
    }

    const dedupKey = c.id ? `id_${c.id}` : `${c.date}_${c.classId || c.className}_${c.timeSlot || ''}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    const att = c.attendanceData[studentId];
    const periodsCount = c.periodsCount || 3;
    const periods: (string | undefined)[] = [att.period1, att.period2];
    if (periodsCount >= 3) periods.push(att.period3);
    if (periodsCount >= 4) periods.push(att.period4);

    let hasAnyMarked = false;
    for (const p of periods.slice(0, periodsCount)) {
      if (!p) continue;
      const statusLower = String(p).toLowerCase();
      if (statusLower === 'present') {
        presentPeriods += 1;
        totalPeriods += 1;
        hasAnyMarked = true;
      } else if (statusLower === 'leave') {
        leavePeriods += 1;
        totalPeriods += 1;
        hasAnyMarked = true;
      } else if (statusLower === 'absent') {
        absentPeriods += 1;
        totalPeriods += 1;
        hasAnyMarked = true;
      }
    }

    if (hasAnyMarked) {
      sessionCount += 1;
    }
  }

  if (totalPeriods === 0) {
    return {
      attendanceScore: null,
      weightedScore: null,
      totalSessions: 0,
      totalPeriods: 0,
      presentPeriods: 0,
      leavePeriods: 0,
      absentPeriods: 0,
      hasRecords: false,
    };
  }

  const earnedPoints = presentPeriods * 1.0 + leavePeriods * 0.5 + absentPeriods * 0.0;
  const attendanceScore = Math.round((earnedPoints / totalPeriods) * 1000) / 10;
  const weightedScore = Math.round(attendanceScore * GRADE_WEIGHTS.attendance * 10) / 10;

  return {
    attendanceScore,
    weightedScore,
    totalSessions: sessionCount,
    totalPeriods,
    presentPeriods,
    leavePeriods,
    absentPeriods,
    hasRecords: true,
  };
}

// Calculate total score using customizable percentage formula (default 20/15/20/20/15/10)
export function calculateTotalGrade(
  attendanceScore: number,
  quizScore: number,
  midtermScore: number,
  finalScore: number,
  homeworkScore: number,
  attitudeScore: number,
  weights?:
    | StudentGradeWeight
    | {
        attendanceWeight: number;
        quizWeight: number;
        midtermWeight: number;
        finalWeight: number;
        homeworkWeight: number;
        attitudeWeight: number;
      }
): number {
  const wAtt = weights?.attendanceWeight ?? 20;
  const wQuiz = weights?.quizWeight ?? 15;
  const wMid = weights?.midtermWeight ?? 20;
  const wFin = weights?.finalWeight ?? 20;
  const wHw = weights?.homeworkWeight ?? 15;
  const wAttid = weights?.attitudeWeight ?? 10;

  const total =
    (attendanceScore * wAtt +
      quizScore * wQuiz +
      midtermScore * wMid +
      finalScore * wFin +
      homeworkScore * wHw +
      attitudeScore * wAttid) /
    100.0;

  return Math.round(total * 100) / 100;
}

export function calculateProvisionalTotalGrade(
  scores: {
    attendanceScore: number | null;
    quizScore: number | null;
    midtermScore: number | null;
    finalScore: number | null;
    homeworkScore: number | null;
    attitudeScore: number | null;
  },
  weights?:
    | StudentGradeWeight
    | {
        attendanceWeight: number;
        quizWeight: number;
        midtermWeight: number;
        finalWeight: number;
        homeworkWeight: number;
        attitudeWeight: number;
      }
): {
  totalScore: number | null;
  isEstimated: boolean;
  missingItems: string[];
  availableWeight: number;
} {
  const w = weights || DEFAULT_GRADE_WEIGHTS;
  const items: Array<{ score: number | null | undefined; weight: number; label: string }> = [
    { score: scores.attendanceScore, weight: Number(w.attendanceWeight ?? 20), label: '缺出席成績' },
    { score: scores.quizScore, weight: Number(w.quizWeight ?? 15), label: '缺平時考' },
    { score: scores.midtermScore, weight: Number(w.midtermWeight ?? 20), label: '缺期中考' },
    { score: scores.finalScore, weight: Number(w.finalWeight ?? 20), label: '缺期末考' },
    { score: scores.homeworkScore, weight: Number(w.homeworkWeight ?? 15), label: '缺作業' },
    { score: scores.attitudeScore, weight: Number(w.attitudeWeight ?? 10), label: '缺學習態度' },
  ];

  let availableWeight = 0;
  let availableWeightedSum = 0;
  const missingItems: string[] = [];

  for (const item of items) {
    if (item.weight <= 0) continue;
    if (item.score !== null && item.score !== undefined && !Number.isNaN(Number(item.score))) {
      availableWeight += item.weight;
      availableWeightedSum += Number(item.score) * item.weight;
    } else {
      missingItems.push(item.label);
    }
  }

  if (availableWeight <= 0) {
    return {
      totalScore: null,
      isEstimated: false,
      missingItems,
      availableWeight: 0,
    };
  }

  const totalScore = Math.round((availableWeightedSum / availableWeight) * 100) / 100;
  return {
    totalScore,
    isEstimated: missingItems.length > 0,
    missingItems,
    availableWeight,
  };
}

/**
 * Unified getter for student's effective grade:
 * Guarantees that ADMIN, TEACHER, reports, detail modal, and CSV exports
 * evaluate the exact same 6 categories, dynamic attendance, missing-item indicators, and total score.
 * Never invents fake 100 attendance or fake 85/80/85/90/90 exam defaults for missing data.
 */
export function getStudentEffectiveGrade(
  student: Student,
  allGrades?: Record<string, StudentGrade>,
  allCourses?: CourseSession[],
  transferRecords?: TransferClassRecord[],
  customWeightsMap?: Record<string, StudentGradeWeight>,
  termId?: string,
  targetClassId?: string
): StudentGrade {
  const classIdToUse = targetClassId || student.classId;
  const existing = allGrades
    ? (
        (classIdToUse ? allGrades[`${student.id}_${classIdToUse}`] : undefined) ||
        (student.classId ? allGrades[`${student.id}_${student.classId}`] : undefined) ||
        allGrades[student.id]
      )
    : undefined;

  // Prioritize student_id + term_id compound key; only fallback to direct student_id if termId matches or is absent
  const candidate = customWeightsMap
    ? (termId ? customWeightsMap[`${student.id}_${termId}`] : undefined) ||
      (customWeightsMap[student.id] &&
      (!termId || !customWeightsMap[student.id].termId || customWeightsMap[student.id].termId === termId)
        ? customWeightsMap[student.id]
        : undefined)
    : undefined;

  const isCustom =
    candidate &&
    !(
      Number(candidate.attendanceWeight) === 20 &&
      Number(candidate.quizWeight) === 15 &&
      Number(candidate.midtermWeight) === 20 &&
      Number(candidate.finalWeight) === 20 &&
      Number(candidate.homeworkWeight) === 15 &&
      Number(candidate.attitudeWeight) === 10
    );
  const customWeight = isCustom ? candidate : undefined;

  const hasSavedGrade = Boolean(existing && existing.hasSavedGrade !== false);

  const quizScore =
    existing?.quizScore !== null && existing?.quizScore !== undefined
      ? Number(existing.quizScore)
      : null;
  const midtermScore =
    existing?.midtermScore !== null && existing?.midtermScore !== undefined
      ? Number(existing.midtermScore)
      : null;
  const finalScore =
    existing?.finalScore !== null && existing?.finalScore !== undefined
      ? Number(existing.finalScore)
      : null;
  const homeworkScore =
    existing?.homeworkScore !== null && existing?.homeworkScore !== undefined
      ? Number(existing.homeworkScore)
      : null;
  const attitudeScore =
    existing?.attitudeScore !== null && existing?.attitudeScore !== undefined
      ? Number(existing.attitudeScore)
      : null;

  let attendanceScore: number | null = null;
  let hasAttendanceData = false;

  if (allCourses !== undefined) {
    const scopeOptions: AttendanceHistoryOptions | undefined = targetClassId
      ? { classId: targetClassId, termId }
      : termId
      ? { termId }
      : undefined;
    const attResult = calculateStudentAttendanceScore(
      student.id,
      allCourses,
      student.className,
      student,
      transferRecords,
      scopeOptions
    );
    attendanceScore = attResult.attendanceScore;
    hasAttendanceData = attResult.hasRecords;
  } else if (student.attendanceEvaluated && student.overallAttendanceRate !== null && student.overallAttendanceRate !== undefined) {
    attendanceScore = student.overallAttendanceRate;
    hasAttendanceData = true;
  } else if (existing?.hasAttendanceData && existing?.attendanceScore !== null && existing?.attendanceScore !== undefined) {
    attendanceScore = existing.attendanceScore;
    hasAttendanceData = true;
  }

  const provisional = calculateProvisionalTotalGrade(
    {
      attendanceScore,
      quizScore,
      midtermScore,
      finalScore,
      homeworkScore,
      attitudeScore,
    },
    customWeight || candidate
  );

  return {
    studentId: student.id,
    studentName: student.name,
    className: student.className || '',
    classId: classIdToUse || student.classId,
    attendanceScore,
    quizScore,
    midtermScore,
    finalScore,
    homeworkScore,
    attitudeScore,
    totalScore: provisional.totalScore,
    isPassed:
      provisional.totalScore !== null && !provisional.isEstimated
        ? provisional.totalScore >= 60.0
        : undefined,
    hasAttendanceData,
    hasSavedGrade,
    isEstimated: provisional.isEstimated,
    missingItems: provisional.missingItems,
    updatedAt: existing?.updatedAt,
  };
}

// Calculate comprehensive final grade: 40% Listening/Speaking + 40% Reading/Writing + 20% Performance (50% attendance + 50% daily)
export function calculatePerformanceScore(dailyPerformance: number, attendanceRate: number): number {
  return dailyPerformance * 0.5 + attendanceRate * 0.5;
}

export function calculateFinalGrade(
  listeningSpeaking: number,
  readingWriting: number,
  dailyPerformance: number,
  attendanceRate: number
): number {
  const performance = calculatePerformanceScore(dailyPerformance, attendanceRate);
  const total = listeningSpeaking * 0.4 + readingWriting * 0.4 + performance * 0.2;
  return Math.round(total * 10) / 10;
}

// Safely retrieve or calculate student component scores
export function getStudentScores(student?: Student | null): {
  listeningSpeaking: number;
  readingWriting: number;
  dailyPerformance: number;
} {
  if (!student) {
    return { listeningSpeaking: 85, readingWriting: 82, dailyPerformance: 88 };
  }
  if ((student as any).grades?.listeningSpeaking !== undefined) {
    return (student as any).grades;
  }
  const seed = (student.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = Math.min(96, Math.max(68, 82 + (seed % 14) - 5));
  const listening = Math.min(99, Math.max(60, base + (seed % 7) - 3));
  const reading = Math.min(99, Math.max(60, base + ((seed * 3) % 9) - 4));
  const daily = Math.min(100, Math.max(65, Math.round((student.overallAttendanceRate ?? 90) * 0.85 + 12)));

  return {
    listeningSpeaking: listening,
    readingWriting: reading,
    dailyPerformance: daily,
  };
}
