import { Student, StudentGrade, CourseSession, TransferClassRecord, StudentGradeWeight } from '../types';
import { getStudentEffectiveGrade } from './gradeUtils';
import {
  ClassReportRow,
  StudentReportRow,
  formatAttendanceRate,
  formatAttendanceScore,
  formatTotalGradeDisplay,
} from './reportUtils';

/**
 * Builds RFC-4180 CSV content with UTF-8 BOM for Microsoft Excel compatibility.
 */
export function buildCsvContent(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const sanitizeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headerRow = headers.map(sanitizeCell).join(',');
  const dataRows = rows.map((row) => row.map(sanitizeCell).join(',')).join('\r\n');
  return '\uFEFF' + headerRow + '\r\n' + dataRows;
}

/**
 * Universal CSV export utility with UTF-8 BOM for Microsoft Excel compatibility
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const csvContent = buildCsvContent(headers, rows);

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
    s.overallAttendanceRate !== null && s.overallAttendanceRate !== undefined
      ? s.overallAttendanceRate
      : '—',
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
    attendanceRate: number | null;
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
    r.attendanceRate !== null && r.attendanceRate !== undefined ? r.attendanceRate : '—',
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
    attendanceRate?: number | null;
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
    r.attendanceRate !== undefined && r.attendanceRate !== null ? `${r.attendanceRate}%` : '尚未結算',
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
export function exportGradesToCsv(
  students: Student[],
  filename: string = '期末成績冊',
  allGrades?: Record<string, StudentGrade>,
  allCourses?: CourseSession[],
  transferRecords?: TransferClassRecord[],
  gradeWeightsMap?: Record<string, StudentGradeWeight>,
  termId?: string,
  targetClassId?: string
) {
  const headers = [
    '學號',
    '姓名',
    '英文姓名',
    '所屬班級',
    '國籍',
    '權重設定',
    '出席成績',
    '平時測驗',
    '期中考試',
    '期末考試',
    '作業習作',
    '學習態度',
    '學期總成績',
    '是否及格',
    '缺項說明',
  ];

  const rows = students.map((s) => {
    const customWeight = gradeWeightsMap
      ? ((termId ? gradeWeightsMap[`${s.id}_${termId}`] : undefined) || gradeWeightsMap[s.id])
      : undefined;
    const grade = getStudentEffectiveGrade(
      s,
      allGrades,
      allCourses,
      transferRecords,
      gradeWeightsMap,
      termId,
      targetClassId
    );
    const isCustom = customWeight && !(
      Number(customWeight.attendanceWeight) === 20 &&
      Number(customWeight.quizWeight) === 15 &&
      Number(customWeight.midtermWeight) === 20 &&
      Number(customWeight.finalWeight) === 20 &&
      Number(customWeight.homeworkWeight) === 15 &&
      Number(customWeight.attitudeWeight) === 10
    );
    const weightDesc = isCustom
      ? `個別自訂 (${customWeight!.attendanceWeight}/${customWeight!.quizWeight}/${customWeight!.midtermWeight}/${customWeight!.finalWeight}/${customWeight!.homeworkWeight}/${customWeight!.attitudeWeight}%)`
      : '';
    const isPass =
      grade.totalScore === null || grade.isEstimated
        ? '待計算'
        : grade.totalScore >= 60
        ? '及格'
        : '不及格';

    return [
      s.studentNumber,
      s.name,
      s.englishName,
      s.className || '未分班',
      s.nationality,
      weightDesc,
      grade.attendanceScore !== null && grade.attendanceScore !== undefined ? grade.attendanceScore : '尚未計算',
      grade.quizScore !== null && grade.quizScore !== undefined ? grade.quizScore : '未輸入',
      grade.midtermScore !== null && grade.midtermScore !== undefined ? grade.midtermScore : '未輸入',
      grade.finalScore !== null && grade.finalScore !== undefined ? grade.finalScore : '未輸入',
      grade.homeworkScore !== null && grade.homeworkScore !== undefined ? grade.homeworkScore : '未輸入',
      grade.attitudeScore !== null && grade.attitudeScore !== undefined ? grade.attitudeScore : '未輸入',
      formatTotalGradeDisplay(grade),
      isPass,
      grade.missingItems && grade.missingItems.length > 0 ? grade.missingItems.join('、') : '',
    ];
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}

/**
 * Builds CSV rows for a single student's cross-class detailed attendance records.
 */
export function buildIndividualStudentAttendanceCsvData(
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
    isCancelled?: boolean;
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

  const mapStatusText = (s?: string, isCancelled?: boolean) =>
    isCancelled
      ? '停課'
      : s === 'present'
      ? '出席'
      : s === 'leave'
      ? '請假'
      : s === 'absent'
      ? '缺席'
      : '-';

  const rows: (string | number | null | undefined)[][] = dailyRecords.map((r) => [
    student.studentNumber,
    student.name,
    student.className || '未分班',
    r.date,
    r.className,
    r.courseName,
    mapStatusText(r.period1, r.isCancelled),
    mapStatusText(r.period2, r.isCancelled),
    r.periodsCount >= 3 ? mapStatusText(r.period3, r.isCancelled) : '-',
    r.periodsCount >= 4 ? mapStatusText(r.period4, r.isCancelled) : '-',
    r.presentHours,
    r.leaveHours,
    r.absentHours,
    r.statusSummary,
    r.remarks || '',
  ]);

  const activeRecords = dailyRecords.filter((r) => !r.isCancelled);
  const totalPresent = activeRecords.reduce((acc, r) => acc + r.presentHours, 0);
  const totalLeave = activeRecords.reduce((acc, r) => acc + r.leaveHours, 0);
  const totalAbsent = activeRecords.reduce((acc, r) => acc + r.absentHours, 0);
  const totalCompleted = totalPresent + totalLeave + totalAbsent;
  const actualRate =
    totalCompleted > 0 ? (Math.round((totalPresent / totalCompleted) * 1000) / 10).toFixed(1) + '%' : '—';
  const attendanceScore =
    totalCompleted > 0
      ? (Math.round(((totalPresent + totalLeave * 0.5) / totalCompleted) * 1000) / 10).toFixed(1) + '分'
      : '尚未計算';

  rows.push([
    '【全季總計】',
    student.name,
    student.className || '',
    `共 ${activeRecords.length} 堂有效點名課`,
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

  return { headers, rows };
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
    isCancelled?: boolean;
  }>
) {
  const { headers, rows } = buildIndividualStudentAttendanceCsvData(student, dailyRecords);
  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${student.studentNumber}_${student.name}_個人跨班出缺席明細總表_${timestamp}`, headers, rows);
}

/**
 * Builds Admin Reports class summary CSV data strictly matching AdminReportsView.
 */
export function buildAdminReportsClassCsvData(classRows: ClassReportRow[]) {
  const headers = [
    '班級名稱',
    '學期',
    '授課教師',
    '目前在班人數',
    '期間曾在班人數',
    '已納入出席評估人數',
    '出席評估樣本 (已納入／期間曾在班)',
    '平均出席率',
    '已排定時數 (H)',
    '已授課時數 (H)',
    '學期目標時數 (H)',
    '待點名堂數',
    '授課進度狀態',
    '簽證合規狀態',
  ];

  const rows = classRows.map((row) => [
    row.cls.name,
    row.termName,
    row.teacherName,
    row.currentStudentCount,
    row.periodStudentCount,
    row.evaluatedStudentCount,
    `已納入 ${row.evaluatedStudentCount}／${row.periodStudentCount} 人`,
    formatAttendanceRate(row.averageAttendanceRate, row.evaluatedStudentCount > 0),
    row.progress.scheduledHours,
    row.progress.deliveredHours,
    row.progress.targetHours > 0 ? row.progress.targetHours : '未設定',
    row.progress.pendingAttendanceCount,
    row.progress.progressLabel,
    row.complianceLabel,
  ]);

  return { headers, rows };
}

export function exportAdminReportsClassSummaryToCsv(
  classRows: ClassReportRow[],
  filename = '全校各班級授課進度與出席統計'
) {
  const { headers, rows } = buildAdminReportsClassCsvData(classRows);
  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}

/**
 * Builds Admin Reports student detail CSV data strictly matching StudentDetailModal & AdminReportsView.
 */
export function buildAdminReportsStudentCsvData(studentRows: StudentReportRow[]) {
  const headers = [
    '學號',
    '姓名',
    '英文姓名',
    '班級',
    '期間在班狀態',
    '應到時數 (H)',
    '出席時數 (H)',
    '請假時數 (H)',
    '缺席時數 (H)',
    '實際出席率',
    '出席成績評分',
    '簽證合規狀態',
    '學期總成績',
    '缺項說明',
  ];

  const rows = studentRows.map((row) => [
    row.student.studentNumber,
    row.student.name,
    row.student.englishName,
    row.scopedClassName,
    row.enrollmentScopeLabel,
    row.expectedHours,
    row.presentHours,
    row.leaveHours,
    row.absentHours,
    formatAttendanceRate(row.attendanceRate, row.hasAttendanceData),
    formatAttendanceScore(row.attendanceScore, row.hasAttendanceData),
    row.complianceLabel,
    formatTotalGradeDisplay(row.effectiveGrade),
    row.effectiveGrade.missingItems?.join('、') || '',
  ]);

  return { headers, rows };
}

export function exportAdminReportsStudentDetailToCsv(
  studentRows: StudentReportRow[],
  filename = '全校學員出缺勤與成績明細'
) {
  const { headers, rows } = buildAdminReportsStudentCsvData(studentRows);
  const timestamp = new Date().toISOString().slice(0, 10);
  exportToCsv(`${filename}_${timestamp}`, headers, rows);
}
