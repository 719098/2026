import { Student, StudentGrade } from '../types';
import { 
  STUDENTS_LEVEL1, 
  STUDENTS_LEVEL2, 
  STUDENTS_LEVEL3, 
  STUDENTS_CHEN_CONVERSATION, 
  STUDENTS_CHEN_BUSINESS, 
  STUDENTS_CHEN_CULTURE 
} from '../data/mockData';

export const GRADE_WEIGHTS = {
  attendance: 0.20, // 20% 出席
  quiz: 0.15,       // 15% 平時考
  midterm: 0.20,    // 20% 期中考
  final: 0.20,      // 20% 期末考
  homework: 0.15,   // 15% 作業
  attitude: 0.10,   // 10% 學習態度
};

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
export function generateAllInitialGrades(): Record<string, StudentGrade> {
  return {
    ...generateInitialGradesForStudents(STUDENTS_LEVEL1, '初級華語一'),
    ...generateInitialGradesForStudents(STUDENTS_LEVEL2, '中級華語二'),
    ...generateInitialGradesForStudents(STUDENTS_LEVEL3, '高級華語三'),
    ...generateInitialGradesForStudents(STUDENTS_CHEN_CONVERSATION, '生活會話一班'),
    ...generateInitialGradesForStudents(STUDENTS_CHEN_BUSINESS, '商務華語實務'),
    ...generateInitialGradesForStudents(STUDENTS_CHEN_CULTURE, '台灣文化與影視欣賞'),
  };
}
