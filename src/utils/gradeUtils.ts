import { Student, StudentGrade, CourseSession } from '../types';

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
 *
 * Sessions without recorded attendance (尚未點名) do NOT count as 100% attendance.
 * If totalPeriods is 0, attendanceScore is 0 (hasRecords: false).
 */
export function calculateStudentAttendanceScore(
  studentId: string,
  courses: CourseSession[],
  studentClassName?: string
): StudentAttendanceCalculationResult {
  let totalPeriods = 0;
  let presentPeriods = 0;
  let leavePeriods = 0;
  let absentPeriods = 0;
  let sessionCount = 0;

  for (const c of courses) {
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
      attendanceScore: 0,
      weightedScore: 0,
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

// Calculate total score using exact percentage formula
export function calculateTotalGrade(
  attendanceScore: number,
  quizScore: number,
  midtermScore: number,
  finalScore: number,
  homeworkScore: number,
  attitudeScore: number
): number {
  const total =
    attendanceScore * GRADE_WEIGHTS.attendance +
    quizScore * GRADE_WEIGHTS.quiz +
    midtermScore * GRADE_WEIGHTS.midterm +
    finalScore * GRADE_WEIGHTS.final +
    homeworkScore * GRADE_WEIGHTS.homework +
    attitudeScore * GRADE_WEIGHTS.attitude;

  return Math.round(total * 100) / 100;
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

// Convert numeric total score to letter grade
export function getLetterGrade(score: number): { letter: string; color: string; label: string } {
  if (score >= 90) return { letter: 'A+', color: 'text-emerald-700 bg-emerald-50 border-emerald-300', label: '極優異' };
  if (score >= 85) return { letter: 'A', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: '優異' };
  if (score >= 80) return { letter: 'B+', color: 'text-teal-700 bg-teal-50 border-teal-200', label: '良好' };
  if (score >= 75) return { letter: 'B', color: 'text-blue-700 bg-blue-50 border-blue-200', label: '尚可' };
  if (score >= 70) return { letter: 'C+', color: 'text-amber-700 bg-amber-50 border-amber-200', label: '及格' };
  if (score >= 60) return { letter: 'C', color: 'text-orange-700 bg-orange-50 border-orange-200', label: '勉強及格' };
  return { letter: 'F', color: 'text-rose-700 bg-rose-50 border-rose-300', label: '不及格' };
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
      className: student.className || '未設定班級',
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
