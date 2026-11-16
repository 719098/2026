import * as XLSX from 'xlsx';
import { DailyAttendanceRecord, Student } from '../types';
import {
  ClassReportRow,
  SchoolReportSummary,
  StudentReportRow,
  formatAttendanceRate,
  formatAttendanceScore,
  formatTotalGradeDisplay,
} from './reportUtils';

export interface StudentAttendanceExportParams {
  student: Student;
  records: DailyAttendanceRecord[];
  filterSummary: {
    startDate?: string;
    endDate?: string;
    termLabel?: string;
    classLabel?: string;
    statusLabel?: string;
  };
  summaryStats: {
    expectedHours: number;
    presentHours: number;
    leaveHours: number;
    absentHours: number;
    attendanceRate: number | null;
    attendanceScore?: number | null;
    complianceLabel?: string;
  };
}

export interface AdminReportsExportParams {
  classRows: ClassReportRow[];
  studentRows: StudentReportRow[];
  schoolSummary: SchoolReportSummary;
  filterSummary?: {
    termLabel?: string;
    classLabel?: string;
    startDate?: string;
    endDate?: string;
  };
}

const mapPeriodText = (status?: string) => {
  if (!status) return '-';
  if (status === 'present') return '出席';
  if (status === 'leave') return '請假';
  if (status === 'absent') return '缺席';
  return '-';
};

/**
 * Generates and downloads a genuine .xlsx Excel workbook for a student's filtered attendance history.
 */
export function buildStudentAttendanceWorkbook(params: StudentAttendanceExportParams): XLSX.WorkBook {
  const { student, records, filterSummary, summaryStats } = params;

  const detailRows = records.map((rec) => {
    const isCancelled = rec.isCancelled || rec.statusSummary.includes('停課');
    return {
      日期: rec.date,
      班級名稱: rec.className,
      課程名稱: rec.courseName,
      排定節數: rec.periodsCount,
      第1節: isCancelled ? '停課' : mapPeriodText(rec.period1),
      第2節: isCancelled ? '停課' : mapPeriodText(rec.period2),
      第3節: isCancelled ? '停課' : rec.periodsCount >= 3 ? mapPeriodText(rec.period3) : '-',
      第4節: isCancelled ? '停課' : rec.periodsCount >= 4 ? mapPeriodText(rec.period4) : '-',
      出席時數: rec.presentHours,
      請假時數: rec.leaveHours,
      缺席時數: rec.absentHours,
      出缺席摘要: rec.statusSummary,
      備註事由: rec.remarks || '',
    };
  });

  const rateText = formatAttendanceRate(summaryStats.attendanceRate, summaryStats.expectedHours > 0);
  const derivedScore =
    summaryStats.attendanceScore !== undefined
      ? summaryStats.attendanceScore
      : summaryStats.expectedHours > 0
      ? Math.round(
          ((summaryStats.presentHours + summaryStats.leaveHours * 0.5) / summaryStats.expectedHours) *
            1000
        ) / 10
      : null;
  const scoreText = formatAttendanceScore(derivedScore, summaryStats.expectedHours > 0);
  const complianceText =
    summaryStats.complianceLabel ||
    (summaryStats.expectedHours === 0 || summaryStats.attendanceRate === null
      ? '未評估'
      : summaryStats.attendanceRate >= 80
      ? '合規'
      : '不合規');

  const summaryRows = [
    { 欄位: '學號', 內容: student.studentNumber || '未設定' },
    { 欄位: '中文姓名', 內容: student.name || '未設定' },
    { 欄位: '英文姓名', 內容: student.englishName || '未設定' },
    { 欄位: '國籍', 內容: student.nationality || '未設定' },
    { 欄位: '目前班級', 內容: student.className || '尚未分班' },
    { 欄位: '註冊起日', 內容: student.registrationStartDate || '未設定' },
    { 欄位: '註冊訖日', 內容: student.registrationEndDate || '未設定' },
    { 欄位: '篩選條件－日期區間', 內容: `${filterSummary.startDate || '不限'} ~ ${filterSummary.endDate || '不限'}` },
    { 欄位: '篩選條件－學期／學年', 內容: filterSummary.termLabel || '全部學期' },
    { 欄位: '篩選條件－班級', 內容: filterSummary.classLabel || '全部班級' },
    { 欄位: '篩選條件－狀態', 內容: filterSummary.statusLabel || '全部狀態' },
    { 欄位: '篩選後堂數', 內容: `${records.length} 堂` },
    { 欄位: '應上課總時數', 內容: `${summaryStats.expectedHours} 小時` },
    { 欄位: '出席總時數', 內容: `${summaryStats.presentHours} 小時` },
    { 欄位: '請假總時數', 內容: `${summaryStats.leaveHours} 小時` },
    { 欄位: '曠課缺席時數', 內容: `${summaryStats.absentHours} 小時` },
    { 欄位: '實際出席率', 內容: rateText },
    { 欄位: '出席成績評分 (請假折半)', 內容: scoreText },
    { 欄位: '簽證合規狀態', 內容: complianceText },
  ];

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(
    detailRows.length > 0
      ? detailRows
      : [{ 日期: '查無符合條件之紀錄', 班級名稱: '', 課程名稱: '', 排定節數: '', 第1節: '', 第2節: '', 第3節: '', 第4節: '', 出席時數: 0, 請假時數: 0, 缺席時數: 0, 出缺席摘要: '', 備註事由: '' }]
  );
  wsDetail['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 22 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 },
    { wch: 28 },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 36 }];

  XLSX.utils.book_append_sheet(wb, wsDetail, '出缺席明細');
  XLSX.utils.book_append_sheet(wb, wsSummary, '彙整統計');
  return wb;
}

export function exportStudentAttendanceToXlsx(params: StudentAttendanceExportParams): void {
  const wb = buildStudentAttendanceWorkbook(params);
  const safeName = `${params.student.studentNumber}_${params.student.name}_出缺席紀錄.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, safeName);
}

/**
 * Generates an Excel (.xlsx) workbook for AdminReportsView covering class progress, student details, and school summary.
 */
export function buildAdminReportsWorkbook(params: AdminReportsExportParams): XLSX.WorkBook {
  const { classRows, studentRows, schoolSummary, filterSummary } = params;

  const classSheetRows = classRows.map((row) => ({
    班級名稱: row.cls.name,
    學期: row.termName,
    授課教師: row.teacherName,
    目前在班人數: row.currentStudentCount,
    期間曾在班人數: row.periodStudentCount,
    已納入出席評估人數: row.evaluatedStudentCount,
    '出席評估樣本 (已納入／期間曾在班)': `已納入 ${row.evaluatedStudentCount}／${row.periodStudentCount} 人`,
    平均出席率: formatAttendanceRate(row.averageAttendanceRate, row.evaluatedStudentCount > 0),
    '已排定時數 (H)': row.progress.scheduledHours,
    '已授課時數 (H)': row.progress.deliveredHours,
    '學期目標時數 (H)': row.progress.targetHours > 0 ? row.progress.targetHours : '未設定',
    待點名堂數: row.progress.pendingAttendanceCount,
    授課進度狀態: row.progress.progressLabel,
    簽證合規狀態: row.complianceLabel,
  }));

  const studentSheetRows = studentRows.map((row) => ({
    學號: row.student.studentNumber,
    姓名: row.student.name,
    英文姓名: row.student.englishName,
    班級: row.scopedClassName,
    期間在班狀態: row.enrollmentScopeLabel,
    '應到時數 (H)': row.expectedHours,
    '出席時數 (H)': row.presentHours,
    '請假時數 (H)': row.leaveHours,
    '缺席時數 (H)': row.absentHours,
    實際出席率: formatAttendanceRate(row.attendanceRate, row.hasAttendanceData),
    出席成績評分: formatAttendanceScore(row.attendanceScore, row.hasAttendanceData),
    簽證合規狀態: row.complianceLabel,
    學期總成績: formatTotalGradeDisplay(row.effectiveGrade),
    成績缺項說明: row.effectiveGrade.missingItems?.join('、') || '',
  }));

  const summarySheetRows = [
    { 統計項目: '篩選條件－學期', 數值: filterSummary?.termLabel || '全部學期' },
    { 統計項目: '篩選條件－班級', 數值: filterSummary?.classLabel || '全部班級' },
    { 統計項目: '篩選條件－日期區間', 數值: `${filterSummary?.startDate || '不限'} ~ ${filterSummary?.endDate || '不限'}` },
    { 統計項目: '篩選班級數', 數值: schoolSummary.classCount },
    { 統計項目: '目前在班人數 (去重)', 數值: `${schoolSummary.currentStudents} 人` },
    { 統計項目: '期間曾在班人數 (去重)', 數值: `${schoolSummary.periodStudents} 人` },
    { 統計項目: '全校平均出席率', 數值: formatAttendanceRate(schoolSummary.averageAttendanceRate, schoolSummary.evaluatedStudents > 0) },
    { 統計項目: '出席評估樣本 (已納入／期間曾在班)', 數值: `已納入 ${schoolSummary.evaluatedStudents}／${schoolSummary.periodStudents} 人` },
    { 統計項目: '未評估人數 (尚無出席資料)', 數值: `${schoolSummary.unevaluatedStudents} 人` },
    { 統計項目: '缺勤預警學員數 (<80%)', 數值: `${schoolSummary.nonCompliantStudents} 人` },
    { 統計項目: '總已排定時數', 數值: `${schoolSummary.totalScheduledHours} H` },
    { 統計項目: '總已授課時數', 數值: `${schoolSummary.totalDeliveredHours} H` },
    { 統計項目: '總學期目標時數', 數值: schoolSummary.totalTargetHours > 0 ? `${schoolSummary.totalTargetHours} H` : '未設定' },
  ];

  const wb = XLSX.utils.book_new();
  const wsClasses = XLSX.utils.json_to_sheet(
    classSheetRows.length > 0 ? classSheetRows : [{ 班級名稱: '查無符合條件之班級' }]
  );
  wsClasses['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wsStudents = XLSX.utils.json_to_sheet(
    studentSheetRows.length > 0 ? studentSheetRows : [{ 學號: '查無符合條件之學員' }]
  );
  wsStudents['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summarySheetRows);
  wsSummary['!cols'] = [{ wch: 32 }, { wch: 32 }];

  XLSX.utils.book_append_sheet(wb, wsClasses, '各班級進度與出席統計');
  XLSX.utils.book_append_sheet(wb, wsStudents, '學員出缺勤與成績明細');
  XLSX.utils.book_append_sheet(wb, wsSummary, '全校彙整');
  return wb;
}

export function exportAdminReportsToXlsx(params: AdminReportsExportParams): void {
  const wb = buildAdminReportsWorkbook(params);
  const timestamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `全校校務出缺勤與成績統計報表_${timestamp}.xlsx`);
}
