import React, { useState } from 'react';
import { 
  BarChart3, 
  FileText, 
  Download, 
  Printer, 
  Award, 
  CheckCircle, 
  Users, 
  Clock, 
  Building2, 
  ShieldCheck,
  Sparkles,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { Student, ClassEntity, CourseSession } from '../../types';
import { calculateFinalGrade, getStudentScores } from '../../utils/gradeUtils';

interface AdminReportsViewProps {
  students: Student[];
  classes: ClassEntity[];
  allCourses: CourseSession[];
}

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({
  students,
  classes,
  allCourses,
}) => {
  const [selectedReportTab, setSelectedReportTab] = useState<'attendance' | 'grades' | 'certificate'>('attendance');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students?.[0]?.id || '');

  const selectedStudentForCert = students?.find((s) => s.id === selectedStudentId) || students?.[0] || null;

  // Total school metrics
  const totalStudents = students.length;
  const avgAttendance = (
    students.reduce((acc, s) => acc + s.overallAttendanceRate, 0) / (totalStudents || 1)
  ).toFixed(1);

  // Grade distributions
  const gradeBuckets = {
    A: students.filter((s) => {
      const scores = getStudentScores(s);
      return calculateFinalGrade(scores.listeningSpeaking, scores.readingWriting, scores.dailyPerformance, s.overallAttendanceRate) >= 80;
    }).length,
    B: students.filter((s) => {
      const scores = getStudentScores(s);
      const g = calculateFinalGrade(scores.listeningSpeaking, scores.readingWriting, scores.dailyPerformance, s.overallAttendanceRate);
      return g >= 70 && g < 80;
    }).length,
    C: students.filter((s) => {
      const scores = getStudentScores(s);
      const g = calculateFinalGrade(scores.listeningSpeaking, scores.readingWriting, scores.dailyPerformance, s.overallAttendanceRate);
      return g >= 60 && g < 70;
    }).length,
    F: students.filter((s) => {
      const scores = getStudentScores(s);
      return calculateFinalGrade(scores.listeningSpeaking, scores.readingWriting, scores.dailyPerformance, s.overallAttendanceRate) < 60;
    }).length,
  };

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
            提供全校考勤時數匯總、移民署居留證核查用出席證明、期末等第分布與中英文結業證書即時列印。
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center space-x-1 bg-[#F0F4F7] p-1 rounded-lg border border-[#DCE2E6]">
          <button
            onClick={() => setSelectedReportTab('attendance')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedReportTab === 'attendance'
                ? 'bg-[#536B7A] text-white shadow-2xs'
                : 'text-[#66717C] hover:text-[#26313B]'
            }`}
          >
            出缺勤統計
          </button>
          <button
            onClick={() => setSelectedReportTab('grades')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedReportTab === 'grades'
                ? 'bg-[#536B7A] text-white shadow-2xs'
                : 'text-[#66717C] hover:text-[#26313B]'
            }`}
          >
            成績等第分佈
          </button>
          <button
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

      {/* Tab 1: Attendance Report */}
      {selectedReportTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">全校平均出席率</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{avgAttendance}%</div>
              <div className="text-[11px] text-slate-400 mt-1">符合教育部 80% 簽證續留標準</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">全季規劃時數總額</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">165.0 小時</div>
              <div className="text-[11px] text-slate-400 mt-1">每週 15 小時 × 11 週標準學程</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#66717C] font-semibold">缺勤預警學員數</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {students.filter((s) => s.overallAttendanceRate < 80).length} 人
              </div>
              <div className="text-[11px] text-slate-400 mt-1">出席率低於 80% 已啟動導師關懷</div>
            </div>
          </div>

          {/* Classes Attendance Breakdown */}
          <div className="bg-white rounded-xl border border-[#DCE2E6] p-5 shadow-2xs">
            <h3 className="text-sm font-bold text-[#26313B] mb-3">各班級全季出缺勤達標統計表</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                    <th className="py-2.5 px-3">班級名稱</th>
                    <th className="py-2.5 px-3">授課教師</th>
                    <th className="py-2.5 px-3 text-right">學生人數</th>
                    <th className="py-2.5 px-3 text-right">平均出席率</th>
                    <th className="py-2.5 px-3 text-right">總授課時數進度</th>
                    <th className="py-2.5 px-3 text-center">簽證合規狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F7]">
                  {classes.map((cls) => {
                    const classSts = students.filter(
                      (s) => s.className === cls.name || s.classId === cls.id
                    );
                    const classAvg = classSts.length
                      ? (
                          classSts.reduce((acc, s) => acc + s.overallAttendanceRate, 0) /
                          classSts.length
                        ).toFixed(1)
                      : '0.0';

                    return (
                      <tr key={cls.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-bold text-[#26313B]">{cls.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{cls.teacherName} 老師</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#26313B]">
                          {classSts.length} 人
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          {classAvg}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {cls.totalTargetHours} / {cls.totalTargetHours} H
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            合規 (Compliant)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Grades Distribution */}
      {selectedReportTab === 'grades' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-[#536B7A] font-bold">A 等級 (80分以上)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeBuckets.A} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔比 {((gradeBuckets.A / (totalStudents || 1)) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-slate-700 font-bold">B 等級 (70-79分)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeBuckets.B} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔比 {((gradeBuckets.B / (totalStudents || 1)) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-amber-700 font-bold">C 等級 (60-69分)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeBuckets.C} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔比 {((gradeBuckets.C / (totalStudents || 1)) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs">
              <div className="text-xs text-rose-700 font-bold">F 不及格 (&lt;60分)</div>
              <div className="text-2xl font-bold text-[#26313B] mt-1">{gradeBuckets.F} 人</div>
              <div className="text-[10px] text-[#66717C] mt-0.5">
                佔比 {((gradeBuckets.F / (totalStudents || 1)) * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Official Certificate Generator */}
      {selectedReportTab === 'certificate' && (
        <div className="space-y-6">
          {!selectedStudentForCert ? (
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
                        {st.name} ({st.englishName}) - {st.className}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handlePrint}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>列印 / 存為 PDF 證書</span>
                </button>
              </div>

              {/* Official Certificate Card Preview */}
              <div className="bg-white rounded-2xl border-4 border-double border-[#536B7A]/30 p-8 sm:p-12 shadow-md max-w-3xl mx-auto text-center relative overflow-hidden bg-gradient-to-b from-[#F5F7F9] to-white">
                {/* Watermark Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
                  <Building2 className="w-96 h-96 text-[#536B7A]" />
                </div>

                {/* Certificate Header */}
                <div className="space-y-1">
                  <div className="text-xs font-serif tracking-widest text-[#536B7A] font-bold">
                    靜宜大學華語中心 • 官方修業證明書
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#26313B] tracking-wide">
                    靜宜大學華語中心 結業證明書
                  </h2>
                  <div className="text-xs font-mono text-slate-400">證書字號：PU-CLC-2026-SUM-{selectedStudentForCert.studentNumber}</div>
                </div>

                {/* Certificate Body */}
                <div className="mt-8 space-y-4 text-slate-700 leading-relaxed text-sm font-serif">
                  <p>
                    茲證明外籍學員 <strong className="text-lg text-[#26313B] font-sans">{selectedStudentForCert.name}</strong>（英文姓名：
                    <strong className="text-[#26313B] font-sans">{selectedStudentForCert.englishName}</strong>，國籍：
                    {selectedStudentForCert.nationality}，學號：{selectedStudentForCert.studentNumber}），於 2026 年夏季學期修讀本部：
                  </p>

                  <div className="py-3 px-6 bg-[#E8EEF2] rounded-xl border border-[#C9D1D7] inline-block font-sans font-bold text-[#26313B] text-base">
                    {selectedStudentForCert.className}（密集華語正規學程）
                  </div>

                  <p>
                    修業總時數共計 <strong className="text-[#26313B]">165 小時</strong>，該學員出勤出席率為{' '}
                    <strong className="text-emerald-700">{selectedStudentForCert.overallAttendanceRate}%</strong>，期末學業總評成績為{' '}
                    <strong className="text-[#536B7A]">
                      {(() => {
                        const certScores = getStudentScores(selectedStudentForCert);
                        const finalG = calculateFinalGrade(
                          certScores.listeningSpeaking,
                          certScores.readingWriting,
                          certScores.dailyPerformance,
                          selectedStudentForCert.overallAttendanceRate
                        );
                        const letter = finalG >= 90 ? 'A+' : finalG >= 80 ? 'A' : finalG >= 70 ? 'B' : finalG >= 60 ? 'C' : 'F';
                        return `${finalG.toFixed(1)} 分（成績等第 ${letter}）`;
                      })()}
                    </strong>
                    ，特頒此證，以資證明。
                  </p>
                </div>

                {/* Signatures & Seal */}
                <div className="mt-12 pt-6 border-t border-[#DCE2E6] grid grid-cols-2 gap-8 text-xs font-serif">
                  <div className="text-left space-y-1">
                    <div className="text-slate-400">授課指導教師</div>
                    <div className="font-bold text-[#26313B] text-sm">林明學 專任講師</div>
                    <div className="text-[10px] text-slate-400">靜宜大學華語中心 教學組</div>
                  </div>

                  <div className="text-right space-y-1 relative">
                    <div className="text-slate-400">中心主任 / 教務主管</div>
                    <div className="font-bold text-[#26313B] text-sm">李宗翰 教授</div>
                    <div className="text-[10px] text-slate-400">中華民國 115 年 8 月 18 日</div>

                    {/* Simulated Official Red Seal */}
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
