import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  Users,
  Building2,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import {
  Student,
  ClassEntity,
  CourseSession,
  StudentGrade,
  TransferClassRecord,
  StudentGradeWeight,
  Term,
} from '../../types';
import {
  buildAdminReportData,
  formatAttendanceRate,
  formatAttendanceScore,
  formatTotalGradeDisplay,
  resolveClassTargetHours,
  ClassProgressStatus,
  ComplianceStatus,
} from '../../utils/reportUtils';
import {
  exportAdminReportsClassSummaryToCsv,
  exportAdminReportsStudentDetailToCsv,
} from '../../utils/csvExport';
import { exportAdminReportsToXlsx } from '../../utils/excelExport';
import { calculateStudentAttendanceHistory } from '../../utils/attendanceUtils';
import { getStudentEffectiveGrade } from '../../utils/gradeUtils';

interface AdminReportsViewProps {
  students: Student[];
  classes: ClassEntity[];
  terms?: Term[];
  allCourses: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  transferRecords?: TransferClassRecord[];
  gradeWeightsMap?: Record<string, StudentGradeWeight>;
  onSelectStudentDetail?: (student: Student) => void;
}

const getProgressBadgeStyle = (status: ClassProgressStatus) => {
  switch (status) {
    case 'unscheduled':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'not_started':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'pending_attendance':
      return 'bg-amber-50 text-amber-800 border-amber-300';
    case 'completed':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    default:
      return 'bg-teal-50 text-teal-800 border-teal-200';
  }
};

const getComplianceBadgeStyle = (status: ComplianceStatus) => {
  if (status === 'compliant') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (status === 'non_compliant') {
    return 'bg-rose-50 text-rose-800 border-rose-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({
  students,
  classes,
  terms = [],
  allCourses,
  allGrades = {},
  transferRecords = [],
  gradeWeightsMap = {},
  onSelectStudentDetail,
}) => {
  const [selectedReportTab, setSelectedReportTab] = useState<'attendance' | 'grades' | 'certificate'>('attendance');
  const [selectedTermId, setSelectedTermId] = useState<string>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students?.[0]?.id || '');

  const reportData = useMemo(() => {
    return buildAdminReportData({
      students,
      classes,
      allCourses,
      allGrades,
      transferRecords,
      gradeWeightsMap,
      terms,
      filters: {
        termId: selectedTermId,
        classId: selectedClassId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    });
  }, [
    students,
    classes,
    allCourses,
    allGrades,
    transferRecords,
    gradeWeightsMap,
    terms,
    selectedTermId,
    selectedClassId,
    startDate,
    endDate,
  ]);

  const { filteredClasses, classRows, studentRows, schoolSummary } = reportData;

  const availableClassesForTerm = useMemo(() => {
    if (selectedTermId === 'ALL') return classes;
    const termObj = terms.find((t) => t.id === selectedTermId);
    return classes.filter(
      (c) =>
        (c.termId && c.termId === selectedTermId) ||
        (termObj && c.term === termObj.name)
    );
  }, [classes, terms, selectedTermId]);

  const hasActiveFilters =
    selectedTermId !== 'ALL' ||
    selectedClassId !== 'ALL' ||
    Boolean(startDate) ||
    Boolean(endDate);

  const handleTermFilterChange = (newTermId: string) => {
    setSelectedTermId(newTermId);
    setSelectedClassId('ALL');
  };

  const handleResetFilters = () => {
    setSelectedTermId('ALL');
    setSelectedClassId('ALL');
    setStartDate('');
    setEndDate('');
  };

  const selectedTermLabel =
    selectedTermId === 'ALL'
      ? '全部學期'
      : terms.find((t) => t.id === selectedTermId)?.name || selectedTermId;
  const selectedClassLabel =
    selectedClassId === 'ALL'
      ? '全部班級'
      : classes.find((c) => c.id === selectedClassId || c.name === selectedClassId)?.name || selectedClassId;

  // Grade distribution buckets strictly separating pending (待計算) and provisional (暫估)
  const gradeDistribution = useMemo(() => {
    const totalCount = studentRows.length;
    let score80Plus = 0;
    let score70To79 = 0;
    let score60To69 = 0;
    let scoreBelow60 = 0;
    let pendingCount = 0;
    let estimatedCount = 0;

    studentRows.forEach((row) => {
      const g = row.effectiveGrade;
      if (g.totalScore === null || g.totalScore === undefined) {
        pendingCount++;
        return;
      }
      if (g.isEstimated) {
        estimatedCount++;
      }
      if (g.totalScore >= 80) score80Plus++;
      else if (g.totalScore >= 70) score70To79++;
      else if (g.totalScore >= 60) score60To69++;
      else scoreBelow60++;
    });

    const computedCount = totalCount - pendingCount;
    return {
      totalCount,
      computedCount,
      pendingCount,
      estimatedCount,
      score80Plus,
      score70To79,
      score60To69,
      scoreBelow60,
    };
  }, [studentRows]);

  const selectedStudentForCert =
    students?.find((s) => s.id === selectedStudentId) || students?.[0] || null;

  const certContext = useMemo(() => {
    if (!selectedStudentForCert) return null;
    const cls = classes.find(
      (c) =>
        (selectedStudentForCert.classId && c.id === selectedStudentForCert.classId) ||
        (selectedStudentForCert.className && c.name === selectedStudentForCert.className)
    );
    const termObj = cls
      ? terms.find((t) => (cls.termId && t.id === cls.termId) || (cls.term && t.name === cls.term))
      : undefined;
    const targetHours = resolveClassTargetHours(cls, classes, terms);
    const hist = calculateStudentAttendanceHistory(selectedStudentForCert, allCourses, transferRecords, {
      classes,
      terms,
    });
    const grade = getStudentEffectiveGrade(
      selectedStudentForCert,
      allGrades,
      allCourses,
      transferRecords,
      gradeWeightsMap,
      termObj?.id || cls?.termId,
      cls?.id || selectedStudentForCert.classId
    );
    return {
      cls,
      termName: termObj?.name || cls?.term || '當期學期',
      teacherName: cls?.teacherName ? `${cls.teacherName} 專任教師` : '華語中心教師群',
      targetHours,
      hist,
      grade,
    };
  }, [selectedStudentForCert, classes, terms, allCourses, transferRecords, allGrades, gradeWeightsMap]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">全校校務報表統計與官方證明書生成</h1>
          </div>
          <p className="text-xs text-[#66717C] mt-1">
            依實際排課、點名與核准資料即時統計授課進度、個人出席率、合規狀態與成績分佈（與個人檔案及匯出報表完全一致）。
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center space-x-1 bg-[#F0F4F7] p-1 rounded-lg border border-[#DCE2E6]">
          <button
            type="button"
            onClick={() => setSelectedReportTab('attendance')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedReportTab === 'attendance'
                ? 'bg-[#536B7A] text-white shadow-2xs'
                : 'text-[#66717C] hover:text-[#26313B]'
            }`}
          >
            出缺勤與進度統計
          </button>
          <button
            type="button"
            onClick={() => setSelectedReportTab('grades')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedReportTab === 'grades'
                ? 'bg-[#536B7A] text-white shadow-2xs'
                : 'text-[#66717C] hover:text-[#26313B]'
            }`}
          >
            成績總分分佈
          </button>
          <button
            type="button"
            onClick={() => setSelectedReportTab('certificate')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedReportTab === 'certificate'
                ? 'bg-[#536B7A] text-white shadow-2xs'
                : 'text-[#66717C] hover:text-[#26313B]'
            }`}
          >
            官方結業證明書
          </button>
        </div>
      </div>

      {/* Unified Filter & Export Toolbar (for Attendance & Grades tabs) */}
      {selectedReportTab !== 'certificate' && (
        <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#26313B]">
              <Filter className="w-4 h-4 text-[#536B7A]" />
              <span>報表統計篩選條件</span>
              <span className="text-[11px] font-normal text-[#66717C]">
                （共 {filteredClasses.length} 班 / 目前在班 {schoolSummary.currentStudents} 人・期間曾在班 {schoolSummary.periodStudents} 人）
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportAdminReportsClassSummaryToCsv(classRows)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-[#F8FAFC] text-[#26313B] border border-[#DCE2E6] rounded-lg text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#536B7A]" />
                <span>匯出班級報表 (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => exportAdminReportsStudentDetailToCsv(studentRows)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-[#F8FAFC] text-[#26313B] border border-[#DCE2E6] rounded-lg text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#536B7A]" />
                <span>匯出學員明細 (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportAdminReportsToXlsx({
                    classRows,
                    studentRows,
                    schoolSummary,
                    filterSummary: {
                      termLabel: selectedTermLabel,
                      classLabel: selectedClassLabel,
                      startDate,
                      endDate,
                    },
                  })
                }
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>匯出綜合報表 (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-[#F0F4F7] text-xs">
            <div>
              <label className="block text-[10px] font-bold text-[#66717C] mb-1">學期／學年</label>
              <select
                value={selectedTermId}
                onChange={(e) => handleTermFilterChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-white text-[#26313B] font-semibold"
              >
                <option value="ALL">全部學期</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#66717C] mb-1">班級</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-white text-[#26313B] font-semibold"
              >
                <option value="ALL">全部班級 ({availableClassesForTerm.length})</option>
                {availableClassesForTerm.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#66717C] mb-1">起始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#66717C] mb-1">結束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-base sm:text-xs border border-[#DCE2E6] rounded-lg bg-white font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                className="w-full inline-flex items-center justify-center space-x-1 px-3 py-1.5 text-xs font-semibold text-[#536B7A] bg-[#F8FAFC] hover:bg-[#E8EEF2] border border-[#DCE2E6] rounded-lg disabled:opacity-40 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重設條件</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Attendance & Teaching Progress Report */}
      {selectedReportTab === 'attendance' && (
        <div className="space-y-6">
          {/* 3 Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">全校平均出席率（僅計有效出席樣本）</div>
              <div
                className={`text-2xl font-bold mt-1 font-mono ${
                  schoolSummary.averageAttendanceRate === null
                    ? 'text-slate-500'
                    : schoolSummary.averageAttendanceRate >= 80
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {formatAttendanceRate(schoolSummary.averageAttendanceRate, schoolSummary.evaluatedStudents > 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {schoolSummary.evaluatedStudents > 0 ? (
                  <>
                    出席評估樣本：<strong className="font-mono text-[#26313B]">已納入 {schoolSummary.evaluatedStudents}／{schoolSummary.periodStudents} 人</strong>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      母數為「期間曾在班人數」（目前在班 {schoolSummary.currentStudents} 人・依學生 ID／學號去重；排除 {schoolSummary.unevaluatedStudents} 位尚無出席資料者）
                    </span>
                  </>
                ) : (
                  <>
                    尚無正式出席資料（期間曾在班 {schoolSummary.periodStudents} 人／目前在班 {schoolSummary.currentStudents} 人皆未評估）
                  </>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">課程授課時數進度（區分排課與實授）</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1 font-mono">
                已授課 {schoolSummary.totalDeliveredHours} H
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                已排定 <strong className="font-mono text-[#26313B]">{schoolSummary.totalScheduledHours} H</strong>
                {' ／ '}
                學期目標{' '}
                <strong className="font-mono text-[#26313B]">
                  {schoolSummary.totalTargetHours > 0 ? `${schoolSummary.totalTargetHours} H` : '未設定'}
                </strong>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">缺勤預警學員數 (&lt;80%)</div>
              <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">
                {schoolSummary.nonCompliantStudents} 人
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                僅統計已點名學員；尚無出席資料者（{schoolSummary.unevaluatedStudents} 人）列為「未評估」
              </div>
            </div>
          </div>

          {/* Classes Teaching Progress & Attendance Table */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#26313B]">各班級授課進度與出席統計表</h3>
                <p className="text-[11px] text-[#66717C] mt-0.5">
                  「目前在班人數」與「學生分班與轉班」名冊一致；「期間曾在班人數」依選定學期、日期區間與轉班歷史去重計算；「出席評估樣本」母數 Y 為期間曾在班人數。已排除停課／取消與已調出原堂次。
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">班級名稱</th>
                    <th className="py-2.5 px-3">授課教師</th>
                    <th className="py-2.5 px-3 text-right">目前在班人數</th>
                    <th className="py-2.5 px-3 text-right">期間曾在班人數</th>
                    <th className="py-2.5 px-3 text-right">出席評估樣本</th>
                    <th className="py-2.5 px-3 text-right">平均出席率</th>
                    <th className="py-2.5 px-3 text-right">已排定時數</th>
                    <th className="py-2.5 px-3 text-right">已授課時數</th>
                    <th className="py-2.5 px-3 text-right">學期目標時數</th>
                    <th className="py-2.5 px-3 text-center">授課進度狀態</th>
                    <th className="py-2.5 px-3 text-center">簽證合規狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {classRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        查無符合條件的班級資料
                      </td>
                    </tr>
                  ) : (
                    classRows.map((row) => (
                      <tr key={row.cls.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#26313B]">{row.cls.name}</div>
                          <div className="text-[10px] text-slate-400">{row.termName}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.teacherName}</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="font-bold text-[#26313B]">{row.currentStudentCount} 人</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="font-bold text-[#26313B]">{row.periodStudentCount} 人</span>
                          {row.transferredOutInPeriodCount > 0 && (
                            <div className="text-[10px] text-amber-700 font-sans">
                              含轉出／異動 {row.transferredOutInPeriodCount} 人
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="font-semibold text-[#26313B]">
                            已納入 {row.evaluatedStudentCount}／{row.periodStudentCount} 人
                          </span>
                          <div className="text-[10px] text-slate-400 font-sans">
                            母數：期間曾在班人數
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold ${
                            row.averageAttendanceRate === null
                              ? 'text-slate-500'
                              : row.averageAttendanceRate >= 80
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {formatAttendanceRate(row.averageAttendanceRate, row.evaluatedStudentCount > 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {row.progress.scheduledHours} H
                          <div className="text-[10px] text-slate-400">
                            ({row.progress.scheduledSessionCount} 堂)
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#26313B]">
                          {row.progress.deliveredHours} H
                          <div className="text-[10px] text-slate-400 font-normal">
                            ({row.progress.deliveredSessionCount} 堂已點名)
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {row.progress.targetHours > 0 ? `${row.progress.targetHours} H` : '未設定'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getProgressBadgeStyle(
                              row.progress.progressStatus
                            )}`}
                          >
                            {row.progress.progressLabel}
                            {row.progress.pendingAttendanceCount > 0
                              ? ` (${row.progress.pendingAttendanceCount}堂)`
                              : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getComplianceBadgeStyle(
                              row.complianceStatus
                            )}`}
                          >
                            {row.complianceLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Student Attendance & Grade Detail Table */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#26313B]">學員個人出席統計與合規明細表</h3>
                <p className="text-[11px] text-[#66717C] mt-0.5">
                  與「學生詳細檔案」及匯出報表採用完全一致之計算邏輯；未有正式點名紀錄者顯示「—」、「尚未計算」、「未評估」。
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">學號 / 姓名</th>
                    <th className="py-2.5 px-3">班級</th>
                    <th className="py-2.5 px-3 text-right">應到</th>
                    <th className="py-2.5 px-3 text-right">出席</th>
                    <th className="py-2.5 px-3 text-right">請假</th>
                    <th className="py-2.5 px-3 text-right">缺席</th>
                    <th className="py-2.5 px-3 text-right">實際出席率</th>
                    <th className="py-2.5 px-3 text-right">出席評分</th>
                    <th className="py-2.5 px-3 text-center">簽證合規</th>
                    <th className="py-2.5 px-3 text-right">學期總成績</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {studentRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        查無符合條件的學員資料
                      </td>
                    </tr>
                  ) : (
                    studentRows.map((row) => (
                      <tr
                        key={`${row.student.id}_${row.scopedClassId || ''}`}
                        onClick={() => onSelectStudentDetail?.(row.student)}
                        className={`hover:bg-[#F8FAFC] ${onSelectStudentDetail ? 'cursor-pointer' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#26313B]">{row.student.name}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {row.student.studentNumber} • {row.student.englishName}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-700 font-medium">{row.scopedClassName}</div>
                          <div
                            className={`text-[10px] mt-0.5 ${
                              row.enrollmentScopeStatus === 'current'
                                ? 'text-slate-400'
                                : 'text-amber-700 font-semibold'
                            }`}
                          >
                            {row.enrollmentScopeLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">{row.expectedHours}H</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                          {row.presentHours}H
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700">{row.leaveHours}H</td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-700">{row.absentHours}H</td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold ${
                            !row.hasAttendanceData
                              ? 'text-slate-500'
                              : (row.attendanceRate ?? 0) >= 80
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {formatAttendanceRate(row.attendanceRate, row.hasAttendanceData)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {formatAttendanceScore(row.attendanceScore, row.hasAttendanceData)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getComplianceBadgeStyle(
                              row.complianceStatus
                            )}`}
                          >
                            {row.complianceLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span
                            className={`font-bold ${
                              row.effectiveGrade.totalScore === null
                                ? 'text-slate-500'
                                : row.effectiveGrade.isEstimated
                                ? 'text-amber-700'
                                : 'text-[#26313B]'
                            }`}
                          >
                            {formatTotalGradeDisplay(row.effectiveGrade)}
                          </span>
                          {row.effectiveGrade.missingItems && row.effectiveGrade.missingItems.length > 0 && (
                            <div className="text-[10px] text-amber-700 font-sans">
                              {row.effectiveGrade.missingItems.slice(0, 2).join('、')}
                              {row.effectiveGrade.missingItems.length > 2 ? '…' : ''}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Grades Distribution */}
      {selectedReportTab === 'grades' && (
        <div className="space-y-4">
          {gradeDistribution.estimatedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                注意：目前篩選範圍內有 <strong>{gradeDistribution.estimatedCount}</strong> 位學員含缺項成績（標記為「暫估」），僅以已輸入項目依比例折算。
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#536B7A] font-bold">80 分以上 (優秀)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeDistribution.score80Plus} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔已計分 {gradeDistribution.computedCount > 0 ? ((gradeDistribution.score80Plus / gradeDistribution.computedCount) * 100).toFixed(0) : 0}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-slate-700 font-bold">70 - 79 分 (良好)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeDistribution.score70To79} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔已計分 {gradeDistribution.computedCount > 0 ? ((gradeDistribution.score70To79 / gradeDistribution.computedCount) * 100).toFixed(0) : 0}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-amber-700 font-bold">60 - 69 分 (及格)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeDistribution.score60To69} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔已計分 {gradeDistribution.computedCount > 0 ? ((gradeDistribution.score60To69 / gradeDistribution.computedCount) * 100).toFixed(0) : 0}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-rose-700 font-bold">60 分以下 (不及格)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeDistribution.scoreBelow60} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔已計分 {gradeDistribution.computedCount > 0 ? ((gradeDistribution.scoreBelow60 / gradeDistribution.computedCount) * 100).toFixed(0) : 0}%
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
              <div className="text-xs text-slate-600 font-bold">待計算 (尚無成績)</div>
              <div className="text-2xl font-bold text-slate-700 mt-1">{gradeDistribution.pendingCount} 人</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                未納入及格／分佈計算
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Official Certificate Generator */}
      {selectedReportTab === 'certificate' && (
        <div className="space-y-6">
          {!selectedStudentForCert || !certContext ? (
            <div className="p-12 text-center bg-white rounded-xl border border-[#DCE2E6] text-[#66717C] text-xs">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="font-bold text-[#26313B]">目前資料庫尚無學員資料可供產生修業證明書</div>
              <p className="text-slate-400 mt-1">請先至「學生基本資料管理」建立學員檔案。</p>
            </div>
          ) : (
            <>
              <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs font-bold text-[#26313B] shrink-0">選擇生成學員：</span>
                  <select
                    value={selectedStudentForCert.id}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white font-semibold text-[#26313B] focus:outline-none focus:ring-2 focus:ring-[#536B7A]"
                  >
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.englishName}) - {st.className || '尚未分班'}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>列印 / 存為 PDF 證書</span>
                </button>
              </div>

              {/* Official Certificate Card Preview */}
              <div className="bg-white rounded-2xl border-4 border-double border-[#536B7A]/30 p-8 sm:p-12 shadow-md max-w-3xl mx-auto text-center relative overflow-hidden bg-gradient-to-b from-[#F5F7F9] to-white">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
                  <Building2 className="w-96 h-96 text-[#536B7A]" />
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-serif tracking-widest text-[#536B7A] font-bold">
                    靜宜大學華語中心 • 官方修業證明書
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#26313B] tracking-wide">
                    靜宜大學華語中心 結業證明書
                  </h2>
                  <div className="text-xs font-mono text-slate-400">
                    證書字號：PU-CLC-{selectedStudentForCert.studentNumber}
                  </div>
                </div>

                <div className="mt-8 space-y-4 text-slate-700 leading-relaxed text-sm font-serif">
                  <p>
                    茲證明外籍學員 <strong className="text-lg text-[#26313B] font-sans">{selectedStudentForCert.name}</strong>（英文姓名：
                    <strong className="text-[#26313B] font-sans">{selectedStudentForCert.englishName}</strong>，國籍：
                    {selectedStudentForCert.nationality}，學號：{selectedStudentForCert.studentNumber}），於{' '}
                    {certContext.termName} 修讀本部：
                  </p>

                  <div className="py-3 px-6 bg-[#E8EEF2] rounded-xl border border-[#C9D1D7] inline-block font-sans font-bold text-[#26313B] text-base">
                    {selectedStudentForCert.className || '尚未分班'}
                  </div>

                  <p>
                    該學員累積應上課時數為{' '}
                    <strong className="text-[#26313B]">{certContext.hist.completedHours} 小時</strong>
                    {certContext.targetHours > 0 ? `（學期目標 ${certContext.targetHours} 小時）` : ''}
                    ，實際出席率為{' '}
                    <strong className={certContext.hist.hasAttendanceData ? 'text-emerald-700' : 'text-slate-600'}>
                      {certContext.hist.hasAttendanceData && certContext.hist.attendanceRate !== null
                        ? `${certContext.hist.attendanceRate}%`
                        : '尚無出席資料'}
                    </strong>
                    ，學業總評成績為{' '}
                    <strong className="text-[#536B7A]">
                      {certContext.grade.totalScore === null
                        ? '尚未計算'
                        : `${formatTotalGradeDisplay(certContext.grade)} 分`}
                    </strong>
                    ，特頒此證，以資證明。
                  </p>
                </div>

                <div className="mt-12 pt-6 border-t border-[#DCE2E6] grid grid-cols-2 gap-8 text-xs font-serif">
                  <div className="text-left space-y-1">
                    <div className="text-slate-400">授課指導教師</div>
                    <div className="font-bold text-[#26313B] text-sm">{certContext.teacherName}</div>
                    <div className="text-[10px] text-slate-400">靜宜大學華語中心 教學組</div>
                  </div>

                  <div className="text-right space-y-1 relative">
                    <div className="text-slate-400">中心主任 / 教務主管</div>
                    <div className="font-bold text-[#26313B] text-sm">靜宜大學華語中心</div>
                    <div className="text-[10px] text-slate-400">教務處核發</div>

                    <div className="absolute -top-4 right-16 w-16 h-16 border-2 border-[#536B7A] rounded-lg text-[#536B7A] font-bold text-[9px] flex items-center justify-center rotate-6 opacity-80 pointer-events-none p-1">
                      靜宜大學
                      <br />
                      華語中心
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
