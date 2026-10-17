import { Student, StudentGrade, CourseSession, TransferClassRecord, StudentGradeWeight } from '../types';
import { calculateStudentAttendanceHistory, isSessionCancelledOrSuspended } from './attendanceUtils';

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
  attendanceScore: number; // 0 ~ 100 percentage
  weightedScore: number;   // attendanceScore * 0.20 (0 ~ 20)
  totalSessions: number;   // count of sessions with attendance recorded
  totalPeriods: number;    // total periods counted
  presentPeriods: number;  // periods marked present
  leavePeriods: number;    // periods marked leave
  absentPeriods: number;   // periods marked absent
  hasRecords: boolean;     // true if student has at least one recorded period
}

/**
 * Calculates student attendance score based on official CLC weighting:
 * - Present (出席) = 100% (weight 1.0)
 * - Leave (請假) = 50% (weight 0.5)
 * - Absent (缺席 / 曠課) = 0% (weight 0.0)
 *
 * Formula:
 * (present * 1.0 + leave * 0.5 + absent * 0.0) / totalPeriods * 100
 * Weighted Attendance Grade = Attendance Rate * 20%
 */
export function calculateStudentAttendanceScore(
  studentId: string,
  courses: CourseSession[],
  studentClassName?: string,
  student?: Student,
  transferRecords?: TransferClassRecord[]
): StudentAttendanceCalculationResult {
  if (student) {
    const history = calculateStudentAttendanceHistory(student, courses, transferRecords);
    const totalPeriods = history.completedHours;
    const earnedPoints = history.presentHours * 1.0 + history.leaveHours * 0.5;
    const attendanceScore = totalPeriods > 0 ? Math.round((earnedPoints / totalPeriods) * 1000) / 10 : 100;
    const weightedScore = Math.round(attendanceScore * GRADE_WEIGHTS.attendance * 10) / 10;
    return {
      attendanceScore,
      weightedScore,
      totalSessions: history.dailyRecords.filter((r) => !r.isCancelled).length,
      totalPeriods,
      presentPeriods: history.presentHours,
      leavePeriods: history.leaveHours,
      absentPeriods: history.absentHours,
      hasRecords: history.completedHours > 0,
    };
  }

  let totalPeriods = 0;
  let presentPeriods = 0;
  let leavePeriods = 0;
  let absentPeriods = 0;
  let sessionCount = 0;

  for (const c of courses) {
    if (!c || isSessionCancelledOrSuspended(c)) {
      continue;
    }

    if (studentClassName && c.className && c.className !== studentClassName && c.classId !== studentClassName) {
      continue;
    }

    if (!c.attendanceData || !c.attendanceData[studentId]) {
      continue;
    }

    const att = c.attendanceData[studentId];
    const periodsCount = c.periodsCount || 3;
    const periods: (string | undefined)[] = [att.period1, att.period2];
    if (periodsCount >= 3) periods.push(att.period3);
    if (periodsCount >= 4) periods.push(att.period4);

    let hasAnyMarked = false;
    for (const p of periods) {
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
      attendanceScore: 100,
      weightedScore: 20,
      totalSessions: 0,
      totalPeriods: 0,
      presentPeriods: 0,
      leavePeriods: 0,
      absentPeriods: 0,
      hasRecords: false,
    };
  }

  const earnedPoints = presentPeriods * 1.0 + leavePeriods * 0.5 + absentPeriods * 0.0;
  const attendanceRate = Math.round((earnedPoints / totalPeriods) * 1000) / 10;
  const weightedScore = Math.round(attendanceRate * GRADE_WEIGHTS.attendance * 10) / 10;

  return {
    attendanceScore: attendanceRate,
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
  weights?: StudentGradeWeight | { attendanceWeight: number; quizWeight: number; midtermWeight: number; finalWeight: number; homeworkWeight: number; attitudeWeight: number }
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
     attitudeScore * wAttid) / 100.0;

  return Math.round(total * 100) / 100;
}

/**
 * Unified getter for student's effective grade:
 * Guarantees that ADMIN, TEACHER, reports, detail modal, and CSV exports
 * all evaluate the exact same 6 categories, dynamic attendance, and total score.
 * If student has customized weights in customWeightsMap, applies them; otherwise uses default 20/15/20/20/15/10.
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
    ? ((termId ? customWeightsMap[`${student.id}_${termId}`] : undefined) || (
        customWeightsMap[student.id] && (!termId || !customWeightsMap[student.id].termId || customWeightsMap[student.id].termId === termId)
          ? customWeightsMap[student.id]
          : undefined
      ))
    : undefined;

  const isCustom = candidate && !(
    Number(candidate.attendanceWeight) === 20 &&
    Number(candidate.quizWeight) === 15 &&
    Number(candidate.midtermWeight) === 20 &&
    Number(candidate.finalWeight) === 20 &&
    Number(candidate.homeworkWeight) === 15 &&
    Number(candidate.attitudeWeight) === 10
  );
  const customWeight = isCustom ? candidate : undefined;

  const quizScore = existing?.quizScore ?? 85;
  const midtermScore = existing?.midtermScore ?? 80;
  const finalScore = existing?.finalScore ?? 85;
  const homeworkScore = existing?.homeworkScore ?? 90;
  const attitudeScore = existing?.attitudeScore ?? 90;

  let attendanceScore = 100;
  if (allCourses && allCourses.length > 0) {
    const attResult = calculateStudentAttendanceScore(
      student.id,
      allCourses,
      student.className,
      student,
      transferRecords
    );
    attendanceScore = attResult.attendanceScore;
  } else if (existing?.attendanceScore !== undefined) {
    attendanceScore = existing.attendanceScore;
  } else if (student.overallAttendanceRate !== undefined) {
    attendanceScore = student.overallAttendanceRate;
  }

  const calculatedTotal = calculateTotalGrade(
    attendanceScore,
    quizScore,
    midtermScore,
    finalScore,
    homeworkScore,
    attitudeScore,
    customWeight
  );

  const totalScore = calculatedTotal;

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
    totalScore,
    isPassed: totalScore >= 60.00,
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
  // Deterministic score based on student id and attendance
  const seed = (student.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = Math.min(96, Math.max(68, 82 + (seed % 14) - 5));
  const listening = Math.min(99, Math.max(60, base + (seed % 7) - 3));
  const reading = Math.min(99, Math.max(60, base + ((seed * 3) % 9) - 4));
  const daily = Math.min(100, Math.max(65, Math.round((student.overallAttendanceRate || 90) * 0.85 + 12)));

  return {
    listeningSpeaking: listening,
    readingWriting: reading,
    dailyPerformance: daily,
  };
}

// Generate initial mock grades for a student list
export function generateInitialGradesForStudents(students: Student[], className: string): Record<string, StudentGrade> {
  const grades: Record<string, StudentGrade> = {};

  students.forEach((student, idx) => {
    // Attendance score derived directly from student's attendance rate (capped at 100)
    const attendanceScore = Math.min(100, Math.round(student.overallAttendanceRate * 10) / 10);

    // Realistic initial test scores based on student profile
    const seed = (idx * 13 + 7) % 20;
    const baseQuiz = Math.min(100, Math.max(65, 85 + seed - 10));
    const baseMidterm = Math.min(100, Math.max(60, 82 + seed - 8));
    const baseFinal = Math.min(100, Math.max(65, 88 + seed - 9));
    const baseHomework = Math.min(100, Math.max(70, 90 + seed - 7));
    const baseAttitude = Math.min(100, Math.max(75, 92 + (idx % 8)));

    // Specific student adjustments
    let quizScore = baseQuiz;
    let midtermScore = baseMidterm;
    let finalScore = baseFinal;
    let homeworkScore = baseHomework;
    let attitudeScore = baseAttitude;

    if (student.name === '林小明') {
      quizScore = 85;
      midtermScore = 78;
      finalScore = 90;
      homeworkScore = 88;
      attitudeScore = 95;
    } else if (student.name === '王小美') {
      quizScore = 92;
      midtermScore = 88;
      finalScore = 91;
      homeworkScore = 95;
      attitudeScore = 90;
    } else if (student.name === '陳大華') {
      quizScore = 76;
      midtermScore = 70;
      finalScore = 78;
      homeworkScore = 80;
      attitudeScore = 82;
    }

    const totalScore = calculateTotalGrade(
      attendanceScore,
      quizScore,
      midtermScore,
      finalScore,
      homeworkScore,
      attitudeScore
    );

    grades[student.id] = {
      studentId: student.id,
      studentName: student.name,
      className,
      attendanceScore,
      quizScore,
      midtermScore,
      finalScore,
      homeworkScore,
      attitudeScore,
      totalScore,
      updatedAt: '2026-08-10 17:00',
    };
  });

  return grades;
}

// Generate all initial grades
export function generateAllInitialGrades(students: Student[] = []): Record<string, StudentGrade> {
  if (!students || students.length === 0) return {};
  const grades: Record<string, StudentGrade> = {};
  students.forEach((student) => {
    const attendanceScore = student.overallAttendanceRate || 100;
    const quizScore = 85;
    const midtermScore = 80;
    const finalScore = 85;
    const homeworkScore = 90;
    const attitudeScore = 90;

    const totalScore = calculateTotalGrade(
      attendanceScore,
      quizScore,
      midtermScore,
      finalScore,
      homeworkScore,
      attitudeScore
    );

    grades[student.id] = {
      studentId: student.id,
      studentName: student.name,
      className: student.className || '',
      attendanceScore,
      quizScore,
      midtermScore,
      finalScore,
      homeworkScore,
      attitudeScore,
      totalScore,
      updatedAt: '2026-08-10 17:00',
    };
  });
  return grades;
}
