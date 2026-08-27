import React, { useMemo } from 'react';
import { 
  X, 
  User, 
  Calendar, 
  Clock, 
  Award, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  BookOpen, 
  GraduationCap,
  Percent,
  Calculator,
  ShieldCheck,
  Download
} from 'lucide-react';
import { Student, CourseSession, StudentGrade } from '../types';
import { calculateStudentAttendanceHistory } from '../utils/attendanceUtils';
import { GRADE_WEIGHTS, getLetterGrade } from '../utils/gradeUtils';
import { StudentAvatar } from './StudentAvatar';

interface StudentDetailModalProps {
  student: Student | null;
  allCourses: CourseSession[];
  grade?: StudentGrade;
  teacherName?: string;
  onClose: () => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  allCourses,
  grade,
  teacherName = '林明學老師',
  onClose,
}) => {
  if (!student) return null;

  const history = useMemo(() => {
    return calculateStudentAttendanceHistory(student, allCourses);
  }, [student, allCourses]);

  const letterGrade = grade ? getLetterGrade(grade.totalScore) : null;

  // Grade calculation components
  const attendanceWeighted = grade ? Math.round(grade.attendanceScore * GRADE_WEIGHTS.attendance * 100) / 100 : 0;
  const quizWeighted = grade ? Math.round(grade.quizScore * GRADE_WEIGHTS.quiz * 100) / 100 : 0;
  const midtermWeighted = grade ? Math.round(grade.midtermScore * GRADE_WEIGHTS.midterm * 100) / 100 : 0;
  const finalWeighted = grade ? Math.round(grade.finalScore * GRADE_WEIGHTS.final * 100) / 100 : 0;
  const homeworkWeighted = grade ? Math.round(grade.homeworkScore * GRADE_WEIGHTS.homework * 100) / 100 : 0;
  const attitudeWeighted = grade ? Math.round(grade.attitudeScore * GRADE_WEIGHTS.attitude * 100) / 100 : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative">
          <button
            id="btn-close-student-modal"
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-5">
            <StudentAvatar
              avatarUrl={student.avatarUrl}
              name={student.name}
              sizeClassName="w-20 h-20"
              className="rounded-2xl border-2 border-teal-400/80 shadow-md"
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-white tracking-tight">{student.name}</h2>
                <span className="text-sm font-semibold text-slate-300">({student.englishName})</span>
                <span className="text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded-md">
                  {student.studentNumber}
                </span>
                <span className="text-xs font-bold bg-slate-700 text-slate-200 px-2 py-0.5 rounded-md">
                  {student.nationality}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 mt-2">
                <span className="flex items-center">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5 text-teal-400" />
                  班級：<strong className="text-white ml-1 font-semibold">{student.className}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center">
                  <GraduationCap className="w-3.5 h-3.5 mr-1.5 text-teal-400" />
                  授課教師：<strong className="text-white ml-1 font-semibold">{teacherName}</strong>
                </span>
                <span>•</span>
                <span className="text-slate-400">{student.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* 1. 出席統計 Summary Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>學季出席統計 (2026 夏季班)</span>
              </h3>
              <span className="text-xs font-bold text-slate-500">
                目標總時數：{history.requiredHours || student.totalRequiredHours || 0} 小時
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* 應修時數 */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500">應修總時數</span>
                <div className="text-xl font-black text-slate-900 mt-1 font-mono">{history.requiredHours} <span className="text-xs font-normal">H</span></div>
                <span className="text-[10px] text-slate-400">一整季目標</span>
              </div>

              {/* 已上課時數 */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500">已上課時數</span>
                <div className="text-xl font-black text-slate-900 mt-1 font-mono">{history.completedHours} <span className="text-xs font-normal">H</span></div>
                <span className="text-[10px] text-slate-400">截至今日累積</span>
              </div>

              {/* 出席 */}
              <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-800">出席時數</span>
                <div className="text-xl font-black text-emerald-700 mt-1 font-mono">{history.presentHours} <span className="text-xs font-normal">H</span></div>
                <span className="text-[10px] text-emerald-600 font-medium">實際在堂</span>
              </div>

              {/* 請假 */}
              <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200 shadow-2xs">
                <span className="text-[11px] font-bold text-blue-800">請假時數</span>
                <div className="text-xl font-black text-blue-700 mt-1 font-mono">{history.leaveHours} <span className="text-xs font-normal">H</span></div>
                <span className="text-[10px] text-blue-600 font-medium">核准假單</span>
              </div>

              {/* 缺席 */}
              <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200 shadow-2xs">
                <span className="text-[11px] font-bold text-rose-800">曠課缺席</span>
                <div className="text-xl font-black text-rose-700 mt-1 font-mono">{history.absentHours} <span className="text-xs font-normal">H</span></div>
                <span className="text-[10px] text-rose-600 font-medium">無故未到</span>
              </div>

              {/* 出席率 */}
              <div className={`p-3.5 rounded-2xl border shadow-2xs ${
                history.attendanceRate >= 90
                  ? 'bg-teal-50 border-teal-200 text-teal-900'
                  : history.attendanceRate >= 80
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <span className="text-[11px] font-bold">目前出席率</span>
                <div className="text-2xl font-black mt-0.5 font-mono">{history.attendanceRate}%</div>
                <span className="text-[10px] font-semibold">
                  {history.attendanceRate >= 90 ? '🟢 良好' : history.attendanceRate >= 80 ? '🟡 接近警示線' : '🔴 出席率過低 (<80%)'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. 成績與計算明細 (Grade Calculation Breakdown) */}
          {grade && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                    <Calculator className="w-4 h-4 text-indigo-600" />
                    <span>本季總成績計算明細 (各項佔比 100%)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    出席成績由系統依實際出缺席自動產生；總成績依比例加權即時計算。
                  </p>
                </div>

                <div className="flex items-center space-x-3 bg-slate-900 text-white px-4 py-2 rounded-xl">
                  <span className="text-xs text-slate-300 font-medium">總成績：</span>
                  <span className="text-2xl font-black text-teal-400 font-mono">{grade.totalScore}</span>
                  {letterGrade && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${letterGrade.color}`}>
                      {letterGrade.letter} ({letterGrade.label})
                    </span>
                  )}
                </div>
              </div>

              {/* Detailed Breakdown Calculation Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                {/* 出席 20% */}
                <div className="bg-teal-50/50 p-3 rounded-xl border border-teal-100">
                  <div className="font-bold text-teal-900 flex items-center justify-between">
                    <span>出席成績 (20%)</span>
                    <span className="text-[10px] text-teal-700 font-normal">自動計算</span>
                  </div>
                  <div className="text-base font-extrabold text-teal-950 font-mono mt-1">
                    {grade.attendanceScore} 分
                  </div>
                  <div className="text-[11px] text-teal-700 mt-1 font-mono">
                    {grade.attendanceScore} × 20% = <strong className="text-teal-950 font-bold">{attendanceWeighted}</strong>
                  </div>
                </div>

                {/* 平時考 15% */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">平時考 (15%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">
                    {grade.quizScore} 分
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {grade.quizScore} × 15% = <strong className="text-slate-900 font-bold">{quizWeighted}</strong>
                  </div>
                </div>

                {/* 期中考 20% */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">期中考 (20%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">
                    {grade.midtermScore} 分
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {grade.midtermScore} × 20% = <strong className="text-slate-900 font-bold">{midtermWeighted}</strong>
                  </div>
                </div>

                {/* 期末考 20% */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">期末考 (20%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">
                    {grade.finalScore} 分
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {grade.finalScore} × 20% = <strong className="text-slate-900 font-bold">{finalWeighted}</strong>
                  </div>
                </div>

                {/* 作業 15% */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">作業 (15%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">
                    {grade.homeworkScore} 分
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {grade.homeworkScore} × 15% = <strong className="text-slate-900 font-bold">{homeworkWeighted}</strong>
                  </div>
                </div>

                {/* 學習態度 10% */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-700">學習態度 (10%)</div>
                  <div className="text-base font-extrabold text-slate-900 font-mono mt-1">
                    {grade.attitudeScore} 分
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    {grade.attitudeScore} × 10% = <strong className="text-slate-900 font-bold">{attitudeWeighted}</strong>
                  </div>
                </div>
              </div>

              {/* Formula text */}
              <div className="mt-3.5 bg-slate-100/80 p-2.5 rounded-xl text-xs text-slate-600 font-mono flex items-center justify-between">
                <span>總分公式：{attendanceWeighted} + {quizWeighted} + {midtermWeighted} + {finalWeighted} + {homeworkWeighted} + {attitudeWeighted} = <strong className="text-slate-900">{grade.totalScore}</strong> 分</span>
                <span className="text-[11px] text-slate-400">更新時間：{grade.updatedAt || '2026-08-10'}</span>
              </div>
            </div>
          )}

          {/* 3. 每日詳細點名紀錄 (Daily Detailed Records) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span>每日詳細點名紀錄 ({history.dailyRecords.length} 堂)</span>
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                依日期排序（最近堂次在前）
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">日期</th>
                    <th className="py-2.5 px-3">課程名稱</th>
                    <th className="py-2.5 px-3 text-center">第 1 節</th>
                    <th className="py-2.5 px-3 text-center">第 2 節</th>
                    <th className="py-2.5 px-3 text-center">第 3 節</th>
                    <th className="py-2.5 px-3 text-center">總計</th>
                    <th className="py-2.5 px-3">備註事由</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.dailyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        尚無已完成點名之紀錄
                      </td>
                    </tr>
                  ) : (
                    history.dailyRecords.map((rec, index) => {
                      const is3H = rec.periodsCount === 3;
                      const hasIssue = rec.absentHours > 0 || rec.leaveHours > 0;

                      return (
                        <tr 
                          key={index} 
                          className={`hover:bg-slate-50/80 ${
                            rec.absentHours > 0 
                              ? 'bg-rose-50/30' 
                              : rec.leaveHours > 0 
                              ? 'bg-blue-50/20' 
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                            {rec.date}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {rec.courseName}
                          </td>
                          {/* Period 1 */}
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                              rec.period1 === 'present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rec.period1 === 'leave'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {rec.period1 === 'present' ? '出席' : rec.period1 === 'leave' ? '請假' : '缺席'}
                            </span>
                          </td>
                          {/* Period 2 */}
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                              rec.period2 === 'present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rec.period2 === 'leave'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {rec.period2 === 'present' ? '出席' : rec.period2 === 'leave' ? '請假' : '缺席'}
                            </span>
                          </td>
                          {/* Period 3 */}
                          <td className="py-2.5 px-3 text-center">
                            {is3H ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                                rec.period3 === 'present'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : rec.period3 === 'leave'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {rec.period3 === 'present' ? '出席' : rec.period3 === 'leave' ? '請假' : '缺席'}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono">- (2H班)</span>
                            )}
                          </td>
                          {/* Total */}
                          <td className="py-2.5 px-3 text-center font-semibold">
                            <span className={rec.absentHours > 0 ? 'text-rose-600' : rec.leaveHours > 0 ? 'text-blue-600' : 'text-emerald-600'}>
                              {rec.statusSummary}
                            </span>
                          </td>
                          {/* Remarks */}
                          <td className="py-2.5 px-3 text-slate-500 truncate max-w-[180px]">
                            {rec.remarks || '-'}
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

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            華語教學中心教務管理處 • 學生個人學籍檔案
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
