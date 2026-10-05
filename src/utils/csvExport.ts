import { Student } from '../types';
import { calculateFinalGrade, getStudentScores } from './gradeUtils';

/**
 * Universal CSV export utility with UTF-8 BOM for Microsoft Excel compatibility
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const sanitizeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell);
    // Escape double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headerRow = headers.map(sanitizeCell).join(',');
  const dataRows = rows.map((row) => row.map(sanitizeCell).join(',')).join('\r\n');
  const csvContent = '\uFEFF' + headerRow + '\r\n' + dataRows;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export selected or all students (Universal student roster export)
 */
export function exportStudentsToCsv(students: Student[], filename = '學生名冊') {
  const headers = [
    '學號',
    '姓名',
    '英文姓名',
    '性別',
    '國籍',
    '所屬班級',
    '學籍狀態',
    '護照號碼',
    '電子郵件',
    '聯絡電話',
    '總出席率 (%)',
  ];

  const rows = students.map((s) => [
    s.studentNumber,
    s.name,
    s.englishName,
    s.gender === 'M' ? '男' : s.gender === 'F' ? '女' : s.gender,
    s.nationality,
    s.className || '尚未分班',
    s.enrollmentStatus === 'active'
      ? '在學中'
      : s.enrollmentStatus === 'graduated'
      ? '已結業'
      : s.enrollmentStatus === 'suspended'
      ? '休學中'
      : s.enrollmentStatus === 'withdrawn'
      ? '已退學'
      : (s.enrollmentStatus || '在學中'),
    s.passportNumber || '',
    s.email || '',
    s.phone || '',
    s.overallAttendanceRate ?? 100,
  ]);

  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}

/**
 * Export class student attendance statistics report
 */
export function exportClassStudentAttendanceToCsv(
  className: string,
  records: {
    studentNumber: string;
    name: string;
    englishName?: string;
    nationality: string;
    totalHours: number;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    attendanceRate: number;
    warningStatus: string;
  }[],
  filename?: string
) {
  const headers = [
    '所屬班級',
    '學號',
    '中文姓名',
    '英文姓名',
    '國籍',
    '應到總時數',
    '實到時數',
    '請假時數',
    '缺席時數',
    '出席率 (%)',
    '出席警示狀態',
  ];

  const rows = records.map((r) => [
    className,
    r.studentNumber,
    r.name,
    r.englishName || '',
    r.nationality,
    r.totalHours,
    r.presentHours,
    r.leaveHours,
    r.absentHours,
    r.attendanceRate,
    r.warningStatus,
  ]);

  const timestamp = new Date().toISOString().slice(0, 10);
  const outName = filename || `${className}_學生出席統計`;
  exportToCsv(`${outName}_${timestamp}`, headers, rows);
}

/**
 * Export attendance history and summary
 */
export function exportAttendanceSummaryToCsv(
  records: {
    date: string;
    timeSlot: string;
    courseName: string;
    className: string;
    classroom: string;
    textbook: string;
    studentCount: number;
    attendanceRate?: number;
    presentHours?: number;
    totalHours?: number;
    statusText: string;
  }[],
  filename = '點名歷史紀錄總表'
) {
  const headers = [
    '上課日期',
    '上課時段',
    '課程名稱',
    '班級名稱',
    '教室',
    '教材進度',
    '學生人數',
    '班級出席率 (%)',
    '實到總時數',
    '應到總時數',
    '點名狀態',
  ];

  const rows = records.map((r) => [
    r.date,
    r.timeSlot,
    r.courseName,
    r.className,
    r.classroom,
    r.textbook,
    r.studentCount,
    r.attendanceRate !== undefined ? `${r.attendanceRate}%` : '尚未結算',
    r.presentHours ?? '-',
    r.totalHours ?? '-',
    r.statusText,
  ]);

  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}

/**
 * Export grades report
 */
export function exportGradesToCsv(students: Student[], filename = '期末成績冊') {
  const headers = [
    '學號',
    '姓名',
    '英文姓名',
    '所屬班級',
    '國籍',
    '聽說成績 (40%)',
    '讀寫成績 (40%)',
    '平時考核 (20%)',
    '總出席率 (%)',
    '期末總成績',
    '評定等第',
    '是否及格',
  ];

  const rows = students.map((s) => {
    const scores = getStudentScores(s);
    const attendanceRate = s.overallAttendanceRate ?? 100;
    const totalHours = (s.totalPresentHours || 0) + (s.totalLeaveHours || 0) + (s.totalAbsenceHours || 0);
    const attendanceGradeScore = totalHours > 0
      ? Math.round(((s.totalPresentHours || 0) + (s.totalLeaveHours || 0) * 0.5) / totalHours * 1000) / 10
      : (s.overallAttendanceRate ?? 100);
    const finalScore = calculateFinalGrade(
      scores.listeningSpeaking,
      scores.readingWriting,
      scores.dailyPerformance,
      attendanceGradeScore
    );

    let gradeLetter = 'F';
    if (finalScore >= 90) gradeLetter = 'A+';
    else if (finalScore >= 85) gradeLetter = 'A';
    else if (finalScore >= 80) gradeLetter = 'A-';
    else if (finalScore >= 77) gradeLetter = 'B+';
    else if (finalScore >= 73) gradeLetter = 'B';
    else if (finalScore >= 70) gradeLetter = 'B-';
    else if (finalScore >= 60) gradeLetter = 'C';

    const isPass = finalScore >= 60 ? '及格' : '不及格';

    return [
      s.studentNumber,
      s.name,
      s.englishName,
      s.className || '未分班',
      s.nationality,
      scores.listeningSpeaking,
      scores.readingWriting,
      scores.dailyPerformance,
      attendanceRate,
      finalScore,
      gradeLetter,
      isPass,
    ];
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}

/**
 * Export a single student's cross-class detailed attendance records to CSV
 */
export function exportIndividualStudentAttendanceToCsv(
  student: Student,
  dailyRecords: Array<{
    date: string;
    courseName: string;
    className: string;
    periodsCount: number;
    period1: string;
    period2: string;
    period3?: string;
    period4?: string;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    statusSummary: string;
    remarks?: string;
    isDefaultPresent?: boolean;
  }>
) {
  const headers = [
    '學號',
    '學生姓名',
    '目前班級',
    '上課日期',
    '當時上課班級',
    '課程名稱',
    '第1節',
    '第2節',
    '第3節',
    '第4節',
    '實到時數',
    '請假時數',
    '曠課時數',
    '出席狀態摘要',
    '請假/備註說明',
  ];

  const mapStatusText = (s?: string) =>
    s === 'present' ? '出席' : s === 'leave' ? '請假' : s === 'absent' ? '缺席' : '-';

  const rows = dailyRecords.map((r) => [
    student.studentNumber,
    student.name,
    student.className || '未分班',
    r.date,
    r.className,
    r.courseName,
    mapStatusText(r.period1),
    mapStatusText(r.period2),
    r.periodsCount >= 3 ? mapStatusText(r.period3) : '-',
    r.periodsCount >= 4 ? mapStatusText(r.period4) : '-',
    r.presentHours,
    r.leaveHours,
    r.absentHours,
    r.statusSummary,
    r.isDefaultPresent && !r.remarks ? '系統預設到課（未點名）' : (r.remarks || ''),
  ]);

  // Append summary row
  if (dailyRecords.length > 0) {
    const totalPresent = dailyRecords.reduce((acc, r) => acc + r.presentHours, 0);
    const totalLeave = dailyRecords.reduce((acc, r) => acc + r.leaveHours, 0);
    const totalAbsent = dailyRecords.reduce((acc, r) => acc + r.absentHours, 0);
    const totalCompleted = totalPresent + totalLeave + totalAbsent;
    const actualRate = totalCompleted > 0 ? (Math.round((totalPresent / totalCompleted) * 1000) / 10).toFixed(1) + '%' : '100%';
    const attendanceScore = totalCompleted > 0 ? (Math.round(((totalPresent + totalLeave * 0.5) / totalCompleted) * 1000) / 10).toFixed(1) + '分' : '100分';

    rows.push([
      '【全季總計】',
      student.name,
      student.className || '',
      `共 ${dailyRecords.length} 堂課`,
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      totalPresent,
      totalLeave,
      totalAbsent,
      `實際出席率: ${actualRate}`,
      `出席成績(請假折半): ${attendanceScore}`,
    ]);
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${student.studentNumber}_${student.name}_個人跨班出缺席明細總表_${timestamp}`, headers, rows);
}
