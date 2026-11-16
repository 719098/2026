import * as XLSX from 'xlsx';
import { DailyAttendanceRecord, Student } from '../types';

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
    attendanceRate: number;
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
    { 欄位: '實際出席率', 內容: `${summaryStats.attendanceRate}%` },
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
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 36 }];

  XLSX.utils.book_append_sheet(wb, wsDetail, '出缺席明細');
  XLSX.utils.book_append_sheet(wb, wsSummary, '彙整統計');
  return wb;
}

export function exportStudentAttendanceToXlsx(params: StudentAttendanceExportParams): void {
  const wb = buildStudentAttendanceWorkbook(params);
  const safeName = `${params.student.studentNumber}_${params.student.name}_出缺席紀錄.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, safeName);
}
