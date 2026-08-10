import React, { useState } from 'react';
import { 
  BarChart3, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Users, 
  TrendingUp, 
  Info,
  Mail,
  FileWarning,
  Building2
} from 'lucide-react';
import { 
  STUDENTS_LEVEL1, 
  STUDENTS_LEVEL2, 
  STUDENTS_LEVEL3,
  STUDENTS_CHEN_CONVERSATION,
  STUDENTS_CHEN_BUSINESS,
  STUDENTS_CHEN_CULTURE
} from '../data/mockData';
import { Teacher } from '../types';

interface AttendanceStatsViewProps {
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  currentTeacher?: Teacher;
}

export const AttendanceStatsView: React.FC<AttendanceStatsViewProps> = ({ onShowToast, currentTeacher }) => {
  const [scopeFilter, setScopeFilter] = useState<'my' | 'all'>('my');

  const isChenTeacher = currentTeacher?.name === '陳靜宜';

  const teacherLinClasses = [
    { name: '初級華語一', students: STUDENTS_LEVEL1, teacher: '林明學' },
    { name: '中級華語二', students: STUDENTS_LEVEL2, teacher: '林明學' },
    { name: '高級華語三', students: STUDENTS_LEVEL3, teacher: '林明學' },
  ];

  const teacherChenClasses = [
    { name: '生活會話一班', students: STUDENTS_CHEN_CONVERSATION, teacher: '陳靜宜' },
    { name: '商務華語實務', students: STUDENTS_CHEN_BUSINESS, teacher: '陳靜宜' },
    { name: '台灣文化與影視欣賞', students: STUDENTS_CHEN_CULTURE, teacher: '陳靜宜' },
  ];

  const activeTeacherClasses = isChenTeacher ? teacherChenClasses : teacherLinClasses;
  const allClasses = [...teacherLinClasses, ...teacherChenClasses];

  const displayedClasses = scopeFilter === 'my' ? activeTeacherClasses : allClasses;
  const allStudents = displayedClasses.flatMap((c) => c.students);

  // Warning students (< 90% or < 80%)
  const dangerStudents = allStudents.filter((s) => s.overallAttendanceRate < 80);
  const warningStudents = allStudents.filter((s) => s.overallAttendanceRate >= 80 && s.overallAttendanceRate < 90);

  const handleSendReminder = (studentName: string) => {
    onShowToast(`已自動寄送出缺勤警示信與輔導提醒至 ${studentName} 的註冊信箱`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 mb-2">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>教育部外籍生居留簽證出席率預警系統 • {currentTeacher ? `${currentTeacher.name} 老師` : ''}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              全班出席率統計與簽證預警名單
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              依教育部華語文教學機構管理規定，外籍學生每期出席率不得低於 <strong>80%</strong>，否則將影響居留證 (ARC) 延期與就學資格。
            </p>
          </div>

          {/* Scope filter */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setScopeFilter('my')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                scopeFilter === 'my'
                  ? 'bg-white text-teal-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              僅看 {currentTeacher?.name || '我'} 的班級
            </button>
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                scopeFilter === 'all'
                  ? 'bg-white text-teal-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全中心 6 個班級
            </button>
          </div>
        </div>

        {/* Classes Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {displayedClasses.map((cls) => {
            const avgRate = Math.round(
              (cls.students.reduce((acc, s) => acc + s.overallAttendanceRate, 0) / cls.students.length) * 10
            ) / 10;

            return (
              <div key={cls.name} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-slate-800 text-sm block">{cls.name}</span>
                    {scopeFilter === 'all' && (
                      <span className="text-[10px] text-teal-700 font-semibold">{cls.teacher} 老師</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{cls.students.length} 位學生</span>
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-teal-700 font-mono">{avgRate}%</span>
                  <span className="text-xs font-semibold text-emerald-700">平均出席率</span>
                </div>
                <div className="mt-2 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${avgRate}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning Alert Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <span>出席率關懷與預警名單</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                共 {warningStudents.length + dangerStudents.length} 位學生需留意
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              出席率低於 90% 之學生建議授課教師予以口頭關心；低於 80% 將通報中心輔導組。
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-4">學生姓名</th>
                <th className="py-3 px-3">所屬班級</th>
                <th className="py-3 px-3">國籍</th>
                <th className="py-3 px-3 text-center">累積缺席時數</th>
                <th className="py-3 px-3 text-center">累積請假時數</th>
                <th className="py-3 px-4 text-center">當前出席率</th>
                <th className="py-3 px-4 text-center">預警層級</th>
                <th className="py-3 px-4 text-right">教師關懷動作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...dangerStudents, ...warningStudents].map((student) => {
                const isDanger = student.overallAttendanceRate < 80;

                return (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <img
                          src={student.avatarUrl}
                          alt={student.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <span className="font-extrabold text-slate-900">{student.name}</span>
                          <span className="text-slate-500 ml-1 text-[11px]">({student.englishName})</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-teal-800">{student.className}</td>
                    <td className="py-3 px-3 text-slate-600">{student.nationality}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-600">
                      {student.totalAbsenceHours} 小時
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-blue-600">
                      {student.totalLeaveHours} 小時
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-mono font-extrabold text-xs px-2 py-1 rounded-lg ${
                        isDanger
                          ? 'bg-rose-100 text-rose-800 font-black'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {student.overallAttendanceRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isDanger ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                          🔴 高度風險 (&lt;80%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          🟡 密切注意 (&lt;90%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleSendReminder(student.name)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center space-x-1 transition-colors"
                      >
                        <Mail className="w-3 h-3 text-slate-500" />
                        <span>發送關懷信</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
