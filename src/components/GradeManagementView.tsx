import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  Save, 
  Download, 
  Users, 
  Sparkles, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Search,
  Filter,
  BarChart3,
  UserX
} from 'lucide-react';
import { Student, StudentGrade, CourseSession } from '../types';
import { GRADE_WEIGHTS, calculateTotalGrade, getLetterGrade } from '../utils/gradeUtils';
import { StudentAvatar } from './StudentAvatar';

interface GradeManagementViewProps {
  students: Student[];
  allCourses: CourseSession[];
  allGrades: Record<string, StudentGrade>;
  onUpdateGrades: (updatedGrades: Record<string, StudentGrade>) => void;
  onSelectStudentForDetail: (student: Student) => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  currentClassName: string;
  onSelectClass: (className: string) => void;
  availableClasses: string[];
}

export const GradeManagementView: React.FC<GradeManagementViewProps> = ({
  students,
  allCourses,
  allGrades,
  onUpdateGrades,
  onSelectStudentForDetail,
  onShowToast,
  currentClassName,
  onSelectClass,
  availableClasses,
}) => {
  const [localGrades, setLocalGrades] = useState<Record<string, StudentGrade>>(allGrades);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sync if allGrades changes from parent
  useEffect(() => {
    setLocalGrades(allGrades);
  }, [allGrades]);

  // If currentClassName is not in availableClasses, auto-sync to the first available class
  useEffect(() => {
    if (availableClasses && availableClasses.length > 0 && !availableClasses.includes(currentClassName)) {
      onSelectClass(availableClasses[0]);
    }
  }, [availableClasses, currentClassName, onSelectClass]);

  // Filter students by selected class
  const classStudents = useMemo(() => {
    return students.filter((s) => s.className === currentClassName || s.classId === currentClassName);
  }, [students, currentClassName]);

  // Filter by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return classStudents;
    const q = searchQuery.toLowerCase();
    return classStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.englishName.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q)
    );
  }, [classStudents, searchQuery]);

  // Handler for numerical input changes
  const handleScoreChange = (
    studentId: string,
    studentName: string,
    field: 'quizScore' | 'midtermScore' | 'finalScore' | 'homeworkScore' | 'attitudeScore',
    valueStr: string
  ) => {
    let val = parseFloat(valueStr);
    if (isNaN(val)) val = 0;
    if (val > 100) val = 100;
    if (val < 0) val = 0;

    setLocalGrades((prev) => {
      const existing = prev[studentId] || {
        studentId,
        studentName,
        className: currentClassName,
        attendanceScore: 100,
        quizScore: 80,
        midtermScore: 80,
        finalScore: 80,
        homeworkScore: 85,
        attitudeScore: 90,
        totalScore: 85,
      };

      const updated = {
        ...existing,
        [field]: val,
      };

      // Recalculate total immediately
      updated.totalScore = calculateTotalGrade(
        updated.attendanceScore,
        updated.quizScore,
        updated.midtermScore,
        updated.finalScore,
        updated.homeworkScore,
        updated.attitudeScore
      );

      return {
        ...prev,
        [studentId]: updated,
      };
    });

    setHasUnsavedChanges(true);
  };

  // Save handler
  const handleSave = () => {
    onUpdateGrades(localGrades);
    setHasUnsavedChanges(false);
    onShowToast(`🎉 已成功儲存【${currentClassName}】全班成績資料！`, 'success');
  };

  // Class Stats Summary
  const classStats = useMemo(() => {
    if (classStudents.length === 0) return { avgTotal: 0, passCount: 0, failCount: 0 };
    let sum = 0;
    let pass = 0;
    let fail = 0;

    classStudents.forEach((s) => {
      const g = localGrades[s.id];
      const total = g ? g.totalScore : 0;
      sum += total;
      if (total >= 60) pass++;
      else fail++;
    });

    return {
      avgTotal: Math.round((sum / classStudents.length) * 10) / 10,
      passCount: pass,
      failCount: fail,
    };
  }, [classStudents, localGrades]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['學號', '姓名', '英文姓名', '班級', '出席成績(20%)', '平時考(15%)', '期中考(20%)', '期末考(20%)', '作業(15%)', '學習態度(10%)', '總成績', '等第'];
    const rows = classStudents.map((s) => {
      const g = localGrades[s.id] || {
        attendanceScore: 0,
        quizScore: 0,
        midtermScore: 0,
        finalScore: 0,
        homeworkScore: 0,
        attitudeScore: 0,
        totalScore: 0,
      };
      const letter = getLetterGrade(g.totalScore).letter;
      return [
        s.studentNumber,
        s.name,
        s.englishName,
        s.className,
        g.attendanceScore,
        g.quizScore,
        g.midtermScore,
        g.finalScore,
        g.homeworkScore,
        g.attitudeScore,
        g.totalScore,
        letter,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentClassName}_2026夏季班成績單.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`已匯出 ${currentClassName} 成績報表 (CSV)`, 'success');
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 uppercase tracking-wider">
                成績管理系統
              </span>
              <span className="text-xs font-semibold text-slate-500">2026 夏季班 (Summer Quarter)</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center space-x-3">
              <span>學生成績管理與評量</span>
              <span className="text-sm font-bold bg-teal-600 text-white px-2.5 py-1 rounded-lg">
                {currentClassName}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              出席成績由系統依學生實際出缺席自動產生；輸入各項成績後，總成績將依教育部華語中心標準比例即時更新。
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-export-grades"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>匯出成績單 (CSV)</span>
            </button>

            <button
              id="btn-save-grades"
              onClick={handleSave}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-md ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{hasUnsavedChanges ? '儲存修改成績 *' : '儲存成績單'}</span>
            </button>
          </div>
        </div>

        {/* Class Switcher Tabs */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-500 shrink-0 mr-1">切換班級：</span>
          {availableClasses.map((cls) => {
            const isSelected = cls === currentClassName;
            return (
              <button
                key={cls}
                id={`btn-class-${cls}`}
                onClick={() => onSelectClass(cls)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {cls}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grade Calculation Formula Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
          <div>
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
              華語中心官方成績計算比例 (總和 100%)
            </span>
            <div className="text-sm font-semibold text-slate-300 mt-1">
              總成績 = 出席 × 20% + 平時考 × 15% + 期中考 × 20% + 期末考 × 20% + 作業 × 15% + 態度 × 10%
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400">班級平均分：</span>
              <strong className="text-teal-400 font-bold text-sm ml-1">{classStats.avgTotal}</strong>
            </div>
            <div className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400">及格人數：</span>
              <strong className="text-emerald-400 font-bold text-sm ml-1">{classStats.passCount} / {classStudents.length}</strong>
            </div>
          </div>
        </div>

        {/* 6 Metric Weights Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-4 text-xs">
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-teal-500/30">
            <div className="text-teal-400 font-bold">1. 出席成績 (20%)</div>
            <div className="text-[11px] text-slate-300 mt-0.5">系統依出缺席自動計分</div>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="text-slate-200 font-bold">2. 平時測驗 (15%)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">聽寫/單元小考 (0~100)</div>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="text-slate-200 font-bold">3. 期中考試 (20%)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">筆試與口試 (0~100)</div>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="text-slate-200 font-bold">4. 期末考試 (20%)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">學季總結評量 (0~100)</div>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="text-slate-200 font-bold">5. 作業習作 (15%)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">課後作業/錄音 (0~100)</div>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="text-slate-200 font-bold">6. 學習態度 (10%)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">課堂參與/發言 (0~100)</div>
          </div>
        </div>
      </div>

      {/* Grade Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search bar inside table */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
            <Users className="w-4 h-4 text-teal-600" />
            <span>全班學生名冊 ({filteredStudents.length} 人)</span>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="搜尋學生姓名 / 學號..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-3 w-10 text-center">#</th>
                <th className="py-3.5 px-4 min-w-[180px]">學生姓名 / 學號</th>
                <th className="py-3.5 px-3 text-center min-w-[120px]">
                  <div className="text-teal-700">出席 (20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">系統自動計算</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>平時考 (15%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>期中考 (20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>期末考 (20%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>作業 (15%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">
                  <div>學習態度 (10%)</div>
                  <div className="text-[10px] font-normal text-slate-500">0~100 分</div>
                </th>
                <th className="py-3.5 px-4 text-center min-w-[120px] bg-slate-100/70">
                  <div className="text-slate-900">總成績 (100%)</div>
                  <div className="text-[10px] font-normal text-slate-600">即時加權總分</div>
                </th>
                <th className="py-3.5 px-3 text-center w-20">詳細</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.map((student, index) => {
                const grade = localGrades[student.id] || {
                  studentId: student.id,
                  studentName: student.name,
                  className: currentClassName,
                  attendanceScore: Math.min(100, Math.round(student.overallAttendanceRate * 10) / 10),
                  quizScore: 85,
                  midtermScore: 80,
                  finalScore: 85,
                  homeworkScore: 90,
                  attitudeScore: 90,
                  totalScore: 86.5,
                };

                const letter = getLetterGrade(grade.totalScore);

                return (
                  <tr
                    key={student.id}
                    id={`grade-row-${student.id}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center font-mono text-slate-400 font-semibold">
                      {index + 1}
                    </td>

                    {/* Student Profile */}
                    <td className="py-3 px-4">
                      <div 
                        onClick={() => onSelectStudentForDetail(student)}
                        className="flex items-center space-x-3 cursor-pointer group"
                      >
                        <StudentAvatar 
                          avatarUrl={student.avatarUrl} 
                          name={student.name} 
                          sizeClassName="w-9 h-9" 
                          className="group-hover:ring-2 group-hover:ring-teal-500 transition-all"
                        />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-extrabold text-slate-900 text-sm group-hover:text-teal-700 transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">{student.englishName}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono">{student.studentNumber}</span>
                            <span>•</span>
                            <span className="text-slate-600">{student.nationality}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 1. 出席成績 (自動計算, 不可直接編輯) */}
                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex flex-col items-center justify-center bg-teal-50/80 border border-teal-200 px-3 py-1.5 rounded-xl">
                        <span className="font-mono font-black text-sm text-teal-900">
                          {grade.attendanceScore}
                        </span>
                        <span className="text-[10px] text-teal-700 font-medium">
                          佔 {Math.round(grade.attendanceScore * 0.2 * 10) / 10} 分
                        </span>
                      </div>
                    </td>

                    {/* 2. 平時考 (15%) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        id={`input-quiz-${student.id}`}
                        value={grade.quizScore}
                        onChange={(e) => handleScoreChange(student.id, student.name, 'quizScore', e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-center font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                      />
                    </td>

                    {/* 3. 期中考 (20%) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        id={`input-midterm-${student.id}`}
                        value={grade.midtermScore}
                        onChange={(e) => handleScoreChange(student.id, student.name, 'midtermScore', e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-center font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                      />
                    </td>

                    {/* 4. 期末考 (20%) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        id={`input-final-${student.id}`}
                        value={grade.finalScore}
                        onChange={(e) => handleScoreChange(student.id, student.name, 'finalScore', e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-center font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                      />
                    </td>

                    {/* 5. 作業 (15%) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        id={`input-homework-${student.id}`}
                        value={grade.homeworkScore}
                        onChange={(e) => handleScoreChange(student.id, student.name, 'homeworkScore', e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-center font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                      />
                    </td>

                    {/* 6. 學習態度 (10%) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        id={`input-attitude-${student.id}`}
                        value={grade.attitudeScore}
                        onChange={(e) => handleScoreChange(student.id, student.name, 'attitudeScore', e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-center font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                      />
                    </td>

                    {/* 總成績 (即時更新) */}
                    <td className="py-3 px-4 text-center bg-slate-50/70">
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-mono font-black text-base text-slate-900">
                          {grade.totalScore}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border mt-0.5 ${letter.color}`}>
                          {letter.letter} ({letter.label})
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onSelectStudentForDetail(student)}
                        title="查看學生個人出席與成績詳細計算"
                        className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <UserX className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="font-bold text-sm text-slate-700">【{currentClassName}】查無符合條件之學生名單</p>
                    <p className="text-xs text-slate-400 mt-1">請嘗試切換上方班級標籤或清除搜尋關鍵字</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
