import React, { useState } from 'react';
import { 
  Award, 
  Search, 
  Download, 
  Filter, 
  FileSpreadsheet,
  Sliders,
  CheckCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { Student, ClassEntity } from '../../types';
import { calculateFinalGrade, calculatePerformanceScore, getStudentScores } from '../../utils/gradeUtils';
import { exportGradesToCsv } from '../../utils/csvExport';
import { InfoTooltip } from '../common/InfoTooltip';
import { BatchActionBar, BatchActionItem } from '../common/BatchActionBar';

interface AdminGradesManagementViewProps {
  students: Student[];
  classes: ClassEntity[];
  onSelectStudentDetail: (student: Student) => void;
}

export const AdminGradesManagementView: React.FC<AdminGradesManagementViewProps> = ({
  students,
  classes,
  onSelectStudentDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedGradeBandFilter, setSelectedGradeBandFilter] = useState('ALL');

  // Batch selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Helper to compute attendance grade score (50% leave weighting)
  const getAttendanceScore = (s: Student) => {
    const total = (s.totalPresentHours || 0) + (s.totalLeaveHours || 0) + (s.totalAbsenceHours || 0);
    if (total > 0) {
      const earned = (s.totalPresentHours || 0) * 1.0 + (s.totalLeaveHours || 0) * 0.5;
      return Math.round((earned / total) * 1000) / 10;
    }
    return s.overallAttendanceRate ?? 100;
  };

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchSearch =
      s.name.includes(searchTerm) ||
      s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentNumber.includes(searchTerm);
    const matchClass = selectedClassFilter === 'ALL' || s.className === selectedClassFilter;
    
    // Final score calculation
    const scores = getStudentScores(s);
    const attendanceScore = getAttendanceScore(s);
    const finalScore = calculateFinalGrade(
      scores.listeningSpeaking,
      scores.readingWriting,
      scores.dailyPerformance,
      attendanceScore
    );

    let matchBand = true;
    if (selectedGradeBandFilter === 'A') matchBand = finalScore >= 80;
    if (selectedGradeBandFilter === 'B') matchBand = finalScore >= 70 && finalScore < 80;
    if (selectedGradeBandFilter === 'PASS') matchBand = finalScore >= 60;
    if (selectedGradeBandFilter === 'FAIL') matchBand = finalScore < 60;

    return matchSearch && matchClass && matchBand;
  });

  const handleToggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    if (filteredStudents.length === 0) return;
    const allSelected = filteredStudents.every((s) => selectedStudentIds.has(s.id));
    if (allSelected) {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedStudentIds(new Set());
  };

  const handleExportAllCSV = () => {
    exportGradesToCsv(filteredStudents);
  };

  const handleBatchExportCSV = () => {
    const targets = filteredStudents.filter((s) => selectedStudentIds.has(s.id));
    if (targets.length === 0) return;
    exportGradesToCsv(targets, `學員成績冊_選取_${targets.length}人`);
  };

  const batchActions: BatchActionItem[] = [
    {
      key: 'batch-export',
      label: `匯出選取成績 (${selectedStudentIds.size}人)`,
      icon: <Download className="w-4 h-4" />,
      variant: 'primary',
      onClick: handleBatchExportCSV,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-[#DCE2E6] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-[#536B7A]" />
            <h1 className="text-lg font-bold text-[#26313B]">學員期末成績與等第總評</h1>
            <InfoTooltip
              title="學期成績結算標準"
              content="成績權重公式：聽說 40% + 讀寫 40% + 平時 20%（平時成績包含 50% 考勤出席率與 50% 課堂綜合表現）。"
            />
          </div>
        </div>

        <button
          onClick={handleExportAllCSV}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#536B7A] hover:bg-[#455865] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>匯出全校成績冊 (CSV)</span>
        </button>
      </div>

      {/* Grade Formula Specs Banner */}
      <div className="bg-[#F8FAFC] border border-[#DCE2E6] rounded-xl p-3.5 text-xs text-[#26313B] shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-[#536B7A]" />
            <span className="font-bold">中心標準評分標準 (Official Grading Standards)：</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🗣️ 聽力與口語：<strong>40%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📖 閱讀與寫作：<strong>40%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📝 平時考核：<strong>20%</strong> (出席 50% + 平時 50%)
            </span>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#DCE2E6] shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋學號 / 姓名 / 英文名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#DCE2E6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#536B7A] focus:border-[#536B7A] bg-white text-[#26313B]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部班級名冊</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedGradeBandFilter}
            onChange={(e) => setSelectedGradeBandFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#DCE2E6] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#536B7A] font-semibold text-[#26313B]"
          >
            <option value="ALL">全部成績區間</option>
            <option value="A">優異 A 等級 (80分以上)</option>
            <option value="B">良好 B 等級 (70-79分)</option>
            <option value="PASS">及格 PASS (60分以上)</option>
            <option value="FAIL">不及格預警 (&lt; 60分)</option>
          </select>
        </div>
      </div>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedStudentIds.size}
        totalCount={filteredStudents.length}
        onClearSelection={handleClearSelection}
        onSelectAllCurrentPage={handleSelectAllCurrentPage}
        isAllSelected={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))}
        actions={batchActions}
      />

      {/* Grades Table */}
      <div className="bg-white rounded-xl border border-[#DCE2E6] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#66717C] font-semibold border-b border-[#DCE2E6]">
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))}
                    onChange={handleSelectAllCurrentPage}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    title={filteredStudents.every((s) => selectedStudentIds.has(s.id)) ? '取消全選' : '全選目前頁面'}
                  />
                </th>
                <th className="py-3 px-4">學號 / 姓名</th>
                <th className="py-3 px-3">所屬班級</th>
                <th className="py-3 px-3 text-right">聽說 (40%)</th>
                <th className="py-3 px-3 text-right">讀寫 (40%)</th>
                <th className="py-3 px-3 text-right">平時綜合 (20%)</th>
                <th className="py-3 px-3 text-right">出席率折算</th>
                <th className="py-3 px-3 text-right">學期總成績</th>
                <th className="py-3 px-4 text-center">評定等第</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F7]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#66717C] text-xs">
                    查無學員成績紀錄
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const studentScores = getStudentScores(student);
                  const finalScore = calculateFinalGrade(
                    studentScores.listeningSpeaking,
                    studentScores.readingWriting,
                    studentScores.dailyPerformance,
                    getAttendanceScore(student)
                  );
                  const isSelected = selectedStudentIds.has(student.id);

                  let badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  let gradeLetter = 'A';
                  if (finalScore >= 90) {
                    gradeLetter = 'A+';
                    badgeColor = 'bg-[#E8EEF2] text-[#536B7A] border-[#C9D1D7]';
                  } else if (finalScore >= 80) {
                    gradeLetter = 'A';
                    badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  } else if (finalScore >= 70) {
                    gradeLetter = 'B';
                    badgeColor = 'bg-slate-100 text-slate-800 border-slate-300';
                  } else if (finalScore >= 60) {
                    gradeLetter = 'C';
                    badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                  } else {
                    gradeLetter = 'F (不及格)';
                    badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                  }

                  return (
                    <tr
                      key={student.id}
                      className={`hover:bg-[#F8FAFC] transition-colors ${isSelected ? 'bg-teal-50/40' : ''}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectStudent(student.id)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                          title={`選取學員 ${student.name}`}
                        />
                      </td>

                      <td 
                        className="py-3 px-4 cursor-pointer hover:underline"
                        onClick={() => onSelectStudentDetail(student)}
                      >
                        <div className="font-bold text-[#26313B]">{student.name}</div>
                        <div className="text-[10px] text-[#66717C] font-mono">
                          {student.studentNumber} • {student.englishName}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {student.className}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {studentScores.listeningSpeaking.toFixed(1)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {studentScores.readingWriting.toFixed(1)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {studentScores.dailyPerformance.toFixed(1)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        {student.overallAttendanceRate}%
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B] text-sm">
                        {finalScore.toFixed(1)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold border ${badgeColor}`}>
                          {gradeLetter}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
