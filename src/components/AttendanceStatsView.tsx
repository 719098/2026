import React, { useState, useMemo } from 'react';
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
import { Student, Teacher, ClassEntity } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { InfoTooltip } from './common/InfoTooltip';

interface AttendanceStatsViewProps {
  onShowToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  currentTeacher?: Teacher;
  students?: Student[];
  classes?: ClassEntity[];
}

export const AttendanceStatsView: React.FC<AttendanceStatsViewProps> = ({ 
  onShowToast, 
  currentTeacher,
  students = [],
  classes = []
}) => {
  const [scopeFilter, setScopeFilter] = useState<'my' | 'all'>('my');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');

  const myClasses = useMemo(() => {
    if (!classes || classes.length === 0) return [];
    if (!currentTeacher) return classes;
    const assignedSet = new Set(currentTeacher.assignedClasses || []);
    return classes.filter(c => 
      c.teacherId === currentTeacher.id || 
      c.teacher === currentTeacher.name || 
      assignedSet.has(c.className) || 
      assignedSet.has(c.name)
    );
  }, [classes, currentTeacher]);

  const baseClasses = scopeFilter === 'my' ? myClasses : classes;

  const displayedClasses = useMemo(() => {
    if (!selectedClassId || selectedClassId === 'ALL') return baseClasses;
    return baseClasses.filter(
      c => c.id === selectedClassId || c.className === selectedClassId || c.name === selectedClassId
    );
  }, [baseClasses, selectedClassId]);

  const targetClassIds = useMemo(() => new Set(displayedClasses.map(c => c.id)), [displayedClasses]);
  const targetClassNames = useMemo(() => new Set(displayedClasses.map(c => c.className || c.name)), [displayedClasses]);

  const allStudents = useMemo(() => {
    if (!students || students.length === 0) return [];
    return students.filter(s => targetClassIds.has(s.classId) || targetClassNames.has(s.className));
  }, [students, targetClassIds, targetClassNames]);

  // Warning students (only evaluated students < 90% or < 80%)
  const evaluatedAllStudents = allStudents.filter(
    (s) => s.attendanceEvaluated !== false && s.overallAttendanceRate !== null && s.overallAttendanceRate !== undefined
  );
  const dangerStudents = evaluatedAllStudents.filter((s) => (s.overallAttendanceRate as number) < 80);
  const warningStudents = evaluatedAllStudents.filter(
    (s) => (s.overallAttendanceRate as number) >= 80 && (s.overallAttendanceRate as number) < 90
  );

  const handleSendReminder = (studentName: string) => {
    onShowToast(`已自動寄送出缺勤警示信與輔導提醒至 ${studentName} 的註冊信箱`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>出席率統計與預警名單</span>
              <InfoTooltip
                title="出席率預警標準"
                content="出席率低於 90% 列為密切注意，低於 80% 列為高度風險並通報中心輔導。"
                align="left"
              />
            </h1>
          </div>

          {/* Scope filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs w-full sm:w-auto">
              <button
                onClick={() => setScopeFilter('my')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                  scopeFilter === 'my'
                    ? 'bg-white text-teal-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                我的班級
              </button>
              <button
                onClick={() => setScopeFilter('all')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                  scopeFilter === 'all'
                    ? 'bg-white text-teal-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全中心 ({classes.length})
              </button>
            </div>
          </div>
        </div>

        {/* Class Selection Tabs */}
        {baseClasses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-500 shrink-0 mr-1">班級篩選：</span>
            <button
              id="btn-stat-class-all"
              onClick={() => setSelectedClassId('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                selectedClassId === 'ALL'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              全部班級 ({baseClasses.length})
            </button>
            {baseClasses.map((cls) => {
              const isSelected = selectedClassId === cls.id || selectedClassId === cls.className || selectedClassId === cls.name;
              return (
                <button
                  key={cls.id || cls.name}
                  id={`btn-stat-class-${cls.id}`}
                  onClick={() => setSelectedClassId(cls.id || cls.className || cls.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {cls.className || cls.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Classes Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {displayedClasses.map((cls) => {
            const clsStudents = students.filter(s => s.classId === cls.id || s.className === cls.className || s.className === cls.name);
            const clsEvaluated = clsStudents.filter(
              (s) => s.attendanceEvaluated !== false && s.overallAttendanceRate !== null && s.overallAttendanceRate !== undefined
            );
            const avgRate: number | null = clsEvaluated.length > 0
              ? Math.round((clsEvaluated.reduce((acc, s) => acc + (s.overallAttendanceRate || 0), 0) / clsEvaluated.length) * 10) / 10
              : null;

            return (
              <div key={cls.id || cls.name} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-slate-800 text-sm block">{cls.className || cls.name}</span>
                    {scopeFilter === 'all' && (
                      <span className="text-[10px] text-teal-700 font-semibold">{cls.teacher} 老師</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {clsStudents.length} 位學生（已納入 {clsEvaluated.length} 人）
                  </span>
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className={`text-3xl font-black font-mono ${avgRate === null ? 'text-slate-400' : 'text-teal-700'}`}>
                    {avgRate !== null ? `${avgRate}%` : '—'}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700">平均出席率</span>
                </div>
                <div className="mt-2 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${avgRate ?? 0}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning Alert Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800 flex flex-wrap items-center gap-2">
            <span>出席率預警名單</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
              {warningStudents.length + dangerStudents.length} 位
            </span>
          </h2>
        </div>

        {dangerStudents.length + warningStudents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
            目前無出席率低於 90% 之學生
          </div>
        ) : (
          <>
            {/* Mobile Cards (< md) */}
            <div className="block md:hidden space-y-2.5">
              {[...dangerStudents, ...warningStudents].map((student) => {
                const isDanger = (student.overallAttendanceRate ?? 100) < 80;
                return (
                  <div
                    key={`warn-mobile-${student.id}`}
                    className="rounded-xl border border-slate-200 p-3 space-y-2.5 bg-slate-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-8 h-8 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                          <div className="text-[11px] text-teal-800 font-semibold truncate">
                            {student.className} • {student.nationality}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-md shrink-0 ${
                          isDanger ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {student.overallAttendanceRate}%
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-rose-700 font-bold">缺席 {student.totalAbsenceHours}H</span>
                        <span className="text-blue-700 font-bold">請假 {student.totalLeaveHours}H</span>
                      </div>
                      {isDanger ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                          高度風險 (&lt;80%)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          密切注意 (&lt;90%)
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleSendReminder(student.name)}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center space-x-1 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>發送關懷信</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[680px] text-left border-collapse text-xs">
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
                    const isDanger = (student.overallAttendanceRate ?? 100) < 80;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <StudentAvatar avatarUrl={student.avatarUrl} name={student.name} sizeClassName="w-8 h-8" />
                            <div>
                              <span className="font-extrabold text-slate-900">{student.name}</span>
                              {student.englishName && (
                                <span className="text-slate-500 ml-1 text-[11px]">({student.englishName})</span>
                              )}
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
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 text-white">
                              高度風險 (&lt;80%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              密切注意 (&lt;90%)
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
          </>
        )}
      </div>
    </div>
  );
};
