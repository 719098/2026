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
import { Student, ClassEntity, StudentGrade, CourseSession, TransferClassRecord } from '../../types';
import { getStudentEffectiveGrade, getLetterGrade } from '../../utils/gradeUtils';
import { exportGradesToCsv } from '../../utils/csvExport';
import { InfoTooltip } from '../common/InfoTooltip';
import { BatchActionBar, BatchActionItem } from '../common/BatchActionBar';

interface AdminGradesManagementViewProps {
  students: Student[];
  classes: ClassEntity[];
  allCourses?: CourseSession[];
  allGrades?: Record<string, StudentGrade>;
  transferRecords?: TransferClassRecord[];
  onSelectStudentDetail: (student: Student) => void;
}

export const AdminGradesManagementView: React.FC<AdminGradesManagementViewProps> = ({
  students,
  classes,
  allCourses = [],
  allGrades = {},
  transferRecords = [],
  onSelectStudentDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedGradeBandFilter, setSelectedGradeBandFilter] = useState('ALL');

  // Batch selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchSearch =
      s.name.includes(searchTerm) ||
      s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentNumber.includes(searchTerm);
    const matchClass = selectedClassFilter === 'ALL' || s.className === selectedClassFilter;
    
    // Unified effective grade calculation
    const grade = getStudentEffectiveGrade(s, allGrades, allCourses, transferRecords);
    const finalScore = grade.totalScore;

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
    exportGradesToCsv(filteredStudents, '全校學員期末成績冊', allGrades, allCourses, transferRecords);
  };

  const handleBatchExportCSV = () => {
    const targets = filteredStudents.filter((s) => selectedStudentIds.has(s.id));
    if (targets.length === 0) return;
    exportGradesToCsv(targets, `學員成績冊_選取_${targets.length}人`, allGrades, allCourses, transferRecords);
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
              content="成績權重公式：出席成績 20% + 平時測驗 15% + 期中考試 20% + 期末考試 20% + 作業習作 15% + 學習態度 10%。出席成績依各堂實際出缺勤即時折算（停課堂次自動排除不計）。"
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
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🕒 出席成績：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              ✏️ 平時測驗：<strong>15%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📝 期中考試：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🎓 期末考試：<strong>20%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              📚 作業習作：<strong>15%</strong>
            </span>
            <span className="bg-white px-2.5 py-1 rounded-md border border-[#DCE2E6] font-semibold text-[#536B7A]">
              🌟 學習態度：<strong>10%</strong>
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
                <th className="py-3 px-4 min-w-[140px]">學號 / 姓名</th>
                <th className="py-3 px-3 min-w-[100px]">所屬班級</th>
                <th className="py-3 px-3 text-right min-w-[90px]">出席 (20%)</th>
                <th className="py-3 px-3 text-right min-w-[85px]">平時 (15%)</th>
                <th className="py-3 px-3 text-right min-w-[85px]">期中 (20%)</th>
                <th className="py-3 px-3 text-right min-w-[85px]">期末 (20%)</th>
                <th className="py-3 px-3 text-right min-w-[85px]">作業 (15%)</th>
                <th className="py-3 px-3 text-right min-w-[85px]">態度 (10%)</th>
                <th className="py-3 px-3 text-right min-w-[100px]">學期總成績</th>
                <th className="py-3 px-4 text-center min-w-[100px]">評定等第</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F7]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#66717C] text-xs">
                    查無學員成績紀錄
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const grade = getStudentEffectiveGrade(student, allGrades, allCourses, transferRecords);
                  const letter = getLetterGrade(grade.totalScore);
                  const isSelected = selectedStudentIds.has(student.id);

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

                      <td className="py-3 px-3 text-right font-mono font-bold text-teal-700">
                        {grade.attendanceScore}%
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {grade.quizScore}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {grade.midtermScore}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {grade.finalScore}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {grade.homeworkScore}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-[#26313B]">
                        {grade.attitudeScore}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-extrabold text-[#26313B] text-sm">
                        {grade.totalScore}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold border ${letter.color}`}>
                          {letter.letter} ({letter.label})
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
